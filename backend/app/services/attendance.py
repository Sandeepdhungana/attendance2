from app.models import Attendance,OfficeTiming
from app.utils.time_utils import get_local_time
from typing import List, Dict, Any
import logging
from app.database import query as db_query



logger = logging.getLogger(__name__)

def get_attendance_records():
    """Get all attendance records with employee names"""
    # Get all attendance records
    attendance_records = db_query("Attendance", order="-timestamp")
    
    if not attendance_records:
        return []
        
    # Get unique employee IDs
    employee_ids = list(set(att["employee_id"] for att in attendance_records))
    
    # Batch fetch all employees at once using $in operator
    employees = db_query("Employee", where={
        "employee_id": {
            "$in": employee_ids
        }
    })
    
    # Create a lookup dictionary for quick access
    employee_lookup = {emp["employee_id"]: emp for emp in employees}
    
    # Format the response
    return [{
        "name": employee_lookup.get(att["employee_id"], {}).get("name", "Unknown"),
        "objectId": att["objectId"],
        "id": att["employee_id"],
        "employee_id": att["employee_id"],
        "timestamp": att["timestamp"],
        "entry_time": att.get("timestamp", {}).get("iso") if isinstance(att.get("timestamp"), dict) else att.get("timestamp"),
        "exit_time": att.get("exit_time", {}).get("iso") if isinstance(att.get("exit_time"), dict) else att.get("exit_time"),
        "confidence": att.get("confidence", 0),
        "is_late": att.get("is_late", False),
        "is_early_exit": att.get("is_early_exit", False),
        "early_exit_reason": att.get("early_exit_reason"),
        "created_at": att["createdAt"],
        "updated_at": att["updatedAt"]
    } for att in attendance_records]

def delete_attendance_record(attendance_id: str) -> Dict[str, str]:
    """Delete an attendance record"""
    attendance_model = Attendance()
    attendance_model.delete(attendance_id)
    return {"message": "Attendance record deleted successfully"}

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

def get_employee_shift_info(employee_id: str) -> Dict[str, Any]:
    """Get shift information for a specific employee"""
    # Get the employee first
    employee = db_query("Employee", where={"employee_id": employee_id}, limit=1)
    if not employee:
        return {
            "employee_id": employee_id,
            "has_shift": False,
            "shift_info": None,
            "using_default": True,
            "timing_info": get_office_timings()
        }
    
    employee = employee[0]
    employee_shift = employee.get("shift")
    
    # If the employee has no shift, return default office timings
    if not employee_shift or not employee_shift.get("objectId"):
        return {
            "employee_id": employee_id,
            "has_shift": False,
            "shift_info": None,
            "using_default": True,
            "timing_info": get_office_timings()
        }
    
    # Get the shift details
    shift_id = employee_shift.get("objectId")
    shift = db_query("Shift", where={"objectId": shift_id}, limit=1)
    
    if not shift:
        return {
            "employee_id": employee_id,
            "has_shift": False,
            "shift_info": None,
            "using_default": True,
            "timing_info": get_office_timings()
        }
    
    shift = shift[0]
    return {
        "employee_id": employee_id,
        "has_shift": True,
        "shift_info": {
            "objectId": shift.get("objectId"),
            "name": shift.get("name"),
            "login_time": shift.get("login_time"),
            "logout_time": shift.get("logout_time")
        },
        "using_default": False,
        "timing_info": {
            "login_time": shift.get("login_time"),
            "logout_time": shift.get("logout_time")
        }
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
