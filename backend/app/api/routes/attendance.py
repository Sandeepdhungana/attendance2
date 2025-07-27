import asyncio
from fastapi import APIRouter,  HTTPException, File, UploadFile, Form, Depends
from typing import List, Dict, Any, Optional
from app.database import query, delete
from app.services.attendance import get_attendance_records, get_employee_shift_info
from app.utils.processing import process_attendance_for_employee
from app.dependencies import get_face_recognition
from app.utils.websocket import broadcast_attendance_update
from app.utils.time_utils import get_local_time
from app.services.send_email import send_welcome_email
from app.middleware.auth import get_current_user, get_admin_user
import logging
import numpy as np
import cv2
from app.models import Employee, Shift
from pydantic import BaseModel
from datetime import datetime
from app.api.routes.websocket import EmployeeCache

logger = logging.getLogger(__name__)

router = APIRouter()


class ShiftUpdate(BaseModel):
    name: str
    login_time: str
    logout_time: str
    grace_period: int = 30


class EmployeeUpdate(BaseModel):
    employee_id: str
    department: str
    position: str
    status: str
    shift_id: str


class EmployeeRegistration(BaseModel):
    name: str
    employee_id: str
    department: str
    position: str
    status: str = "active"
    shift_id: str
    image: UploadFile


@router.get("/attendance")
def get_attendance(current_user: dict = Depends(get_admin_user)):
    """Get attendance records for the current user"""
    # Filter attendance records by current user's employee_id
    attendance_records = query("Attendance", where={
        "employee_id": current_user["employee_id"]
    }, order="-timestamp")
    
    if not attendance_records:
        return []
    
    # Get employee information for the current user
    employee = query("Employee", where={
        "employee_id": current_user["employee_id"]
    }, limit=1)
    
    employee_name = employee[0]["name"] if employee else "Unknown"
    
    # Format the response
    return [{
        "name": employee_name,
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


@router.delete("/attendance/{attendance_id}")
async def delete_attendance(attendance_id: str, current_user: dict = Depends(get_admin_user)):
    """Delete an attendance record (admin only)"""
    try:
        logger.info(
            f"Attempting to delete attendance record with ID: {attendance_id}")

        # Get the attendance record first
        attendance = query("Attendance", where={
                           "objectId": attendance_id}, limit=1)

        if not attendance:
            logger.warning(
                f"Attendance record not found with ID: {attendance_id}")
            raise HTTPException(
                status_code=404, detail="Attendance record not found")
        
        # Admin can delete any attendance record (no ownership check needed)

        attendance = attendance[0]
        employee_id = attendance["employee_id"]
        objectId = attendance["objectId"]

        logger.info(f"Found attendance record for employee ID: {employee_id}")

        employee = query("Employee", where={
                         "employee_id": employee_id}, limit=1)
        employee_name = employee[0]["name"] if employee else "Unknown"

        # Delete the attendance record
        delete("Attendance", attendance_id)
        logger.info(
            f"Successfully deleted attendance record with ID: {attendance_id}")

        # Create attendance update for broadcasting
        attendance_update = {
            "action": "delete",
            "employee_id": employee_id,
            "id": employee_id,  # Set id for proper matching in frontend
            "objectId": objectId,  # Include objectId for proper referencing
            "attendance_id": attendance_id,
            "timestamp": get_local_time().isoformat()
        }

        # Broadcast immediately instead of queueing
        await broadcast_attendance_update([attendance_update])

        return {"message": "Attendance record deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/attendance")
async def mark_attendance(
    image: UploadFile = File(...),
    # Parameter kept for backward compatibility, but ignored
    entry_type: str = Form("entry")
):
    """Mark attendance for an employee based on face recognition"""
    try:
        # Read and decode image
        contents = await image.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # Get face recognition instance
        face_recognition = get_face_recognition()

        # Get all face embeddings from the image with liveness detection
        face_embeddings, liveness_info = face_recognition.get_embeddings_with_liveness(img)
        
        # Check if liveness detection failed
        if not liveness_info.get("liveness_passed", False):
            logger.warning(f"Anti-spoofing failed during attendance marking: {liveness_info.get('message', 'Unknown reason')}")
            raise HTTPException(
                status_code=400, 
                detail=f"Security verification failed: {liveness_info.get('message', 'Potential spoofing attempt detected')}. Please try again with a live photo."
            )
        
        if not face_embeddings:
            raise HTTPException(
                status_code=400, detail="No face detected in image")

        # Get all employees from the database
        employees = query("Employee")

        # Find matches for all detected faces
        matches = face_recognition.find_matches_for_embeddings(
            face_embeddings, employees)

        if not matches:
            raise HTTPException(
                status_code=400,
                detail="No matching employees found in the image"
            )

        # Process each matched employee - always use 'entry' type
        # The backend will handle auto-exit detection internally
        processed_employees = []
        attendance_updates = []

        for match in matches:
            employee = match['employee']
            similarity = match['similarity']

            # Always pass 'entry' as the type - processing.py will handle exit detection
            result = process_attendance_for_employee(
                employee, similarity, 'entry')

            if result["processed_employee"]:
                processed_employees.append(result["processed_employee"])

            if result["attendance_update"]:
                attendance_updates.append(result["attendance_update"])

        # Broadcast attendance updates
        if attendance_updates:
            await broadcast_attendance_update(attendance_updates)

        # Return response with all processed employees
        return {
            "multiple_employees": True,
            "employees": processed_employees
        }
    except Exception as e:
        logger.error(f"Error marking attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/early-exit-reasons/{reason_id}")
async def delete_early_exit_reason(reason_id: str):
    """Delete an early exit reason"""
    try:
        # Get the early exit reason
        reason = query("EarlyExitReason", where={
                       "objectId": reason_id}, limit=1)
        if not reason:
            raise HTTPException(
                status_code=404, detail="Early exit reason not found")

        reason = reason[0]
        employee_id = reason["employee_id"]
        attendance_id = reason["attendance_id"]

        # Get employee info
        employee = query("Employee", where={
                         "employee_id": employee_id}, limit=1)
        employee_name = employee[0]["name"] if employee else "Unknown"

        # Delete the early exit reason
        delete("EarlyExitReason", reason_id)

        # Create update for broadcasting
        update = {
            "action": "delete_early_exit_reason",
            "employee_id": employee_id,
            "name": employee_name,
            "attendance_id": attendance_id,
            "reason_id": reason_id,
            "timestamp": get_local_time().isoformat()
        }

        # Broadcast immediately instead of queueing
        await broadcast_attendance_update([update])

        logger.info(f"Early exit reason deleted successfully: ID {reason_id}")
        return {"message": "Early exit reason deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting early exit reason: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/shifts")
def get_shifts(current_user: dict = Depends(get_admin_user)):
    """Get all available shifts (admin only)"""
    shifts = query("Shift")
    return [{
        "objectId": shift["objectId"],
        "name": shift["name"],
        "login_time": shift["login_time"],
        "logout_time": shift["logout_time"],
        "grace_period": shift.get("grace_period", 0),
        "created_at": shift["createdAt"],
        "updated_at": shift["updatedAt"]
    } for shift in shifts]


@router.post("/shifts")
def create_shift(shift_data: ShiftUpdate):
    """Create a new shift"""
    try:
        shift = Shift()
        result = shift.create({
            "name": shift_data.name,
            "login_time": shift_data.login_time,
            "logout_time": shift_data.logout_time,
            "grace_period": shift_data.grace_period
        })
        return {
            "message": "Shift created successfully",
            "shift": result
        }
    except Exception as e:
        logger.error(f"Error creating shift: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/shifts/{shift_id}")
def update_shift(shift_id: str, shift_data: ShiftUpdate):
    """Update an existing shift"""
    try:
        shift = Shift()
        result = shift.update(shift_id, {
            "name": shift_data.name,
            "login_time": shift_data.login_time,
            "logout_time": shift_data.logout_time,
            "grace_period": shift_data.grace_period,
            "updated_at": {
                "__type": "Date",
                "iso": get_local_time().isoformat()
            }
        })
        return {
            "message": "Shift updated successfully",
            "shift": result
        }
    except Exception as e:
        logger.error(f"Error updating shift: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/shifts/{shift_id}")
def delete_shift(shift_id: str):
    """Delete a shift"""
    try:
        # Check if the shift exists first
        shift_model = Shift()
        shift_data = shift_model.get(shift_id)

        if not shift_data:
            logger.error(f"Shift not found with ID: {shift_id}")
            raise HTTPException(status_code=404, detail="Shift not found")

        # Check if any employees are using this shift
        try:
            employees = query("Employee", where={
                              "shift": {"__type": "Pointer", "className": "Shift", "objectId": shift_id}})
            if employees and len(employees) > 0:
                # Get the employee names for better error message
                employee_names = [e.get(
                    "name", f"ID: {e.get('employee_id', 'Unknown')}") for e in employees if isinstance(e, dict)]
                employee_list = ", ".join(employee_names[:5])
                if len(employee_names) > 5:
                    employee_list += f" and {len(employee_names) - 5} more"

                logger.warning(
                    f"Cannot delete shift {shift_id} as it is assigned to employees: {employee_list}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot delete shift as it is assigned to employees: {employee_list}"
                )
        except Exception as query_err:
            # If we can't query employees, log the error but continue with deletion
            logger.error(
                f"Error checking employees for shift {shift_id}: {str(query_err)}")

        logger.info(f"Deleting shift with ID: {shift_id}")

        # Try to delete the shift
        try:
            result = shift_model.delete(shift_id)

            # Check if there was an error in the response
            if isinstance(result, dict) and result.get("error"):
                logger.error(
                    f"Error response from API when deleting shift {shift_id}: {result}")
                raise HTTPException(
                    status_code=500, detail=f"API Error: {result.get('error')}")

            logger.info(f"Shift deleted successfully: ID {shift_id}")
            return {"message": "Shift deleted successfully"}
        except Exception as delete_err:
            logger.error(
                f"Error during shift deletion API call: {str(delete_err)}")
            raise HTTPException(
                status_code=500, detail=f"Error deleting shift: {str(delete_err)}")
    except HTTPException:
        # Re-raise HTTPExceptions to preserve status code and details
        raise
    except Exception as e:
        logger.error(f"Error in delete_shift: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/register")
async def register_employee(
    employee_id: str = Form(...),
    name: str = Form(...),
    department: str = Form(...),
    position: str = Form(...),
    status: str = Form("active"),
    shift_id: str = Form(...),
    email: Optional[str] = Form(None),
    image: UploadFile = File(...)
):
    """Register a new employee"""
    try:
        # Read and decode image
        contents = await image.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # Get face embedding with liveness detection
        face_recognition = get_face_recognition()
        embedding, liveness_info = face_recognition.get_embedding_with_liveness(img)
        
        # Check if liveness detection failed
        if not liveness_info.get("liveness_passed", False):
            logger.warning(f"Anti-spoofing failed during registration for employee {employee_id}: {liveness_info.get('message', 'Unknown reason')}")
            raise HTTPException(
                status_code=400, 
                detail=f"Security verification failed: {liveness_info.get('message', 'Potential spoofing attempt detected')}. Please try again with a live photo."
            )
        
        if embedding is None:
            raise HTTPException(
                status_code=400, detail="No face detected in image")

        # Check if employee already exists
        employee = EmployeeCache.get_employee(employee_id)
        if employee:
            raise HTTPException(
                status_code=400,
                detail="Employee ID already registered"
            )

        # Check if this face is already registered by comparing with existing employees
        all_employees = EmployeeCache.get_all_employees()

        # Find matches with similarity > 0.6
        face_similarity_threshold = 0.6
        matches = face_recognition.find_matches_for_embeddings(
            [embedding], all_employees, threshold=face_similarity_threshold
        )

        if matches:
            # If we found a matching face with similarity > 0.6
            match = matches[0]  # Get the best match
            similar_employee = match['employee']
            similarity = match['similarity']
            similarity_percent = round(similarity * 100, 1)

            logger.info(
                f"Face similarity match found: {similar_employee.get('name')} with {similarity_percent}% similarity")

            try:
                raise HTTPException(
                    status_code=400,
                    detail=f"Face already registered to employee {similar_employee.get('name')} (ID: {similar_employee.get('employee_id')}) with {similarity_percent}% similarity"
                )
            except HTTPException:
                # Re-raise HTTPExceptions to preserve status code and details
                raise

        # Create new employee
        employee_data = {
            "employee_id": employee_id,
            "name": name,
            "department": department,
            "position": position,
            "status": status,
            "embedding": face_recognition.embedding_to_str(embedding),
            "shift": {
                "__type": "Pointer",
                "className": "Shift",
                "objectId": shift_id
            }
        }

        # Add email if provided
        if email:
            employee_data["email"] = email

        new_employee = Employee().create(employee_data)

        # Broadcast user registration immediately
        attendance_update = {
            "action": "register_user",
            "user_id": employee_id,
            "name": name,
            "timestamp": get_local_time().isoformat()
        }
        
        await broadcast_attendance_update([attendance_update])

        # Send welcome email to the new employee if email is provided
        if email:
            send_welcome_email(
                employee_data={
                    "employee_id": employee_id,
                    "name": name,
                    "department": department,
                    "position": position
                },
                employee_email=email
            )

        logger.info(
            f"Employee registered successfully: {employee_id} ({name})")
        return {"message": "Employee registered successfully"}

    except HTTPException as he:
        # Re-raise HTTP exceptions to preserve status code and details
        logger.error(f"HTTP error during employee registration: {str(he)}")
        raise
    except Exception as e:
        logger.error(f"Error registering employee: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )


@router.get("/employees/{employee_id}/shift")
def get_employee_shift(employee_id: str):
    """Get shift information for a specific employee"""
    try:
        shift_info = get_employee_shift_info(employee_id)
        return shift_info
    except Exception as e:
        logger.error(f"Error getting employee shift: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/attendance/by-date/{date}")
def get_attendance_by_date(date: str, current_user: dict = Depends(get_admin_user)):
    """Get attendance records for a specific date (YYYY-MM-DD format)"""
    try:
        # Parse the date string
        try:
            parsed_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status_code=400, 
                detail="Invalid date format. Please use YYYY-MM-DD format."
            )
        
        # Get the local timezone from configuration
        local_timezone = get_local_time().tzinfo
        
        # Create timezone-aware start and end of day
        day_start = datetime.combine(parsed_date, datetime.min.time())
        day_end = datetime.combine(parsed_date, datetime.max.time())
        
        # Localize to the local timezone
        day_start = local_timezone.localize(day_start)
        day_end = local_timezone.localize(day_end)
        
        # Convert to ISO format for database query
        day_start_iso = day_start.isoformat()
        day_end_iso = day_end.isoformat()

        logger.info(f"Timezone-aware day start: {day_start_iso}")
        logger.info(f"Timezone-aware day end: {day_end_iso}")
        logger.info(f"Date: {date}")
        logger.info(f"Local timezone: {local_timezone}")
        
        logger.info(f"Fetching attendance records for date: {date}")
        
        # Query attendance records for the specified date using both entry_time and timestamp
        attendance_records = query("Attendance", where={
            "$or": [
                {
                    "entry_time": {
                        "$gte": day_start_iso,
                        "$lte": day_end_iso
                    }
                },
                {
                    "timestamp": {
                        "$gte": {"__type": "Date", "iso": day_start_iso},
                        "$lte": {"__type": "Date", "iso": day_end_iso}
                    }
                }
            ]
        }, order="-timestamp")
        
        if not attendance_records:
            logger.info(f"No attendance records found for date: {date}")
            return []
        
        # Collect all unique employee IDs
        employee_ids = list(set(att["employee_id"] for att in attendance_records))
        
        # Batch fetch all employees at once
        employees = EmployeeCache.get_employees_batch(employee_ids)
        
        # Create a lookup dictionary for quick access
        employee_lookup = {emp["employee_id"]: emp for emp in employees if emp}
        
        # Process and return the records
        result = []
        for att in attendance_records:
            employee = employee_lookup.get(att["employee_id"])
            employee_name = employee.get("name", "Unknown") if employee else "Unknown"
            
            # Get entry_time, preferring the direct field over timestamp
            entry_time = att.get("entry_time")
            if not entry_time:
                entry_time = att.get("timestamp", {}).get("iso") if isinstance(att.get("timestamp"), dict) else att.get("timestamp")
            
            result.append({
                "name": employee_name,
                "objectId": att["objectId"],
                "id": att["employee_id"],
                "employee_id": att["employee_id"],
                "timestamp": att["timestamp"],
                "entry_time": entry_time,
                "exit_time": att.get("exit_time", {}).get("iso") if isinstance(att.get("exit_time"), dict) else att.get("exit_time"),
                "confidence": att.get("confidence", 0),
                "is_late": att.get("is_late", False),
                "is_early_exit": att.get("is_early_exit", False),
                "early_exit_reason": att.get("early_exit_reason"),
                "late_message": att.get("late_message"),
                "created_at": att.get("createdAt"),
                "updated_at": att.get("updatedAt")
            })
            
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching attendance by date: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch attendance records: {str(e)}")


@router.get("/attendance/analytics")
def get_attendance_analytics(
    start_date: str = None,
    end_date: str = None,
    employee_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get comprehensive attendance analytics for the current user or specific employee (non-admin users can only see their own data)"""
    try:
        from datetime import datetime, timedelta
        from app.utils.time_utils import get_local_time
        
        # Determine target employee ID
        if employee_id:
            # Only admins can query other employees' data
            if not current_user.get("is_admin", False):
                raise HTTPException(status_code=403, detail="Admin access required to view other employees' data")
            target_employee_id = employee_id
        else:
            # Regular users can only see their own data
            target_employee_id = current_user["employee_id"]
        
        # Default to current month if no dates provided
        if not start_date or not end_date:
            current_date = get_local_time().date()
            start_date = current_date.replace(day=1).strftime('%Y-%m-%d')
            # Last day of current month
            next_month = current_date.replace(day=28) + timedelta(days=4)
            end_date = (next_month - timedelta(days=next_month.day)).strftime('%Y-%m-%d')
        
        # Parse dates
        try:
            start_parsed = datetime.strptime(start_date, "%Y-%m-%d").date()
            end_parsed = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        if start_parsed > end_parsed:
            raise HTTPException(status_code=400, detail="Start date must be before end date")
        
        # Get local timezone
        local_timezone = get_local_time().tzinfo
        
        # Create timezone-aware datetime objects
        start_datetime = datetime.combine(start_parsed, datetime.min.time())
        end_datetime = datetime.combine(end_parsed, datetime.max.time())
        
        start_datetime = local_timezone.localize(start_datetime)
        end_datetime = local_timezone.localize(end_datetime)
        
        # If admin requests all employees (no employee_id specified), return aggregated data
        if current_user.get("is_admin", False) and not employee_id:
            # Query all attendance records for the date range
            attendance_records = query("Attendance", where={
                "$or": [
                    {
                        "entry_time": {
                            "$gte": start_datetime.isoformat(),
                            "$lte": end_datetime.isoformat()
                        }
                    },
                    {
                        "timestamp": {
                            "$gte": {"__type": "Date", "iso": start_datetime.isoformat()},
                            "$lte": {"__type": "Date", "iso": end_datetime.isoformat()}
                        }
                    }
                ]
            }, order="-timestamp")
            
            # Get all employees for employee lookup
            employees = query("Employee")
            employee_lookup = {emp["employee_id"]: emp for emp in employees}
            
            # Calculate aggregated metrics
            total_working_days = 0
            present_days_per_employee = {}
            late_arrivals = 0
            early_exits = 0
            total_working_hours = 0
            on_time_arrivals = 0
            
            # Calculate working days (excluding weekends)
            current_date = start_parsed
            while current_date <= end_parsed:
                if current_date.weekday() < 5:  # Monday = 0, Sunday = 6
                    total_working_days += 1
                current_date += timedelta(days=1)
            
            # Process records
            for record in attendance_records:
                emp_id = record["employee_id"]
                
                # Track present days per employee
                if emp_id not in present_days_per_employee:
                    present_days_per_employee[emp_id] = set()
                
                # Get entry date
                entry_time = record.get("entry_time")
                if not entry_time:
                    timestamp = record.get("timestamp", {})
                    entry_time = timestamp.get("iso") if isinstance(timestamp, dict) else timestamp
                
                if entry_time:
                    if isinstance(entry_time, str):
                        entry_date = datetime.fromisoformat(entry_time.replace('Z', '+00:00')).date()
                    else:
                        entry_date = entry_time.date()
                    present_days_per_employee[emp_id].add(entry_date)
                
                # Count metrics
                if record.get("is_late"):
                    late_arrivals += 1
                else:
                    on_time_arrivals += 1
                
                if record.get("is_early_exit"):
                    early_exits += 1
                
                # Calculate working hours
                exit_time = record.get("exit_time")
                if entry_time and exit_time:
                    try:
                        if isinstance(entry_time, str):
                            entry_dt = datetime.fromisoformat(entry_time.replace('Z', '+00:00'))
                        else:
                            entry_dt = entry_time
                        
                        if isinstance(exit_time, dict) and exit_time.get("iso"):
                            exit_dt = datetime.fromisoformat(exit_time["iso"].replace('Z', '+00:00'))
                        elif isinstance(exit_time, str):
                            exit_dt = datetime.fromisoformat(exit_time.replace('Z', '+00:00'))
                        else:
                            exit_dt = exit_time
                        
                        work_duration = exit_dt - entry_dt
                        hours_worked = work_duration.total_seconds() / 3600
                        if hours_worked > 0 and hours_worked < 24:
                            total_working_hours += hours_worked
                    except Exception as e:
                        logger.warning(f"Error calculating working hours: {str(e)}")
            
            # Calculate aggregated metrics
            total_employees = len(employee_lookup)
            total_present_days = sum(len(days) for days in present_days_per_employee.values())
            total_expected_days = total_working_days * total_employees
            total_absent_days = total_expected_days - total_present_days
            
            attendance_percentage = (total_present_days / total_expected_days * 100) if total_expected_days > 0 else 0
            on_time_percentage = (on_time_arrivals / len(attendance_records) * 100) if attendance_records else 0
            average_working_hours = total_working_hours / total_present_days if total_present_days > 0 else 0
            
            return {
                "date_range": {
                    "start_date": start_date,
                    "end_date": end_date,
                    "total_days": (end_parsed - start_parsed).days + 1,
                    "working_days": total_working_days
                },
                "attendance_summary": {
                    "present_days": total_present_days,
                    "absent_days": total_absent_days,
                    "attendance_percentage": round(attendance_percentage, 2),
                    "total_records": len(attendance_records),
                    "total_employees": total_employees
                },
                "punctuality": {
                    "on_time_arrivals": on_time_arrivals,
                    "late_arrivals": late_arrivals,
                    "on_time_percentage": round(on_time_percentage, 2),
                    "early_exits": early_exits
                },
                "working_hours": {
                    "total_hours": round(total_working_hours, 2),
                    "average_daily_hours": round(average_working_hours, 2),
                    "expected_daily_hours": 8.0,  # Default for aggregated view
                    "expected_total_hours": round(8.0 * total_present_days, 2),
                    "hours_completion_percentage": round((total_working_hours / (8.0 * total_present_days) * 100) if total_present_days > 0 else 0, 2)
                },
                "employee_info": {
                    "name": "All Employees",
                    "employee_id": "all",
                    "department": "All Departments",
                    "shift": None,
                    "is_aggregated": True
                }
            }
        
        # Query attendance records for specific employee
        attendance_records = query("Attendance", where={
            "employee_id": target_employee_id,
            "$or": [
                {
                    "entry_time": {
                        "$gte": start_datetime.isoformat(),
                        "$lte": end_datetime.isoformat()
                    }
                },
                {
                    "timestamp": {
                        "$gte": {"__type": "Date", "iso": start_datetime.isoformat()},
                        "$lte": {"__type": "Date", "iso": end_datetime.isoformat()}
                    }
                }
            ]
        }, order="-timestamp")
        
        # Get employee info for shift details
        employee = query("Employee", where={"employee_id": target_employee_id}, limit=1)
        employee_data = employee[0] if employee else None
        
        if not employee_data:
            raise HTTPException(status_code=404, detail="Employee not found")
        
        # Get shift info
        shift_info = None
        if employee_data and employee_data.get("shift"):
            shift_id = employee_data["shift"].get("objectId") if isinstance(employee_data["shift"], dict) else employee_data["shift"]
            if shift_id:
                shift_data = query("Shift", where={"objectId": shift_id}, limit=1)
                shift_info = shift_data[0] if shift_data else None
        
        # Calculate total working days in range (excluding weekends)
        working_days = 0
        current_date = start_parsed
        while current_date <= end_parsed:
            if current_date.weekday() < 5:  # Monday = 0, Sunday = 6
                working_days += 1
            current_date += timedelta(days=1)
        
        # Process attendance records
        present_days = set()
        late_arrivals = 0
        early_exits = 0
        total_working_hours = 0
        on_time_arrivals = 0
        
        for record in attendance_records:
            # Get entry date
            entry_time = record.get("entry_time")
            if not entry_time:
                timestamp = record.get("timestamp", {})
                entry_time = timestamp.get("iso") if isinstance(timestamp, dict) else timestamp
            
            if entry_time:
                if isinstance(entry_time, str):
                    entry_date = datetime.fromisoformat(entry_time.replace('Z', '+00:00')).date()
                else:
                    entry_date = entry_time.date()
                present_days.add(entry_date)
            
            # Count late arrivals
            if record.get("is_late"):
                late_arrivals += 1
            else:
                on_time_arrivals += 1
            
            # Count early exits
            if record.get("is_early_exit"):
                early_exits += 1
            
            # Calculate working hours if both entry and exit times exist
            exit_time = record.get("exit_time")
            if entry_time and exit_time:
                try:
                    if isinstance(entry_time, str):
                        entry_dt = datetime.fromisoformat(entry_time.replace('Z', '+00:00'))
                    else:
                        entry_dt = entry_time
                    
                    if isinstance(exit_time, dict) and exit_time.get("iso"):
                        exit_dt = datetime.fromisoformat(exit_time["iso"].replace('Z', '+00:00'))
                    elif isinstance(exit_time, str):
                        exit_dt = datetime.fromisoformat(exit_time.replace('Z', '+00:00'))
                    else:
                        exit_dt = exit_time
                    
                    # Calculate hours worked
                    work_duration = exit_dt - entry_dt
                    hours_worked = work_duration.total_seconds() / 3600
                    if hours_worked > 0 and hours_worked < 24:  # Sanity check
                        total_working_hours += hours_worked
                except Exception as e:
                    logger.warning(f"Error calculating working hours: {str(e)}")
        
        # Calculate metrics
        present_days_count = len(present_days)
        absent_days = working_days - present_days_count
        attendance_percentage = (present_days_count / working_days * 100) if working_days > 0 else 0
        on_time_percentage = (on_time_arrivals / len(attendance_records) * 100) if attendance_records else 0
        average_working_hours = total_working_hours / present_days_count if present_days_count > 0 else 0
        
        # Get expected working hours per day from shift
        expected_daily_hours = 8  # Default
        if shift_info:
            try:
                login_time = shift_info.get("login_time", "09:00")
                logout_time = shift_info.get("logout_time", "17:00")
                
                login_hour, login_min = map(int, login_time.split(":"))
                logout_hour, logout_min = map(int, logout_time.split(":"))
                
                expected_daily_hours = (logout_hour + logout_min/60) - (login_hour + login_min/60)
            except:
                expected_daily_hours = 8
        
        expected_total_hours = expected_daily_hours * present_days_count
        hours_completion_percentage = (total_working_hours / expected_total_hours * 100) if expected_total_hours > 0 else 0
        
        return {
            "date_range": {
                "start_date": start_date,
                "end_date": end_date,
                "total_days": (end_parsed - start_parsed).days + 1,
                "working_days": working_days
            },
            "attendance_summary": {
                "present_days": present_days_count,
                "absent_days": absent_days,
                "attendance_percentage": round(attendance_percentage, 2),
                "total_records": len(attendance_records)
            },
            "punctuality": {
                "on_time_arrivals": on_time_arrivals,
                "late_arrivals": late_arrivals,
                "on_time_percentage": round(on_time_percentage, 2),
                "early_exits": early_exits
            },
            "working_hours": {
                "total_hours": round(total_working_hours, 2),
                "average_daily_hours": round(average_working_hours, 2),
                "expected_daily_hours": expected_daily_hours,
                "expected_total_hours": round(expected_total_hours, 2),
                "hours_completion_percentage": round(hours_completion_percentage, 2)
            },
            "employee_info": {
                "name": employee_data.get("name", "Unknown") if employee_data else "Unknown",
                "employee_id": target_employee_id,
                "department": employee_data.get("department", "") if employee_data else "",
                "shift": {
                    "name": shift_info.get("name", "Default") if shift_info else "Default",
                    "login_time": shift_info.get("login_time", "09:00") if shift_info else "09:00",
                    "logout_time": shift_info.get("logout_time", "17:00") if shift_info else "17:00",
                    "grace_period": shift_info.get("grace_period", 0) if shift_info else 0
                } if shift_info else None,
                "is_aggregated": False
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting attendance analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/attendance/by-date-range")
def get_attendance_by_date_range(
    start_date: str,
    end_date: str,
    employee_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get attendance records for a date range (admin can see all employees, non-admin users see only their own)"""
    try:
        # Parse dates
        try:
            start_parsed = datetime.strptime(start_date, "%Y-%m-%d").date()
            end_parsed = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        if start_parsed > end_parsed:
            raise HTTPException(status_code=400, detail="Start date must be before end date")
        
        # Get local timezone
        local_timezone = get_local_time().tzinfo
        
        # Create timezone-aware datetime objects
        start_datetime = datetime.combine(start_parsed, datetime.min.time())
        end_datetime = datetime.combine(end_parsed, datetime.max.time())
        
        start_datetime = local_timezone.localize(start_datetime)
        end_datetime = local_timezone.localize(end_datetime)
        
        # Determine query parameters based on user role and request
        if employee_id:
            # Only admins can query other employees' data
            if not current_user.get("is_admin", False):
                raise HTTPException(status_code=403, detail="Admin access required to view other employees' data")
            where_clause = {
                "employee_id": employee_id,
                "$or": [
                    {
                        "entry_time": {
                            "$gte": start_datetime.isoformat(),
                            "$lte": end_datetime.isoformat()
                        }
                    },
                    {
                        "timestamp": {
                            "$gte": {"__type": "Date", "iso": start_datetime.isoformat()},
                            "$lte": {"__type": "Date", "iso": end_datetime.isoformat()}
                        }
                    }
                ]
            }
        elif current_user.get("is_admin", False):
            # Admin without employee_id - return all employees' records
            where_clause = {
                "$or": [
                    {
                        "entry_time": {
                            "$gte": start_datetime.isoformat(),
                            "$lte": end_datetime.isoformat()
                        }
                    },
                    {
                        "timestamp": {
                            "$gte": {"__type": "Date", "iso": start_datetime.isoformat()},
                            "$lte": {"__type": "Date", "iso": end_datetime.isoformat()}
                        }
                    }
                ]
            }
        else:
            # Regular user - only their own records
            where_clause = {
                "employee_id": current_user["employee_id"],
                "$or": [
                    {
                        "entry_time": {
                            "$gte": start_datetime.isoformat(),
                            "$lte": end_datetime.isoformat()
                        }
                    },
                    {
                        "timestamp": {
                            "$gte": {"__type": "Date", "iso": start_datetime.isoformat()},
                            "$lte": {"__type": "Date", "iso": end_datetime.isoformat()}
                        }
                    }
                ]
            }
        
        # Query attendance records
        attendance_records = query("Attendance", where=where_clause, order="-timestamp")
        
        if not attendance_records:
            return []
        
        # Get unique employee IDs for batch lookup
        employee_ids = list(set(att["employee_id"] for att in attendance_records))
        
        # Batch fetch employee information
        employees = query("Employee", where={
            "employee_id": {"$in": employee_ids}
        }) if employee_ids else []
        
        # Create employee lookup dictionary
        employee_lookup = {emp["employee_id"]: emp for emp in employees}
        
        # Format response
        return [{
            "name": employee_lookup.get(att["employee_id"], {}).get("name", "Unknown"),
            "objectId": att["objectId"],
            "id": att["employee_id"],
            "employee_id": att["employee_id"],
            "timestamp": att["timestamp"],
            "entry_time": att.get("entry_time") or (att.get("timestamp", {}).get("iso") if isinstance(att.get("timestamp"), dict) else att.get("timestamp")),
            "exit_time": att.get("exit_time", {}).get("iso") if isinstance(att.get("exit_time"), dict) else att.get("exit_time"),
            "confidence": att.get("confidence", 0),
            "is_late": att.get("is_late", False),
            "is_early_exit": att.get("is_early_exit", False),
            "early_exit_reason": att.get("early_exit_reason"),
            "late_message": att.get("late_message"),
            "created_at": att.get("createdAt"),
            "updated_at": att.get("updatedAt")
        } for att in attendance_records]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting attendance by date range: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/anti-spoofing/config")
def get_anti_spoofing_config():
    """Get current anti-spoofing configuration"""
    try:
        face_recognition = get_face_recognition()
        return {
            "enabled": face_recognition.anti_spoofing_enabled,
            "liveness_threshold": face_recognition.liveness_threshold
        }
    except Exception as e:
        logger.error(f"Error getting anti-spoofing config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/anti-spoofing/config")
def update_anti_spoofing_config(
    enabled: bool = Form(...),
    liveness_threshold: float = Form(...)
):
    """Update anti-spoofing configuration"""
    try:
        face_recognition = get_face_recognition()
        
        # Validate threshold
        if not (0.0 <= liveness_threshold <= 1.0):
            raise HTTPException(
                status_code=400, 
                detail="Liveness threshold must be between 0.0 and 1.0"
            )
        
        # Update configuration
        face_recognition.set_anti_spoofing_enabled(enabled)
        face_recognition.set_liveness_threshold(liveness_threshold)
        
        logger.info(f"Anti-spoofing configuration updated: enabled={enabled}, threshold={liveness_threshold}")
        
        return {
            "message": "Anti-spoofing configuration updated successfully",
            "config": {
                "enabled": enabled,
                "liveness_threshold": liveness_threshold
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating anti-spoofing config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
