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

logger = logging.getLogger(__name__)

def process_attendance_for_employee(employee: Dict[str, Any], similarity: float, entry_type: str):
    """Process attendance for an employee with consistent duplicate checking"""
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

    result = {
        "processed_employee": None,
        "attendance_update": None
    }

    if entry_type == "entry":
        if existing_attendance:
            # Check if there's already an entry without exit
            # Format similarity to 2 decimal places
            rounded_similarity = round(similarity, 2)
            
            if not existing_attendance.get("exit_time"):
                result["processed_employee"] = {
                    "message": "Entry already marked for today",
                    "name": employee.get("name"),
                    "employee_id": employee.get("employee_id"),
                    "timestamp": existing_attendance.get("timestamp", {}).get("iso"),
                    "similarity": rounded_similarity,
                    "entry_time": existing_attendance.get("timestamp", {}).get("iso"),
                    "exit_time": None
                }
            else:
                # If there's an exit time, don't allow re-entry on same day
                result["processed_employee"] = {
                    "message": "Cannot mark entry again for today after exit",
                   "name":employee.get("name"),
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
        current_time = get_local_time()
        
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
                
                # Convert login_time to timezone-aware datetime for today
                login_time = datetime.combine(today, 
                                            datetime.min.time().replace(hour=login_time_hours, 
                                                                        minute=login_time_minutes))
                login_time = convert_to_local_time(login_time)
                
                # Calculate the grace period end time (1 hour after login time or use configured grace period)
                grace_period_minutes = shift.get("grace_period_minutes", 1)  # Default 60 minutes if not specified
                grace_period_end = login_time + timedelta(hours=grace_period_minutes)
                
                # Mark as late if entry is after grace period
                if current_time > grace_period_end:
                    is_late = True
                    time_diff = current_time - login_time
                    total_seconds = int(time_diff.total_seconds())
                    hours_late = total_seconds // 3600
                    minutes_late = (total_seconds % 3600) // 60
                    seconds_late = total_seconds % 60
                    
                    # Format the time components for display
                    time_late_str = ""
                    if hours_late > 0:
                        time_late_str += f"{hours_late} hours, "
                    if minutes_late > 0 or hours_late > 0:
                        time_late_str += f"{minutes_late} minutes, "
                    time_late_str += f"{seconds_late} seconds"
                    
                    # Store total minutes for database consistency
                    minutes_late_total = int(total_seconds / 60)
                    
                    late_message = f"Late arrival: {current_time.strftime('%H:%M:%S')} ({time_late_str} late, Shift time: {login_time.strftime('%H:%M')}, Grace period: {grace_period_end.strftime('%H:%M')})"

        # Create new attendance record
        new_attendance_data = {
            "employee_id": employee.get("employee_id"),
            "confidence": round(similarity, 2),
            "is_late": is_late,
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
            }
        }
        
        # Add late arrival details if applicable
        # if is_late:
        #     new_attendance_data["minutes_late"] = minutes_late_total
        #     new_attendance_data["hours_late"] = hours_late
        #     new_attendance_data["minutes_component"] = minutes_late
        #     new_attendance_data["seconds_late"] = seconds_late
        #     new_attendance_data["late_message"] = late_message
        
        create("Attendance", new_attendance_data)

        # Create message for on-time arrival
        message = "Entry marked successfully"
        if is_late:
            message += f" - {late_message}"
        elif login_time and grace_period_end:
            message += f" - On time (Shift time: {login_time.strftime('%H:%M')}, Grace period until: {grace_period_end.strftime('%H:%M')})"

        # Format similarity to 2 decimal places
        rounded_similarity = round(similarity, 2)
        
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
            "minutes_late": minutes_late_total if is_late else None,
            "time_components": {
                "hours": hours_late,
                "minutes": minutes_late,
                "seconds": seconds_late
            } if is_late else None
        }

        result["processed_employee"] = {**attendance_data, "message": message}
        result["attendance_update"] = attendance_data

    else:  # exit
        # Format similarity to 2 decimal places
        rounded_similarity = round(similarity, 2)
        
        if not existing_attendance:
            result["processed_employee"] = {
                "message": "No entry record found for today",
                "employee_id": employee.get("employee_id"),
                "name": employee.get("name"),
                "similarity": rounded_similarity
            }
            return result
        elif existing_attendance.get("exit_time"):
            result["processed_employee"] = {
                "message": "Exit already marked for today",
                "employee_id": employee.get("employee_id"),
                "name": employee.get("name"),
                "timestamp": existing_attendance.get("exit_time", {}).get("iso"),
                "similarity": rounded_similarity,
                "entry_time": existing_attendance.get("timestamp", {}).get("iso"),
                "exit_time": existing_attendance.get("exit_time", {}).get("iso")
            }
            return result

        # Process exit for employees with existing entry but no exit
        is_early_exit = False
        early_exit_message = None
        current_time = get_local_time()
        
        # Get employee shift information
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
            "updated_at": {
                "__type": "Date",
                "iso": current_time.isoformat()
            }
        })

        # Format similarity to 2 decimal places
        rounded_similarity = round(similarity, 2)
        
        attendance_data = {
            "action": "exit",
            "employee_id": employee.get("employee_id"),
            "timestamp": current_time.isoformat(),
            "similarity": rounded_similarity,
            "is_early_exit": is_early_exit,
            "early_exit_message": early_exit_message,
            "entry_time": existing_attendance.get("timestamp", {}).get("iso"),
            "exit_time": current_time.isoformat()
        }

        result["processed_employee"] = {**attendance_data, "message": "Exit marked successfully", "name": employee.get("name")}
        result["attendance_update"] = attendance_data

    return result

def process_image_in_process(image_data: str, entry_type: str, client_id: str):
    """Process image in a separate process - enhanced for real-time streaming with confidence information"""
    try:
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

        # Get all face embeddings from the image
        face_recognition = get_face_recognition()
        face_embeddings = face_recognition.get_embeddings(img)
        if not face_embeddings:
            logger.info(f"No faces detected in image from client {client_id}")
            return [], [], {}, 1

        # Get all employees from the database
        employees = db_query("Employee")
        if not employees:
            logger.warning("No employees found in database")
            return [], [], {}, 0

        # Find matches for all detected faces
        matches = face_recognition.find_matches_for_embeddings(face_embeddings, employees)

        if not matches:
            logger.info(f"No matching employees found for client {client_id}")
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

        return processed_employees, attendance_updates, last_recognized_employees, 0

    except Exception as e:
        logger.error(f"Error processing image for client {client_id}: {str(e)}")
        return [], [], {}, 0 