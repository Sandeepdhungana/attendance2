from app.models import Employee, Attendance, EarlyExitReason, OfficeTiming
from app.utils.time_utils import get_local_time, get_local_date, convert_to_local_time
from typing import List, Dict, Any
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

def get_attendance_records() -> List[Dict[str, Any]]:
    """Get all attendance records"""
    attendance_model = Attendance()
    attendances = attendance_model.query()
    return [{
        "objectId": att["objectId"],
        "employee_id": att["employee_id"],
        "name": att.get("employee", {}).get("name", "Unknown Employee"),
        "timestamp": att["timestamp"],
        "exit_time": att.get("exit_time"),
        "confidence": att["confidence"],
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

def process_attendance_for_employee(employee: Employee, similarity: float, entry_type: str) -> Dict[str, Any]:
    """Process attendance for an employee with consistent duplicate checking"""
    # Check if attendance already marked for today
    today = get_local_date()
    today_start = datetime.combine(today, datetime.min.time())
    today_start = convert_to_local_time(today_start)
    today_end = datetime.combine(today, datetime.max.time())
    today_end = convert_to_local_time(today_end)

    # Get any existing attendance record for today
    existing_attendance = Attendance.Query.filter(
        employee_id=employee.employee_id,
        timestamp__gte=today_start,
        timestamp__lte=today_end
    ).first()

    result = {
        "processed_employee": None,
        "attendance_update": None
    }

    if entry_type == "entry":
        if existing_attendance:
            # Check if there's already an entry without exit
            if not existing_attendance.exit_time:
                result["processed_employee"] = {
                    "message": "Entry already marked for today",
                    "employee_id": employee.employee_id,
                    "name": employee.name,
                    "timestamp": existing_attendance.timestamp.isoformat(),
                    "similarity": similarity,
                    "entry_time": existing_attendance.timestamp.isoformat(),
                    "exit_time": None
                }
            else:
                # If there's an exit time, don't allow re-entry on same day
                result["processed_employee"] = {
                    "message": "Cannot mark entry again for today after exit",
                    "employee_id": employee.employee_id,
                    "name": employee.name,
                    "timestamp": existing_attendance.timestamp.isoformat(),
                    "similarity": similarity,
                    "entry_time": existing_attendance.timestamp.isoformat(),
                    "exit_time": existing_attendance.exit_time.isoformat()
                }
            return result

        # New entry logic for employees without existing attendance
        is_late = False
        late_message = None
        minutes_late = None
        current_time = get_local_time()
        
        # Get shift timings
        shift = employee.shift  # Get the employee's assigned shift
        if shift and shift.login_time:
            # Convert login_time to timezone-aware datetime for today
            login_time = datetime.combine(today, shift.login_time.time())
            login_time = convert_to_local_time(login_time)
            
            # Calculate the grace period end time (1 hour after login time)
            grace_period_end = login_time + timedelta(hours=1)
            
            # Mark as late if entry is after grace period
            if current_time > grace_period_end:
                is_late = True
                time_diff = current_time - login_time
                minutes_late = int(time_diff.total_seconds() / 60)
                late_message = f"Late arrival: {current_time.strftime('%H:%M')} ({minutes_late} minutes late, Shift time: {login_time.strftime('%H:%M')}, Grace period: {grace_period_end.strftime('%H:%M')})"

        new_attendance = Attendance(
            employee_id=employee.employee_id,
            confidence=similarity,
            is_late=is_late,
            timestamp=current_time
        )
        new_attendance.save()

        # Create message for on-time arrival
        message = "Entry marked successfully"
        if is_late:
            message += f" - {late_message}"
        else:
            message += f" - On time (Shift time: {login_time.strftime('%H:%M')}, Grace period until: {grace_period_end.strftime('%H:%M')})"

        attendance_data = {
            "action": "entry",
            "employee_id": employee.employee_id,
            "name": employee.name,
            "timestamp": new_attendance.timestamp.isoformat(),
            "similarity": similarity,
            "is_late": is_late,
            "late_message": late_message,
            "entry_time": new_attendance.timestamp.isoformat(),
            "exit_time": None,
            "minutes_late": minutes_late
        }

        result["processed_employee"] = {**attendance_data, "message": message}
        result["attendance_update"] = attendance_data

    else:  # exit
        if not existing_attendance:
            result["processed_employee"] = {
                "message": "No entry record found for today",
                "employee_id": employee.employee_id,
                "name": employee.name,
                "similarity": similarity
            }
            return result
        elif existing_attendance.exit_time:
            result["processed_employee"] = {
                "message": "Exit already marked for today",
                "employee_id": employee.employee_id,
                "name": employee.name,
                "timestamp": existing_attendance.exit_time.isoformat(),
                "similarity": similarity,
                "entry_time": existing_attendance.timestamp.isoformat(),
                "exit_time": existing_attendance.exit_time.isoformat()
            }
            return result

        # Process exit for employees with existing entry but no exit
        is_early_exit = False
        early_exit_message = None
        current_time = get_local_time()
        
        # Get shift timings
        shift = employee.shift  # Get the employee's assigned shift
        if shift and shift.logout_time:
            # Convert logout_time to timezone-aware datetime for today
            logout_time = datetime.combine(today, shift.logout_time.time())
            logout_time = convert_to_local_time(logout_time)
            
            if current_time < logout_time:
                is_early_exit = True
                early_exit_message = f"Early exit: {current_time.strftime('%H:%M')} (Shift time: {logout_time.strftime('%H:%M')})"

        # Update the existing attendance record with exit time
        existing_attendance.exit_time = current_time
        existing_attendance.is_early_exit = is_early_exit
        existing_attendance.save()

        attendance_data = {
            "action": "exit",
            "employee_id": employee.employee_id,
            "name": employee.name,
            "timestamp": current_time.isoformat(),
            "similarity": similarity,
            "is_early_exit": is_early_exit,
            "early_exit_message": early_exit_message,
            "entry_time": existing_attendance.timestamp.isoformat(),
            "exit_time": current_time.isoformat()
        }

        result["processed_employee"] = {**attendance_data, "message": "Exit marked successfully"}
        result["attendance_update"] = attendance_data

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
