import cv2
import numpy as np
import base64
import logging
from typing import List, Dict, Any
from ..dependencies import get_face_recognition
from ..models import Employee, Attendance, Shift
from ..utils.time_utils import get_local_date, get_local_time, convert_to_local_time
from datetime import datetime, timedelta
from ..database import query as db_query
from ..database import create, update
from ..services.sendpulse_service import send_message_by_phone

logger = logging.getLogger(__name__)

# Configuration for auto-exit detection (in seconds)
AUTO_EXIT_THRESHOLD = 10  # Time in seconds to consider a re-detection as an exit

def process_attendance_for_employee(employee: Dict[str, Any], similarity: float, entry_type: str):
    """Process attendance for an employee with consistent duplicate checking and auto-exit"""
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

    result = {
        "processed_employee": None,
        "attendance_update": None
    }

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
                    logger.info(f"Auto-exit triggered for {employee.get('name')} (ID: {employee.get('employee_id')}) after {time_diff.total_seconds()} seconds")
                    
                    # Process exit logic
                    is_early_exit = False
                    early_exit_message = None
                    
                    # Get employee shift information for early exit check
                    logout_time = None
                    shift_id = employee.get("shift")
                    
                    if shift_id and isinstance(shift_id, dict) and shift_id.get("objectId"):
                        # Get shift details using the pointer
                        shift = db_query("Shift", 
                            where={"objectId": shift_id.get("objectId")},
                            limit=1
                        )
                        shift = shift[0] if shift else None
                        
                        if shift and shift.get("logout_time"):
                            # Parse logout_time from string
                            logout_time_str = shift.get("logout_time")
                            logout_time_hours, logout_time_minutes = map(int, logout_time_str.split(":"))
                            
                            # Convert logout_time to timezone-aware datetime for today
                            logout_time = datetime.combine(today, 
                                                        datetime.min.time().replace(hour=logout_time_hours, 
                                                                                    minute=logout_time_minutes))
                            logout_time = convert_to_local_time(logout_time)
                            logger.info(f"Logout time: {logout_time}")
                            logger.info(f"Current time: {current_time}")
                            
                            if current_time < logout_time:
                                is_early_exit = True
                                early_exit_message = f"Early exit: {current_time.strftime('%H:%M')} (Shift end time: {logout_time.strftime('%H:%M')})"

                    # Update the existing attendance record with exit time
                    update("Attendance", existing_attendance.get("objectId"), {
                        "exit_time": {
                            "__type": "Date",
                            "iso": current_time.isoformat()
                        },
                        "is_early_exit": is_early_exit,
                        "confidence": max(existing_attendance.get("confidence", 0), rounded_similarity),
                        "updated_at": {
                            "__type": "Date",
                            "iso": current_time.isoformat()
                        }
                    })

                    attendance_data = {
                        "action": "exit",
                        "employee_id": employee.get("employee_id"),
                        "employee_name": employee.get("name"),
                        "timestamp": current_time.isoformat(),
                        "similarity": rounded_similarity,
                        "is_early_exit": is_early_exit,
                        "early_exit_message": early_exit_message,
                        "entry_time": entry_time_str,
                        "exit_time": current_time.isoformat(),
                        "objectId": existing_attendance.get("objectId")
                    }

                    result["processed_employee"] = {
                        **attendance_data, 
                        "message": "Auto-exit marked successfully", 
                        "name": employee.get("name")
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
                    
                    result["processed_employee"] = {
                        "message": f"Attendance already marked (detected again)", 
                        "name": employee.get("name"),
                        "employee_id": employee.get("employee_id"),
                        "timestamp": existing_attendance.get("timestamp", {}).get("iso"),
                        "similarity": rounded_similarity,
                        "entry_time": entry_time_str,
                        "exit_time": None
                    }
                    
                    return result
        else:
            # If there's already an exit time for today, just return the info
            result["processed_employee"] = {
                "message": "Attendance complete for today",
                "name": employee.get("name"),
                "employee_id": employee.get("employee_id"),
                "timestamp": existing_attendance.get("timestamp", {}).get("iso"),
                "similarity": rounded_similarity,
                "entry_time": existing_attendance.get("timestamp", {}).get("iso"),
                "exit_time": existing_attendance.get("exit_time", {}).get("iso")
            }
            return result

    # New entry logic for employees without existing attendance
    is_late = False
    late_message = None
    minutes_late = None
    time_components = None
    
    # Get employee shift information
    login_time = None
    grace_period_end = None
    shift_id = employee.get("shift")
    
    if shift_id and isinstance(shift_id, dict) and shift_id.get("objectId"):
        # Get shift details using the pointer
        shift = db_query("Shift", 
            where={"objectId": shift_id.get("objectId")},
            limit=1
        )
        shift = shift[0] if shift else None
        
        if shift and shift.get("login_time"):
            # Parse login_time from string
            login_time_str = shift.get("login_time")
            login_time_hours, login_time_minutes = map(int, login_time_str.split(":"))
            
            # Get grace period from shift (default to 0 if not set)
            grace_period = shift.get("grace_period", 60)
            
            # Convert login_time to timezone-aware datetime for today
            login_time = datetime.combine(today, 
                                        datetime.min.time().replace(hour=login_time_hours, 
                                                                    minute=login_time_minutes))
            login_time = convert_to_local_time(login_time)
            
            # Add grace period to login time
            login_time_with_grace = login_time + timedelta(minutes=grace_period)
            
            logger.info(f"Login time: {login_time}")
            logger.info(f"Grace period: {grace_period} minutes")
            logger.info(f"Login time with grace: {login_time_with_grace}")
            logger.info(f"Current time: {current_time}")
            
            # Check if the current time is after the login time + grace period
            if current_time > login_time_with_grace:
                is_late = True
                late_minutes = int((current_time - login_time).total_seconds() / 60)
                time_components = {
                    "hours": late_minutes // 60,
                    "minutes": late_minutes % 60,
                    "seconds": int((current_time - login_time).total_seconds()) % 60
                }
                late_message = f"Late by {late_minutes} minutes (Shift start time: {login_time.strftime('%H:%M')})"

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
    
    # Only send message to employee on first entry
    try:
        send_message_by_phone(bot_id="67ff97f2dccc60523807cffd", phone=971524472456, message_text="Welcome to Zainlee, Your attendance has been marked")
    except Exception as e:
        logger.error(f"Error sending message: {str(e)}")

    # Create message for on-time arrival
    message = "Entry marked successfully"
    if is_late:
        message += f" - {late_message}"
    elif login_time:
        message += f" - On time (Shift start time: {login_time.strftime('%H:%M')})"
    
    attendance_data = {
        "action": "entry",
        "employee_id": employee.get("employee_id"),
        "employee_name": employee.get("name"),
        "timestamp": current_time.isoformat(),
        "similarity": rounded_similarity,
        "is_late": is_late,
        "late_message": late_message,
        "entry_time": current_time.isoformat(),
        "exit_time": None,
        "minutes_late": minutes_late if is_late else None,
        "time_components": time_components if is_late else None,
        "objectId": new_attendance.get("objectId")
    }

    result["processed_employee"] = {**attendance_data, "message": message}
    result["attendance_update"] = attendance_data

    return result

def process_image_in_process(image_data, entry_type: str, client_id: str):
    """Process image in a separate process - enhanced for real-time streaming with confidence information"""
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

        # Resize image if it's too large to reduce memory usage
        h, w = img.shape[:2]
        max_dimension = 1024
        if h > max_dimension or w > max_dimension:
            logger.info(f"Resizing large image ({w}x{h}) for client {client_id}")
            scale = max_dimension / max(h, w)
            new_w, new_h = int(w * scale), int(h * scale)
            img = cv2.resize(img, (new_w, new_h))
            logger.info(f"Resized image to {new_w}x{new_h}")

        # Get all face embeddings from the image
        try:
            face_recognition = get_face_recognition()
            face_embeddings = face_recognition.get_embeddings(img)
            if not face_embeddings:
                logger.info(f"No faces detected in image from client {client_id}")
                return [], [], {}, 1
        except MemoryError as me:
            logger.error(f"Memory error during face detection for client {client_id}: {str(me)}")
            # Return a specific error code for memory issues
            return [], [], {}, 2
        except Exception as e:
            logger.error(f"Error during face detection for client {client_id}: {str(e)}")
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
            employee = match['employee']
            similarity = match['similarity']
            
            # Format similarity as percentage for display
            similarity_percent = round(similarity * 100, 1) if isinstance(similarity, float) else similarity
            
            logger.info(f"Detected employee {employee.get('name')} (ID: {employee.get('employee_id')}) with confidence {similarity_percent}%")
            
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
                    processed_employee["similarity_percent"] = similarity_percent
                    processed_employee["detection_time"] = current_time.isoformat()
                    processed_employee["is_streaming"] = True
                    
                    processed_employees.append(processed_employee)
                
                if result["attendance_update"]:
                    # Add additional confidence information
                    result["attendance_update"]["confidence_percent"] = similarity_percent
                    result["attendance_update"]["detection_time"] = current_time.isoformat()
                    attendance_updates.append(result["attendance_update"])
            except Exception as e:
                logger.error(f"Error processing attendance for employee {employee.get('employee_id')}: {str(e)}")
                continue

        return processed_employees, attendance_updates, last_recognized_employees, 0

    except MemoryError as me:
        logger.error(f"Memory error processing image for client {client_id}: {str(me)}")
        # Return a specific error code for memory issues
        return [], [], {}, 2
    except Exception as e:
        logger.error(f"Error processing image for client {client_id}: {str(e)}")
        return [], [], {}, 0 