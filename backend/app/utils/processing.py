import cv2
import numpy as np
import base64
import logging
import gc
import psutil
from typing import List, Dict, Any
from ..dependencies import get_face_recognition
from ..utils.time_utils import get_local_date, get_local_time, convert_to_local_time
from datetime import datetime, timedelta
from ..database import query as db_query
from ..database import create, update
from ..services.send_email import send_entry_notification, send_exit_notification,send_late_entry_notification, send_early_exit_notification
from ..models import Attendance

logger = logging.getLogger(__name__)

# Configuration for auto-exit detection (in seconds)
AUTO_EXIT_THRESHOLD = 10  # Time in seconds to consider a re-detection as an exit

# Memory management configuration
MAX_IMAGE_DIMENSION = 640  # Reduced from 1024 to 640 for memory savings
MIN_AVAILABLE_MEMORY_PERCENT = 15  # Minimum free memory required
MEMORY_WARNING_PERCENT = 85  # Threshold for warning about high memory usage

def check_memory_usage():
    """Check current memory usage and return memory statistics"""
    try:
        memory = psutil.virtual_memory()
        if memory.percent > MEMORY_WARNING_PERCENT:
            logger.warning(f"High memory usage detected: {memory.percent}% used, {memory.available/(1024*1024):.2f} MB available")
        return {
            "percent_used": memory.percent,
            "available_mb": memory.available/(1024*1024),
            "is_critical": memory.percent > (100 - MIN_AVAILABLE_MEMORY_PERCENT)
        }
    except Exception as e:
        logger.error(f"Error checking memory: {str(e)}")
        return {"percent_used": 0, "available_mb": 0, "is_critical": False}

def cleanup_resources():
    """Force garbage collection and memory cleanup"""
    try:
        # Run garbage collection twice for better memory recovery
        gc.collect()
        gc.collect()
        logger.debug("Memory cleanup performed")
    except Exception as e:
        logger.error(f"Error during memory cleanup: {str(e)}")

def process_attendance_for_employee(employee: Dict[str, Any], similarity: float, entry_type: str):
    """Process attendance for an employee with consistent duplicate checking and auto-exit"""
    # Check memory before processing
    memory_status = check_memory_usage()
    if memory_status["is_critical"]:
        logger.warning(f"Critical memory state: {memory_status['percent_used']}% used, postponing processing")
        return {
            "processed_employee": {"message": "System under high load, please try again later"},
            "attendance_update": None
        }

    try:
        # Check if attendance already marked for today
        today = get_local_date()
        today_start = datetime.combine(today, datetime.min.time())
        today_start = convert_to_local_time(today_start)
        today_end = datetime.combine(today, datetime.max.time())
        today_end = convert_to_local_time(today_end)

        # Get any existing attendance record for today
        existing_attendance = db_query("Attendance", 
            where={
                "employee_id": employee.get("employee_id"),
                "timestamp": {
                    "$gte": {"__type": "Date", "iso": today_start.isoformat()},
                    "$lte": {"__type": "Date", "iso": today_end.isoformat()}
                }
            },
            limit=1
        )
        
        existing_attendance = existing_attendance[0] if existing_attendance else None
        current_time = get_local_time()
        
        # Format similarity to 2 decimal places
        rounded_similarity = round(similarity, 2)
        
        # Create Attendance model instance for using its methods
        attendance_model = Attendance()

        result = {
            "processed_employee": None,
            "attendance_update": None
        }
        
        # Ensure we have employee_name for consistent output
        employee_name = employee.get("name", "Unknown")
        # Log a warning if name is missing
        if employee_name == "Unknown" and employee.get("employee_id"):
            logger.warning(f"Employee with ID {employee.get('employee_id')} has no name.")

        # We only process as "entry" type now since frontend always sends entry
        # But we'll handle auto-exit detection internally
        if existing_attendance:
            # Check if there's already an entry without exit
            if not existing_attendance.get("exit_time"):
                # Get the entry timestamp
                entry_time_str = existing_attendance.get("timestamp", {}).get("iso")
                if entry_time_str:
                    entry_time = datetime.fromisoformat(entry_time_str.replace('Z', '+00:00'))
                    time_diff = current_time - entry_time
                    
                    # If more than AUTO_EXIT_THRESHOLD seconds have passed, mark as exit
                    if time_diff.total_seconds() > AUTO_EXIT_THRESHOLD:
                        logger.info(f"Auto-exit triggered for {employee_name} (ID: {employee.get('employee_id')}) after {time_diff.total_seconds()} seconds")
                        
                        # Process exit logic using the new Attendance model method
                        is_early_exit, early_exit_message = attendance_model.check_early_exit(
                            employee.get("employee_id"), 
                            exit_time=current_time
                        )
                        
                        # Update the existing attendance record with exit time
                        update("Attendance", existing_attendance.get("objectId"), {
                            "exit_time": {
                                "__type": "Date",
                                "iso": current_time.isoformat()
                            },
                            "is_early_exit": is_early_exit,
                            "early_exit_reason": early_exit_message if is_early_exit else None,
                            "early_exit_message": early_exit_message if is_early_exit else None,
                            "confidence": max(existing_attendance.get("confidence", 0), rounded_similarity),
                            "updated_at": {
                                "__type": "Date",
                                "iso": current_time.isoformat()
                            }
                        })
                        
                        # Prepare data for email notification
                        notification_data = {
                            "name": employee_name,
                            "employee_id": employee.get("employee_id"),
                            "employee_name": employee_name,
                            "timestamp": current_time.isoformat(),
                            "similarity": rounded_similarity,
                            "is_early_exit": is_early_exit,
                            "early_exit_message": early_exit_message,
                            "early_exit_reason": early_exit_message,
                            "entry_time": entry_time_str,
                            "exit_time": current_time.isoformat(),
                            "objectId": existing_attendance.get("objectId")
                        }
                        
                        # Send exit notification with complete data
                        send_exit_notification(notification_data, employee.get("email"))
                        
                        # If early exit, also send early exit notification
                        if is_early_exit:
                            send_early_exit_notification(notification_data, employee.get("email"))

                        attendance_data = {
                            "action": "exit",
                            "employee_id": employee.get("employee_id"),
                            "employee_name": employee_name,
                            "name": employee_name,  # Explicitly include name for frontend
                            "timestamp": current_time.isoformat(),
                            "similarity": rounded_similarity,
                            "is_early_exit": is_early_exit,
                            "early_exit_message": early_exit_message,
                            "early_exit_reason": early_exit_message,
                            "entry_time": entry_time_str,
                            "exit_time": current_time.isoformat(),
                            "objectId": existing_attendance.get("objectId")
                        }

                        result["processed_employee"] = {
                            **attendance_data, 
                            "message": "Auto-exit marked successfully", 
                            "name": employee_name
                        }
                        result["attendance_update"] = attendance_data
                        
                        return result
                    else:
                        # If it's been less than the threshold, just update confidence
                        update("Attendance", existing_attendance.get("objectId"), {
                            "confidence": max(existing_attendance.get("confidence", 0), rounded_similarity),
                            "updated_at": {
                                "__type": "Date",
                                "iso": current_time.isoformat()
                            }
                        })
                        
                        # Create a response without creating a new database entry
                        attendance_data = {
                            "action": "update",  # Changed from "entry" to "update" to indicate it's just an update
                            "employee_id": employee.get("employee_id"),
                            "employee_name": employee_name,
                            "name": employee_name,  # Explicitly include name for frontend
                            "timestamp": existing_attendance.get("timestamp", {}).get("iso"),
                            "similarity": rounded_similarity,
                            "entry_time": entry_time_str,
                            "exit_time": None,
                            "objectId": existing_attendance.get("objectId")
                        }
                        
                        result["processed_employee"] = {
                            **attendance_data,
                            "message": f"Attendance already marked (detected again)", 
                            "name": employee_name
                        }
                        
                        # Important: Only set attendance_update for actual changes to attendance
                        # This prevents duplicate broadcasts for streaming updates
                        # result["attendance_update"] = attendance_data
                        
                        return result
            else:
                # If there's already an exit time for today, just return the info
                attendance_data = {
                    "action": "info",  # Changed to indicate this is just informational
                    "employee_id": employee.get("employee_id"),
                    "employee_name": employee_name,
                    "name": employee_name,  # Explicitly include name for frontend
                    "timestamp": existing_attendance.get("timestamp", {}).get("iso"),
                    "similarity": rounded_similarity,
                    "entry_time": existing_attendance.get("timestamp", {}).get("iso"),
                    "exit_time": existing_attendance.get("exit_time", {}).get("iso"),
                    "objectId": existing_attendance.get("objectId")
                }
                
                result["processed_employee"] = {
                    **attendance_data,
                    "message": "Attendance complete for today"
                }
                
                # Don't set attendance_update since this is just an info check, not a change
                # result["attendance_update"] = attendance_data
                
                return result

        # New entry logic for employees without existing attendance
        # Use the improved Attendance model method to check for late arrival
        is_late, late_message, late_minutes, time_components = attendance_model.check_late_arrival(
            employee.get("employee_id"), 
            entry_time=current_time
        )

        # Create new attendance record
        new_attendance_data = {
            "employee_id": employee.get("employee_id"),
            "confidence": rounded_similarity,
            "is_late": is_late,
            "late_message": late_message if is_late else None,
            "timestamp": {
                "__type": "Date",
                "iso": current_time.isoformat()
            },
            "created_at": {
                "__type": "Date",
                "iso": current_time.isoformat()
            },
            "employee": {
                "__type": "Pointer",
                "className": "Employee",
                "objectId": employee.get("objectId")
            },
            "is_early_exit": False,
            "entry_time": current_time.isoformat(),
            "exit_time": None,
            "minutes_late": late_minutes if is_late else None,
            "time_components": time_components if is_late else None
        }
        
        new_attendance = create("Attendance", new_attendance_data)
        
        # Create message for on-time arrival
        message = "Entry marked successfully"
        
        # Prepare data for email notification
        notification_data = {
            "name": employee_name,
            "employee_id": employee.get("employee_id"),
            "employee_name": employee_name,
            "timestamp": current_time.isoformat(),
            "similarity": rounded_similarity,
            "is_late": is_late,
            "late_message": late_message,
            "entry_time": current_time.isoformat(),
            "exit_time": None,
            "minutes_late": late_minutes if is_late else None,
            "time_components": time_components if is_late else None,
            "objectId": new_attendance.get("objectId")
        }
        
        if is_late:
            message += f" - {late_message}"
            send_late_entry_notification(notification_data, employee.get("email"))
        else:
            # Get shift information for a better message
            shift_id = employee.get("shift")
            
            if shift_id and isinstance(shift_id, dict) and shift_id.get("objectId"):
                # Get shift details
                shift = db_query("Shift", where={"objectId": shift_id.get("objectId")}, limit=1)
                
                if shift and shift[0].get("login_time"):
                    login_time_str = shift[0].get("login_time")
                    message += f" - On time (Shift start: {login_time_str})"
                else:
                    message += " - On time for your shift"
            else:
                # Check office timings
                office_timings = db_query("OfficeTiming", limit=1)
                
                if office_timings and office_timings[0].get("login_time"):
                    login_time_str = office_timings[0].get("login_time")
                    message += f" - On time (Office hours start: {login_time_str})"
                else:
                    message += " - On time for your shift"
            
            send_entry_notification(notification_data, employee.get("email"))
        
        attendance_data = {
            "action": "entry",
            "employee_id": employee.get("employee_id"),
            "employee_name": employee_name,
            "name": employee_name,  # Explicitly include name for frontend
            "timestamp": current_time.isoformat(),
            "similarity": rounded_similarity,
            "is_late": is_late,
            "late_message": late_message,
            "entry_time": current_time.isoformat(),
            "exit_time": None,
            "minutes_late": late_minutes if is_late else None,
            "time_components": time_components if is_late else None,
            "objectId": new_attendance.get("objectId")
        }

        result["processed_employee"] = {**attendance_data, "message": message}
        result["attendance_update"] = attendance_data

        return result
    except Exception as e:
        logger.error(f"Error in process_attendance_for_employee: {str(e)}", exc_info=True)
        return {
            "processed_employee": {"message": f"Error processing: {str(e)}"},
            "attendance_update": None
        }
    finally:
        # Cleanup after processing regardless of outcome
        cleanup_resources()

def process_image_in_process(image_data, entry_type: str, client_id: str):
    """Process image in a separate process - enhanced for real-time streaming with confidence information"""
    # Check memory before processing
    memory_status = check_memory_usage()
    if memory_status["is_critical"]:
        logger.warning(f"Insufficient memory for image processing: {memory_status['percent_used']}% used, only {memory_status['available_mb']:.2f} MB available")
        return [], [], {}, 3  # Return code 3 for memory limitation (not error)
        
    try:
        # If image_data is already a numpy array, use it directly
        if isinstance(image_data, np.ndarray):
            img = image_data
        else:
            # image_data should already have the data URL prefix removed in the websocket endpoint
            # But let's double-check
            if "," in image_data:
                image_data = image_data.split(",")[1]

            # Decode base64 to bytes
            image_bytes = base64.b64decode(image_data)

            # Convert to numpy array
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            logger.error(f"Failed to decode image for client {client_id}")
            return [], [], {}, 0

        # More aggressive image resizing with smaller max dimension
        h, w = img.shape[:2]
        if h > MAX_IMAGE_DIMENSION or w > MAX_IMAGE_DIMENSION:
            logger.info(f"Resizing large image ({w}x{h}) for client {client_id}")
            scale = MAX_IMAGE_DIMENSION / max(h, w)
            new_w, new_h = int(w * scale), int(h * scale)
            img = cv2.resize(img, (new_w, new_h))
            logger.info(f"Resized image to {new_w}x{new_h}")
            
        # Check memory after image loading and resizing
        if check_memory_usage()["is_critical"]:
            logger.warning(f"Memory critical after image resize for client {client_id}")
            # Clear variables to free memory
            del img
            return [], [], {}, 3
            
        # Get all face embeddings from the image
        try:
            face_recognition = get_face_recognition()
            face_embeddings = face_recognition.get_embeddings(img)
            # Free the image memory after getting embeddings
            del img
            cleanup_resources()
            
            if not face_embeddings:
                logger.info(f"No faces detected in image from client {client_id}")
                return [], [], {}, 1
        except MemoryError as me:
            logger.error(f"Memory error during face detection for client {client_id}: {str(me)}")
            # Return a specific error code for memory issues
            cleanup_resources()
            return [], [], {}, 2
        except Exception as e:
            logger.error(f"Error during face detection for client {client_id}: {str(e)}")
            cleanup_resources()
            return [], [], {}, 0

        # Get all employees from the database
        try:
            employees = db_query("Employee")
            if not employees:
                logger.warning("No employees found in database")
                return [], [], {}, 0
        except Exception as e:
            logger.error(f"Error querying employees for client {client_id}: {str(e)}")
            return [], [], {}, 0

        # Find matches for all detected faces
        try:
            matches = face_recognition.find_matches_for_embeddings(face_embeddings, employees)
            # Free embeddings memory after matching
            del face_embeddings
            cleanup_resources()
            
            if not matches:
                logger.info(f"No matching employees found for client {client_id}")
                return [], [], {}, 0
        except Exception as e:
            logger.error(f"Error finding matches for client {client_id}: {str(e)}")
            return [], [], {}, 0

        # Process each matched employee
        processed_employees = []
        attendance_updates = []
        last_recognized_employees = {}

        current_time = get_local_time()
        
        for match in matches:
            # Check memory status before processing each employee
            if check_memory_usage()["is_critical"]:
                logger.warning(f"Memory critical during employee processing for client {client_id}")
                break
                
            employee = match['employee']
            similarity = match['similarity']
            
            # Ensure employee information is complete
            if not employee.get('name'):
                logger.warning(f"Employee with ID {employee.get('employee_id')} has missing name. Full employee data: {employee}")
            
            # Format similarity as percentage for display
            similarity_percent = round(similarity * 100, 1) if isinstance(similarity, float) else similarity
            
            logger.info(f"Detected employee {employee.get('name', 'Unknown')} (ID: {employee.get('employee_id', 'Unknown')}) with confidence {similarity_percent}%")
            
            # Update last recognized employees
            last_recognized_employees[employee.get("employee_id")] = {
                'employee': employee,
                'similarity': similarity,
                'similarity_percent': similarity_percent,
                'timestamp': current_time.isoformat()
            }

            # Process attendance using shared function
            try:
                result = process_attendance_for_employee(employee, similarity, entry_type)
                
                if result["processed_employee"]:
                    # Add additional data helpful for real-time display
                    processed_employee = result["processed_employee"]
                    
                    # Ensure employee name is present in processed_employee
                    if not processed_employee.get('name') and employee.get('name'):
                        processed_employee["name"] = employee.get('name')
                        
                    processed_employee["similarity_percent"] = similarity_percent
                    processed_employee["detection_time"] = current_time.isoformat()
                    processed_employee["is_streaming"] = True
                    
                    # Log processed employee for debugging
                    logger.debug(f"Processed employee for client {client_id}: {processed_employee}")
                    
                    processed_employees.append(processed_employee)
                
                if result["attendance_update"]:
                    # Add additional confidence information
                    result["attendance_update"]["confidence_percent"] = similarity_percent
                    result["attendance_update"]["detection_time"] = current_time.isoformat()
                    
                    # Ensure employee name is present in attendance update too
                    if not result["attendance_update"].get('name') and employee.get('name'):
                        result["attendance_update"]["name"] = employee.get('name')
                        
                    attendance_updates.append(result["attendance_update"])
            except Exception as e:
                logger.error(f"Error processing attendance for employee {employee.get('employee_id')}: {str(e)}")
                continue

        return processed_employees, attendance_updates, last_recognized_employees, 0

    except MemoryError as me:
        logger.error(f"Memory error processing image for client {client_id}: {str(me)}")
        # Return a specific error code for memory issues
        cleanup_resources()
        return [], [], {}, 2
    except Exception as e:
        logger.error(f"Error processing image for client {client_id}: {str(e)}")
        cleanup_resources()
        return [], [], {}, 0
    finally:
        # Final cleanup to ensure memory is freed
        cleanup_resources() 