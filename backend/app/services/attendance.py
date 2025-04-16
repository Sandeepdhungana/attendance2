from app.models import Employee, Attendance, EarlyExitReason, OfficeTiming
from app.utils.time_utils import get_local_time, get_local_date, convert_to_local_time
from typing import List, Dict, Any
import logging
from datetime import datetime, timedelta
from app.database import query as db_query, create, update
from app.dependencies import get_queues

logger = logging.getLogger(__name__)

def get_attendance_records() -> List[Dict[str, Any]]:
    """Get all attendance records"""
    attendance_model = Attendance()
    attendances = attendance_model.query()
    return [{
        "objectId": att["objectId"],
        "id": att["employee_id"],  # Set id to employee_id for consistency with websocket
        "employee_id": att["employee_id"],
        "name": att.get("employee", {}).get("name", "Unknown Employee"),
        "timestamp": att["timestamp"],
        "entry_time": att.get("timestamp", {}).get("iso") if isinstance(att.get("timestamp"), dict) else att.get("timestamp"),
        "exit_time": att.get("exit_time", {}).get("iso") if isinstance(att.get("exit_time"), dict) else att.get("exit_time"),
        "confidence": att.get("confidence", 0),
        "is_late": att.get("is_late", False),
        "is_early_exit": att.get("is_early_exit", False),
        "early_exit_reason": att.get("early_exit_reason"),
        "created_at": att["createdAt"],
        "updated_at": att["updatedAt"]
    } for att in attendances]

def delete_attendance_record(attendance_id: str) -> Dict[str, str]:
    """Delete an attendance record"""
    attendance_model = Attendance()
    attendance_model.delete(attendance_id)
    return {"message": "Attendance record deleted successfully"}

def process_attendance_for_employee(employee: Dict[str, Any], similarity: float, entry_type: str) -> Dict[str, Any]:
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
            "timestamp": current_time.isoformat(),
            "similarity": similarity,
            "is_late": is_late,
            "late_message": late_message,
            "entry_time": current_time.isoformat(),
            "exit_time": None,
            "minutes_late": minutes_late,
            "objectId": new_attendance.get("objectId")  # Include objectId for proper referencing
        }

        result["processed_employee"] = {**attendance_data, "message": message}
        result["attendance_update"] = attendance_data
        
        # Queue the update for broadcasting to all clients
        processing_results_queue, _ = get_queues()
        processing_results_queue.put({
            "type": "attendance_update",
            "data": [attendance_data]
        })

    else:  # exit
        if not existing_attendance:
            result["processed_employee"] = {
                "message": "No entry record found for today",
                "employee_id": employee.get("employee_id"),
                "similarity": similarity
            }
            return result
        elif existing_attendance.get("exit_time"):
            result["processed_employee"] = {
                "message": "Exit already marked for today",
                "employee_id": employee.get("employee_id"),
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
        updated_attendance = update("Attendance", existing_attendance.get("objectId"), {
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
            "timestamp": current_time.isoformat(),
            "similarity": similarity,
            "is_early_exit": is_early_exit,
            "early_exit_message": early_exit_message,
            "entry_time": existing_attendance.get("timestamp", {}).get("iso"),
            "exit_time": current_time.isoformat(),
            "objectId": existing_attendance.get("objectId")  # Include objectId for proper referencing
        }

        result["processed_employee"] = {**attendance_data, "message": "Exit marked successfully"}
        result["attendance_update"] = attendance_data
        
        # Queue the update for broadcasting to all clients
        processing_results_queue, _ = get_queues()
        processing_results_queue.put({
            "type": "attendance_update",
            "data": [attendance_data]
        })

    return result

def get_office_timings() -> Dict[str, Any]:
    """Get current office timings"""
    office_timing = OfficeTiming()
    timings = office_timing.query(limit=1)
    if not timings:
        return {
            "login_time": None,
            "logout_time": None,
            "created_at": None,
            "updated_at": None
        }
    
    timing = timings[0]
    return {
        "login_time": timing.get("login_time"),
        "logout_time": timing.get("logout_time"),
        "created_at": timing.get("createdAt"),
        "updated_at": timing.get("updatedAt")
    }

def set_office_timings(login_time: str, logout_time: str) -> Dict[str, Any]:
    """Set new office timings"""
    office_timing = OfficeTiming()
    timings = office_timing.query(limit=1)
    
    timing_data = {
        "login_time": login_time,
        "logout_time": logout_time,
        "updated_at": get_local_time().isoformat()
    }
    
    if timings:
        # Update existing timings
        timing_id = timings[0]["objectId"]
        office_timing.update(timing_id, timing_data)
    else:
        # Create new timings
        timing_data["created_at"] = get_local_time().isoformat()
        office_timing.create(timing_data)
    
    return {
        "message": "Office timings updated successfully",
        "login_time": login_time,
        "logout_time": logout_time
    }
