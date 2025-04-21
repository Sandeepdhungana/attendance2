from fastapi import APIRouter, HTTPException
from ..database import query, create, update, delete
from .. import models
from ..utils.websocket import broadcast_attendance_update
from ..utils.time_utils import get_local_time
import logging
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class EarlyExitRequest(BaseModel):
    attendance_id: int
    reason: str
    employee_id: Optional[str] = None  # Make employee_id optional

class EmployeeEarlyExitRequest(BaseModel):
    employee_id: str
    reason: str

router = APIRouter()
logger = logging.getLogger(__name__)

def format_date(dt):
    """Format a datetime object to Back4app Date format"""
    return {
        "__type": "Date",
        "iso": dt.isoformat() + "Z"
    }

def create_pointer(class_name, object_id):
    """Create a Back4app pointer object"""
    return {
        "__type": "Pointer",
        "className": class_name,
        "objectId": str(object_id)
    }

@router.post("/early-exit-reason")
async def submit_employee_early_exit_reason(request: EmployeeEarlyExitRequest):
    """Submit reason for early exit using employee_id instead of attendance_id"""
    try:
        employee_id = request.employee_id
        reason = request.reason
        
        logger.info(f"Received early exit reason submission by employee_id - employee_id: {employee_id}, reason: {reason}")
        print("The employee id is ", employee_id, "and the reason is ", reason)
        if not employee_id or not reason:
            raise HTTPException(status_code=400, detail="Missing required fields")
        
        # Get employee info
        employee_records = query("Employee", where={"employee_id": employee_id}, limit=1)
        if not employee_records or len(employee_records) == 0:
            logger.error(f"Employee not found with ID: {employee_id}")
            raise HTTPException(status_code=404, detail="Employee not found")
        
        # Safely access the first employee record
        employee_record = employee_records[0]
        if not isinstance(employee_record, dict):
            logger.error(f"Unexpected employee record format: {type(employee_record)}")
            raise HTTPException(status_code=500, detail="Internal server error: Invalid employee data format")
            
        employee_name = employee_record.get("name", "Unknown")
        employee_object_id = employee_record.get("objectId")
        
        if not employee_object_id:
            logger.error(f"Employee object ID missing in employee record: {employee_record}")
            raise HTTPException(status_code=400, detail="Invalid employee record (missing objectId)")
        
        # Find the most recent attendance record for this employee
        # Order by created_at in descending order to get the most recent
        attendance_records = query(
            "Attendance", 
            where={"employee_id": employee_id}, 
            order="-created_at",
            limit=1
        )
        
        if not attendance_records or len(attendance_records) == 0:
            logger.error(f"No attendance records found for employee: {employee_id}")
            raise HTTPException(status_code=404, detail="No attendance records found for this employee")
        
        # Safely access the first attendance record
        attendance = attendance_records[0]
        if not isinstance(attendance, dict):
            logger.error(f"Unexpected attendance record format: {type(attendance)}")
            raise HTTPException(status_code=500, detail="Internal server error: Invalid attendance data format")
            
        attendance_id = attendance.get("objectId")
        
        if not attendance_id:
            logger.error(f"Attendance object ID missing in record: {attendance}")
            raise HTTPException(status_code=400, detail="Invalid attendance record (missing objectId)")
        
        # Check if there's exit time - you can only submit early exit reason for records with exit time
        exit_time = attendance.get("exit_time", {})
        if not exit_time or not isinstance(exit_time, dict) or not exit_time.get("iso"):
            logger.error(f"No exit time found for attendance record: {attendance_id}")
            raise HTTPException(status_code=400, detail="Cannot submit early exit reason for attendance without exit time")
        
        current_time = get_local_time()
        
        # Determine if this is an early exit based on shift information
        is_early_exit = attendance.get("is_early_exit", False)
        
        # If not already marked as early exit, check against shift information
        if not is_early_exit:
            # Get employee shift information
            shift_id = employee_record.get("shift")
            
            if shift_id and isinstance(shift_id, dict) and shift_id.get("objectId"):
                # Get shift details using the pointer
                shift = query("Shift", 
                    where={"objectId": shift_id.get("objectId")},
                    limit=1
                )
                shift = shift[0] if shift and len(shift) > 0 else None
                
                if shift and shift.get("logout_time"):
                    # Parse exit time
                    try:
                        exit_time_str = exit_time.get("iso")
                        exit_datetime = datetime.fromisoformat(exit_time_str.replace("Z", "+00:00"))
                        
                        # Parse logout_time from string
                        logout_time_str = shift.get("logout_time")
                        logout_time_hours, logout_time_minutes = map(int, logout_time_str.split(":"))
                        
                        # Get today's date portion
                        today = exit_datetime.date()
                        
                        # Convert logout_time to timezone-aware datetime for the same day as exit
                        logout_datetime = datetime.combine(today, 
                                                 datetime.min.time().replace(hour=logout_time_hours, 
                                                                           minute=logout_time_minutes))
                        
                        # Make timezone-aware if needed
                        if exit_datetime.tzinfo is not None:
                            logout_datetime = logout_datetime.replace(tzinfo=exit_datetime.tzinfo)
                        
                        # Check if exit was early
                        if exit_datetime < logout_datetime:
                            is_early_exit = True
                            
                            # Update the attendance record to mark it as early exit
                            update("Attendance", attendance_id, {
                                "is_early_exit": True,
                                "updated_at": {
                                    "__type": "Date",
                                    "iso": current_time.isoformat()
                                }
                            })
                            logger.info(f"Updated attendance record {attendance_id} to mark as early exit")
                    except Exception as e:
                        logger.error(f"Error checking if exit was early: {str(e)}")
        
        # Create early exit reason
        early_exit_data = {
            "employee_id": employee_id,
            "attendance_id": str(attendance_id),
            "attendance": create_pointer("Attendance", attendance_id),
            "employee": create_pointer("Employee", employee_object_id),
            "reason": reason,
            "created_at": format_date(current_time),
            "updated_at": format_date(current_time)
        }
        
        # Create the early exit reason
        new_reason = create("EarlyExitReason", early_exit_data)
        print("The new reason is ", new_reason)
        
        # Check if the new_reason is valid and has objectId
        if not isinstance(new_reason, dict) or not new_reason.get("objectId"):
            logger.error(f"Failed to create early exit reason: {new_reason}")
            raise HTTPException(status_code=500, detail="Failed to create early exit reason")
        
        # Broadcast the update with the is_early_exit flag
        await broadcast_attendance_update({
            "action": "early_exit_reason",
            "employee_id": employee_id,
            "name": employee_name,
            "attendance_id": str(attendance_id),
            "timestamp": current_time.isoformat(),
            "reason": reason,
            "is_early_exit": is_early_exit,
            "objectId": new_reason.get("objectId")
        })
        
        logger.info(f"Early exit reason submitted successfully for employee {employee_id}")
        return {
            "message": "Early exit reason submitted successfully", 
            "attendance_id": str(attendance_id),
            "is_early_exit": is_early_exit
        }
    except Exception as e:
        logger.error(f"Error submitting early exit reason: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/early-exit-reasons")
def get_early_exit_reasons():
    """Get all early exit reasons"""
    try:
        # Query all early exit reasons from Back4app, ordered by creation date
        reasons = query("EarlyExitReason", order="-created_at")
        
        # Format the response
        formatted_reasons = []
        for reason in reasons:
            # Get employee info
            employee_id = reason.get("employee_id")
            employee_name = "Unknown"
            
            if employee_id:
                employee_records = query("Employee", where={"employee_id": employee_id}, limit=1)
                if employee_records and len(employee_records) > 0:
                    employee = employee_records[0]
                    if isinstance(employee, dict):
                        employee_name = employee.get("name", "Unknown")
            
            # Get attendance info to check is_early_exit status
            attendance_id = reason.get("attendance_id")
            is_early_exit = False
            exit_time = None
            
            if attendance_id:
                attendance_records = query("Attendance", where={"objectId": attendance_id}, limit=1)
                if attendance_records and len(attendance_records) > 0:
                    attendance = attendance_records[0]
                    if isinstance(attendance, dict):
                        is_early_exit = attendance.get("is_early_exit", False)
                        exit_time_obj = attendance.get("exit_time", {})
                        if isinstance(exit_time_obj, dict) and exit_time_obj.get("iso"):
                            exit_time = exit_time_obj.get("iso")
            
            formatted_reasons.append({
                "id": reason.get("objectId"),
                "user_id": reason.get("employee_id"),
                "user_name": employee_name,
                "attendance_id": attendance_id,
                "reason": reason.get("reason"),
                "timestamp": reason.get("createdAt"),
                "is_early_exit": is_early_exit,
                "exit_time": exit_time
            })
            
        return formatted_reasons
    except Exception as e:
        logger.error(f"Error getting early exit reasons: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/early-exit-reasons/{reason_id}")
async def delete_early_exit_reason(reason_id: str):
    """Delete an early exit reason"""
    try:
        # Get the early exit reason from Back4app
        reasons = query("EarlyExitReason", where={"objectId": reason_id}, limit=1)
        
        if not reasons or len(reasons) == 0:
            raise HTTPException(status_code=404, detail="Early exit reason not found")
        
        reason = reasons[0]
        if not isinstance(reason, dict):
            raise HTTPException(status_code=500, detail="Invalid reason data format")
            
        employee_id = reason.get("employee_id", "unknown")
        attendance_id = reason.get("attendance_id", "unknown")
        
        # Get employee info
        employee_name = "Unknown"
        if employee_id and employee_id != "unknown":
            employee_records = query("Employee", where={"employee_id": employee_id}, limit=1)
            if employee_records and len(employee_records) > 0:
                employee = employee_records[0]
                if isinstance(employee, dict):
                    employee_name = employee.get("name", "Unknown")
        
        # Delete the early exit reason
        delete_result = delete("EarlyExitReason", reason_id)
        
        # Check if deletion was successful
        if delete_result and isinstance(delete_result, dict) and "error" in delete_result:
            raise HTTPException(status_code=500, detail=f"Failed to delete early exit reason: {delete_result['error']}")
        
        # Broadcast the deletion
        current_time = get_local_time()
        await broadcast_attendance_update({
            "action": "delete_early_exit_reason",
            "employee_id": employee_id,
            "name": employee_name,
            "attendance_id": attendance_id,
            "reason_id": reason_id,
            "timestamp": current_time.isoformat()
        })
        
        logger.info(f"Early exit reason deleted successfully: ID {reason_id}")
        return {"message": "Early exit reason deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting early exit reason: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 