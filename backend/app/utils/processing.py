import cv2
import numpy as np
import base64
import logging
from typing import List, Dict, Any
from ..dependencies import get_face_recognition
from ..models import Employee, Attendance, OfficeTiming
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
            if not existing_attendance.get("exit_time"):
                result["processed_employee"] = {
                    "message": "Entry already marked for today",
                    "employee_id": employee.get("employee_id"),
                    "name": employee.get("name"),
                    "timestamp": existing_attendance.get("timestamp", {}).get("iso"),
                    "similarity": similarity,
                    "entry_time": existing_attendance.get("timestamp", {}).get("iso"),
                    "exit_time": None
                }
            else:
                # If there's an exit time, don't allow re-entry on same day
                result["processed_employee"] = {
                    "message": "Cannot mark entry again for today after exit",
                    "employee_id": employee.get("employee_id"),
                    "name": employee.get("name"),
                    "timestamp": existing_attendance.get("timestamp", {}).get("iso"),
                    "similarity": similarity,
                    "entry_time": existing_attendance.get("timestamp", {}).get("iso"),
                    "exit_time": existing_attendance.get("exit_time", {}).get("iso")
                }
            return result

        # New entry logic for employees without existing attendance
        is_late = False
        late_message = None
        minutes_late = None
        current_time = get_local_time()
        
        # Get office timings
        office_timing = db_query("OfficeTiming", limit=1)
        office_timing = office_timing[0] if office_timing else None
        
        login_time = None
        grace_period_end = None
        
        if office_timing and office_timing.get("login_time"):
            # Parse login_time from string
            login_time_str = office_timing.get("login_time")
            login_time_hours, login_time_minutes = map(int, login_time_str.split(":"))
            
            # Convert login_time to timezone-aware datetime for today
            login_time = datetime.combine(today, 
                                          datetime.min.time().replace(hour=login_time_hours, 
                                                                      minute=login_time_minutes))
            login_time = convert_to_local_time(login_time)
            
            # Calculate the grace period end time (1 hour after login time)
            grace_period_end = login_time + timedelta(hours=1)
            
            # Mark as late if entry is after grace period
            if current_time > grace_period_end:
                is_late = True
                time_diff = current_time - login_time
                minutes_late = int(time_diff.total_seconds() / 60)
                late_message = f"Late arrival: {current_time.strftime('%H:%M')} ({minutes_late} minutes late, Office time: {login_time.strftime('%H:%M')}, Grace period: {grace_period_end.strftime('%H:%M')})"

        # Create new attendance record
        new_attendance = create("Attendance", {
            "employee_id": employee.get("employee_id"),
            "employee_name": employee.get("name"),
            "confidence": similarity,
            "is_late": is_late,
            "timestamp": {
                "__type": "Date",
                "iso": current_time.isoformat()
            },
            "created_at": {
                "__type": "Date",
                "iso": current_time.isoformat()
            }
        })

        # Create message for on-time arrival
        message = "Entry marked successfully"
        if is_late:
            message += f" - {late_message}"
        elif login_time and grace_period_end:
            message += f" - On time (Office time: {login_time.strftime('%H:%M')}, Grace period until: {grace_period_end.strftime('%H:%M')})"

        attendance_data = {
            "action": "entry",
            "employee_id": employee.get("employee_id"),
            "name": employee.get("name"),
            "timestamp": current_time.isoformat(),
            "similarity": similarity,
            "is_late": is_late,
            "late_message": late_message,
            "entry_time": current_time.isoformat(),
            "exit_time": None,
            "minutes_late": minutes_late
        }

        result["processed_employee"] = {**attendance_data, "message": message}
        result["attendance_update"] = attendance_data

    else:  # exit
        if not existing_attendance:
            result["processed_employee"] = {
                "message": "No entry record found for today",
                "employee_id": employee.get("employee_id"),
                "name": employee.get("name"),
                "similarity": similarity
            }
            return result
        elif existing_attendance.get("exit_time"):
            result["processed_employee"] = {
                "message": "Exit already marked for today",
                "employee_id": employee.get("employee_id"),
                "name": employee.get("name"),
                "timestamp": existing_attendance.get("exit_time", {}).get("iso"),
                "similarity": similarity,
                "entry_time": existing_attendance.get("timestamp", {}).get("iso"),
                "exit_time": existing_attendance.get("exit_time", {}).get("iso")
            }
            return result

        # Process exit for employees with existing entry but no exit
        is_early_exit = False
        early_exit_message = None
        current_time = get_local_time()
        
        # Get office timings
        office_timing = db_query("OfficeTiming", limit=1)
        office_timing = office_timing[0] if office_timing else None
        
        if office_timing and office_timing.get("logout_time"):
            # Parse logout_time from string
            logout_time_str = office_timing.get("logout_time")
            logout_time_hours, logout_time_minutes = map(int, logout_time_str.split(":"))
            
            # Convert logout_time to timezone-aware datetime for today
            logout_time = datetime.combine(today, 
                                         datetime.min.time().replace(hour=logout_time_hours, 
                                                                    minute=logout_time_minutes))
            logout_time = convert_to_local_time(logout_time)
            
            if current_time < logout_time:
                is_early_exit = True
                early_exit_message = f"Early exit: {current_time.strftime('%H:%M')} (Office time: {logout_time.strftime('%H:%M')})"

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

        attendance_data = {
            "action": "exit",
            "employee_id": employee.get("employee_id"),
            "name": employee.get("name"),
            "timestamp": current_time.isoformat(),
            "similarity": similarity,
            "is_early_exit": is_early_exit,
            "early_exit_message": early_exit_message,
            "entry_time": existing_attendance.get("timestamp", {}).get("iso"),
            "exit_time": current_time.isoformat()
        }

        result["processed_employee"] = {**attendance_data, "message": "Exit marked successfully"}
        result["attendance_update"] = attendance_data

    return result

def process_image_in_process(image_data: str, entry_type: str, client_id: str):
    """Process image in a separate process"""
    try:
        # Remove data URL prefix if present
        if "," in image_data:
            image_data = image_data.split(",")[1]

        # Decode base64 to bytes
        image_bytes = base64.b64decode(image_data)

        # Convert to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return [], [], {}, 0

        # Get all face embeddings from the image
        face_recognition = get_face_recognition()
        face_embeddings = face_recognition.get_embeddings(img)
        if not face_embeddings:
            return [], [], {}, 1

        # Get all employees from the database
        employees = db_query("Employee")

        # Find matches for all detected faces
        matches = face_recognition.find_matches_for_embeddings(face_embeddings, employees)

        if not matches:
            return [], [], {}, 0

        # Process each matched employee
        processed_employees = []
        attendance_updates = []
        last_recognized_employees = {}

        for match in matches:
            employee = match['employee']
            similarity = match['similarity']

            # Update last recognized employees
            last_recognized_employees[employee.get("employee_id")] = {
                'employee': employee,
                'similarity': similarity
            }

            # Process attendance using shared function
            result = process_attendance_for_employee(employee, similarity, entry_type)
            
            if result["processed_employee"]:
                processed_employees.append(result["processed_employee"])
            
            if result["attendance_update"]:
                attendance_updates.append(result["attendance_update"])

        return processed_employees, attendance_updates, last_recognized_employees, 0

    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        return [], [], {}, 0 