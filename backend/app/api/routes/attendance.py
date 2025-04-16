from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from typing import List, Dict, Any
from app.database import query, create, delete
from app.services.attendance import get_attendance_records, delete_attendance_record, process_attendance_for_employee
from app.utils.processing import process_image_in_process
from app.dependencies import get_process_pool, get_pending_futures, get_client_tasks, get_queues, get_face_recognition
from app.utils.websocket import broadcast_attendance_update
from app.utils.time_utils import get_local_time
import asyncio
import logging
import numpy as np
import cv2
from app.models import Employee, Attendance, EarlyExitReason, Shift
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

class ShiftUpdate(BaseModel):
    name: str
    login_time: str
    logout_time: str

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
def get_attendance():
    """Get all attendance records"""
    return get_attendance_records()

@router.delete("/attendance/{attendance_id}")
def delete_attendance(attendance_id: str):
    """Delete an attendance record"""
    try:
        logger.info(f"Attempting to delete attendance record with ID: {attendance_id}")
        
        # Get the attendance record first
        attendance = query("Attendance", where={"objectId": attendance_id}, limit=1)
        
        if not attendance:
            logger.warning(f"Attendance record not found with ID: {attendance_id}")
            raise HTTPException(status_code=404, detail="Attendance record not found")
        
        attendance = attendance[0]
        employee_id = attendance["employee_id"]
        objectId = attendance["objectId"]
        
        logger.info(f"Found attendance record for employee ID: {employee_id}")
        
        # Get employee info
        employee = query("Employee", where={"employee_id": employee_id}, limit=1)
        employee_name = employee[0]["name"] if employee else "Unknown"
        
        # Delete the attendance record
        delete("Attendance", attendance_id)
        logger.info(f"Successfully deleted attendance record with ID: {attendance_id}")
        
        # Create attendance update for broadcasting
        attendance_update = {
            "action": "delete",
            "employee_id": employee_id,
            "id": employee_id,  # Set id for proper matching in frontend
            "objectId": objectId,  # Include objectId for proper referencing
            "attendance_id": attendance_id,
            "timestamp": get_local_time().isoformat()
        }
        
        # Add the update to the processing results queue for broadcasting to all clients
        processing_results_queue, websocket_responses_queue = get_queues()
        processing_results_queue.put({
            "type": "attendance_update",
            "data": [attendance_update]
        })
        
        return {"message": "Attendance record deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/attendance")
async def mark_attendance(
    image: UploadFile = File(...),
    entry_type: str = Form("entry")  # Default to entry if not specified
):
    """Mark attendance for an employee based on face recognition"""
    try:
        # Read and decode image
        contents = await image.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # Get face recognition instance
        face_recognition = get_face_recognition()

        # Get all face embeddings from the image
        face_embeddings = face_recognition.get_embeddings(img)
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

        # Process each matched employee
        processed_employees = []
        attendance_updates = []

        for match in matches:
            employee = match['employee']
            similarity = match['similarity']

            # Process attendance using shared function
            result = process_attendance_for_employee(employee, similarity, entry_type)
            
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
def delete_early_exit_reason(reason_id: str):
    """Delete an early exit reason"""
    try:
        # Get the early exit reason
        reason = query("EarlyExitReason", where={"objectId": reason_id}, limit=1)
        if not reason:
            raise HTTPException(status_code=404, detail="Early exit reason not found")
        
        reason = reason[0]
        employee_id = reason["employee_id"]
        attendance_id = reason["attendance_id"]
        
        # Get employee info
        employee = query("Employee", where={"employee_id": employee_id}, limit=1)
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
        
        # Add the update to the processing results queue
        processing_results_queue, _ = get_queues()
        processing_results_queue.put({
            "type": "attendance_update",
            "data": [update]
        })
        
        logger.info(f"Early exit reason deleted successfully: ID {reason_id}")
        return {"message": "Early exit reason deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting early exit reason: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/shifts")
def get_shifts():
    """Get all available shifts"""
    shifts = query("Shift")
    return [{
        "objectId": shift["objectId"],
        "name": shift["name"],
        "login_time": shift["login_time"],
        "logout_time": shift["logout_time"],
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
            "logout_time": shift_data.logout_time
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
            "updated_at": get_local_time().isoformat()
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
        # Check if any employees are using this shift
        employees = query("Employee", where={"shift": {"__type": "Pointer", "className": "Shift", "objectId": shift_id}})
        if employees:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete shift as it is assigned to employees"
            )
        
        shift = Shift()
        shift.delete(shift_id)
        return {"message": "Shift deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting shift: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/register")
async def register_employee(
    name: str = Form(...),
    employee_id: str = Form(...),
    department: str = Form(...),
    position: str = Form(...),
    status: str = Form("active"),
    shift_id: str = Form(...),
    image: UploadFile = File(...)
):
    """Register a new employee with face recognition"""
    try:
        # Check if employee ID already exists
        existing_employee = query("Employee", where={"employee_id": employee_id}, limit=1)
        if existing_employee:
            raise HTTPException(
                status_code=400,
                detail="Employee ID already exists"
            )

        # Check if shift exists
        shift = query("Shift", where={"objectId": shift_id}, limit=1)
        if not shift:
            raise HTTPException(
                status_code=400,
                detail="Invalid shift ID"
            )

        # Read and decode image
        contents = await image.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # Get face recognition instance
        face_recognition = get_face_recognition()

        # Get face embedding
        face_embeddings = face_recognition.get_embeddings(img)
        if not face_embeddings:
            raise HTTPException(
                status_code=400, detail="No face detected in image")

        # Convert embedding to string for storage
        embedding_str = ",".join(map(str, face_embeddings[0]))

        # Create employee record
        employee = Employee()
        result = employee.create({
            "name": name,
            "employee_id": employee_id,
            "department": department,
            "position": position,
            "status": status,
            "embedding": embedding_str,
            "shift": {
                "__type": "Pointer",
                "className": "Shift",
                "objectId": shift_id
            }
        })

        return {
            "message": "Employee registered successfully",
            "employee": result
        }
    except Exception as e:
        logger.error(f"Error registering employee: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 