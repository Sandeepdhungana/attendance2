from fastapi import APIRouter, HTTPException
from ..database import query, create, update, delete
from .. import models
from ..utils.websocket import broadcast_attendance_update
from ..utils.time_utils import get_local_time
import logging
from pydantic import BaseModel
from typing import Optional

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

@router.post("/employee-early-exit")
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
        
        # Create early exit reason using Back4app
        current_time = get_local_time()
        
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
        
        # Check if the new_reason is valid and has objectId
        if not isinstance(new_reason, dict) or not new_reason.get("objectId"):
            logger.error(f"Failed to create early exit reason: {new_reason}")
            raise HTTPException(status_code=500, detail="Failed to create early exit reason")
        
        # Broadcast the update
        await broadcast_attendance_update([{
            "action": "early_exit_reason",
            "employee_id": employee_id,
            "name": employee_name,
            "attendance_id": str(attendance_id),
            "timestamp": current_time.isoformat(),
            "reason": reason,
            "objectId": new_reason.get("objectId")
        }])
        
        logger.info(f"Early exit reason submitted successfully for employee {employee_id}")
        return {"message": "Early exit reason submitted successfully", "attendance_id": str(attendance_id)}
    except Exception as e:
        logger.error(f"Error submitting early exit reason by employee ID: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/early-exit-reason")
async def submit_early_exit_reason(request: EarlyExitRequest):
    """Submit reason for early exit"""
    try:
        attendance_id = request.attendance_id
        reason = request.reason
        employee_id_override = request.employee_id  # Get optional employee_id
        
        logger.info(f"Received early exit reason submission - attendance_id: {attendance_id}, reason: {reason}, employee_id_override: {employee_id_override}")
        
        if not reason:
            raise HTTPException(status_code=400, detail="Missing required fields")
        
        # If employee_id is provided directly and attendance_id looks like a dummy value (0 or 1),
        # try to find the most recent attendance record for this employee
        if employee_id_override and (attendance_id == 0 or attendance_id == 1):
            logger.info(f"Using employee_id_override to find attendance: {employee_id_override}")
            
            # Find the most recent attendance record for this employee
            attendance_records = query(
                "Attendance", 
                where={"employee_id": employee_id_override}, 
                order="-created_at",
                limit=1
            )
            
            if not attendance_records:
                logger.error(f"No attendance records found for employee: {employee_id_override}")
                raise HTTPException(status_code=404, detail="No attendance records found for this employee")
            
            attendance = attendance_records[0]
            employee_id = employee_id_override
            attendance_id = attendance.get("objectId")
            
            logger.info(f"Found attendance record with ID: {attendance_id} for employee: {employee_id}")
        else:
            # Original logic - get attendance record using Back4app query
            attendance_records = query("Attendance", where={"objectId": str(attendance_id)}, limit=1)
            
            if not attendance_records:
                logger.error(f"Attendance record not found for ID: {attendance_id}")
                raise HTTPException(status_code=404, detail="Attendance record not found")
                
            attendance = attendance_records[0]
            employee_id = attendance.get("employee_id")
            
            if not employee_id:
                logger.error(f"Employee ID missing in attendance record: {attendance}")
                raise HTTPException(status_code=400, detail="Invalid attendance record (missing employee_id)")
        
        # Get employee info for pointer and broadcasting
        employee_records = query("Employee", where={"employee_id": employee_id}, limit=1)
        if not employee_records:
            logger.error(f"Employee not found with ID: {employee_id}")
            raise HTTPException(status_code=404, detail=f"Employee not found with ID: {employee_id}")
            
        employee_name = employee_records[0].get("name", "Unknown")
        employee_object_id = employee_records[0].get("objectId")
        
        if not employee_object_id:
            logger.error(f"Employee object ID missing in employee record: {employee_records[0]}")
            raise HTTPException(status_code=400, detail=f"Invalid employee record (missing objectId)")
        
        # Create early exit reason using Back4app
        current_time = get_local_time()
        
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
        
        # Broadcast the update
        await broadcast_attendance_update([{
            "action": "early_exit_reason",
            "employee_id": employee_id,
            "name": employee_name,
            "attendance_id": str(attendance_id),
            "timestamp": current_time.isoformat(),
            "reason": reason,
            "objectId": new_reason.get("objectId")
        }])
        
        logger.info(f"Early exit reason submitted successfully for employee {employee_id}")
        return {"message": "Early exit reason submitted successfully"}
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
            employee_records = query("Employee", where={"employee_id": employee_id}, limit=1)
            employee_name = employee_records[0].get("name") if employee_records else "Unknown"
            
            formatted_reasons.append({
                "id": reason.get("objectId"),
                "user_id": reason.get("employee_id"),
                "user_name": employee_name,
                "attendance_id": reason.get("attendance_id"),
                "reason": reason.get("reason"),
                "timestamp": reason.get("created_at")
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
        
        if not reasons:
            raise HTTPException(status_code=404, detail="Early exit reason not found")
        
        reason = reasons[0]
        employee_id = reason.get("employee_id")
        attendance_id = reason.get("attendance_id")
        
        # Get employee info
        employee_records = query("Employee", where={"employee_id": employee_id}, limit=1)
        employee_name = employee_records[0].get("name") if employee_records else "Unknown"
        
        # Delete the early exit reason
        delete("EarlyExitReason", reason_id)
        
        # Broadcast the deletion
        current_time = get_local_time()
        await broadcast_attendance_update([{
            "action": "delete_early_exit_reason",
            "employee_id": employee_id,
            "name": employee_name,
            "attendance_id": attendance_id,
            "reason_id": reason_id,
            "timestamp": current_time.isoformat()
        }])
        
        logger.info(f"Early exit reason deleted successfully: ID {reason_id}")
        return {"message": "Early exit reason deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting early exit reason: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 