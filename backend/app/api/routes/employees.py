from fastapi import APIRouter, HTTPException, File, UploadFile, Form
from typing import Optional
from app.services.employee import get_employees, delete_employee
from app.dependencies import get_face_recognition
from app.utils.time_utils import get_local_time
from app.dependencies import get_queues
from app.models import Employee
from app.services.send_email import send_welcome_email
from app.database import query as db_query
from pydantic import BaseModel
import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class EmployeeUpdate(BaseModel):
    employee_id: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    status: Optional[str] = None
    shift_id: Optional[str] = None

@router.get("/employees")
def get_employees_route():
    """Get all employees"""
    try:
        employees = get_employees()
        return employees
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/employees/{employee_id}")
def get_employee_route(employee_id: str):
    """Get a specific employee by employee_id"""
    try:
        logger.info(f"Fetching employee with ID: {employee_id}")
        
        # Query by employee_id, not objectId
        employees = db_query("Employee", where={
            "employee_id": {
                "$in": [employee_id]
            }
        })

        
        if not employees:
            logger.warning(f"Employee not found with ID: {employee_id}")
            raise HTTPException(status_code=404, detail="Employee not found")
        
        employee = employees[0]
        logger.info(f"Found employee: {employee.get('name')} with objectId: {employee.get('objectId')}")
        
        # Format the response with shift information
        shift = None
        try:
            if employee.get("shift"):
                if isinstance(employee["shift"], dict) and employee["shift"].get("objectId"):
                    shift_id = employee["shift"]["objectId"]
                    logger.info(f"Looking up shift with ID: {shift_id}")
                    shifts = db_query("Shift", where={"objectId": shift_id})
                    if shifts:
                        shift = shifts[0]
                        logger.info(f"Found shift: {shift.get('name')}")
                    else:
                        logger.warning(f"Shift not found with ID: {shift_id}")
                else:
                    logger.info(f"Employee shift data format: {employee.get('shift')}")
        except Exception as shift_error:
            logger.error(f"Error fetching shift data: {str(shift_error)}")
            # Continue without shift data rather than failing completely
            shift = None
        
        # Safely get date fields
        created_at = employee.get("createdAt")
        updated_at = employee.get("updatedAt")
        
        # Handle different date formats that might come from Parse Server
        if isinstance(created_at, dict) and "iso" in created_at:
            created_at = created_at["iso"]
        if isinstance(updated_at, dict) and "iso" in updated_at:
            updated_at = updated_at["iso"]
        
        formatted_employee = {
            "objectId": employee.get("objectId"),
            "employee_id": employee.get("employee_id"),
            "name": employee.get("name"),
            "department": employee.get("department", ""),
            "position": employee.get("position", ""),
            "status": employee.get("status", "active"),
            "email": employee.get("email", ""),
            "phone_number": employee.get("phone_number", ""),
            "shift": shift,
            "created_at": created_at,
            "updated_at": updated_at
        }
        
        logger.info(f"Successfully formatted employee data for: {employee_id}")
        return formatted_employee
        
    except HTTPException:
        # Re-raise HTTP exceptions to preserve status code
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting employee {employee_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.put("/employees/{employee_id}")
async def update_employee_route(
    employee_id: str,
    employee_data: EmployeeUpdate
):
    """Update employee details"""
    try:
        update_data = {}
        print(employee_data)
        
        if employee_data.department:
            update_data["department"] = employee_data.department
        if employee_data.position:
            update_data["position"] = employee_data.position
        if employee_data.status:
            update_data["status"] = employee_data.status
        if employee_data.shift_id:
            update_data["shift"] = {
                "__type": "Pointer",
                "className": "Shift",
                "objectId": employee_data.shift_id
            }

        if not update_data:
            raise HTTPException(status_code=400, detail="No update data provided")

        # Get current time as a datetime object
        current_time = get_local_time()
        update_data["updatedAt"] = {
            "__type": "Date",
            "iso": current_time.isoformat()
        }
        
        result = Employee().update(employee_id, update_data)
        return {
            "message": "Employee details updated successfully",
            "employee": result
        }
    except Exception as e:
        logger.error(f"Error updating employee: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/employees/{employee_id}")
def delete_employee_route(employee_id: str):
    """Delete an employee"""
    try:
        # Check if the employee_id is an objectId format (Parse server format)
        is_object_id = len(employee_id) >= 10 and "-" not in employee_id and not employee_id.isdigit()
        
        logger.info(f"Deleting employee: {employee_id}, is_object_id: {is_object_id}")
        
        if is_object_id:
            # Delete using objectId
            result = delete_employee(employee_id="", object_id=employee_id)
        else:
            # Delete by employee_id
            result = delete_employee(employee_id=employee_id)
        
        # Get the identifier for broadcasting - use the one that was in the result message
        broadcast_id = employee_id
        if "Employee deleted successfully" in result.get("message", ""):
            # When we delete by objectId, we don't know the employee_id
            broadcast_id = "unknown"
        elif "Employee " in result.get("message", ""):
            # When we delete by employee_id, the message contains it
            parts = result.get("message", "").split("Employee ")
            if len(parts) > 1:
                broadcast_id = parts[1].split(" ")[0]
        
        # Broadcast user deletion
        attendance_update = {
            "action": "delete_user",
            "user_id": broadcast_id,
            "object_id": result.get("object_id", ""),
            "timestamp": get_local_time().isoformat()
        }
        processing_results_queue, _ = get_queues()
        processing_results_queue.put({
            "type": "attendance_update",
            "data": [attendance_update]
        })
        
        return result
    except Exception as e:
        logger.error(f"Error deleting employee: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail={
                "error": str(e),
                "employee_id": employee_id,
            }
        )

@router.post("/employees/register")
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

        # Get face embedding
        face_recognition = get_face_recognition()
        embedding = face_recognition.get_embedding(img)
        logger.info(f"Embedding: {embedding}")
        if embedding is None:
            raise HTTPException(
                status_code=400, detail="No face detected in image")

        # Check if employee already exists
        employee_model = Employee()
        existing_employee = employee_model.query(where={"employee_id": employee_id})
        if existing_employee:
            raise HTTPException(
                status_code=400,
                detail="Employee ID already registered"
            )
            
        # Check if this face is already registered by comparing with existing employees
        all_employees = employee_model.query()
        
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
            
            logger.info(f"Face similarity match found: {similar_employee.get('name')} with {similarity_percent}% similarity")
            
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
            
        new_employee = employee_model.create(employee_data)

        # Broadcast user registration
        attendance_update = {
            "action": "register_user",
            "user_id": employee_id,
            "name": name,
            "timestamp": get_local_time().isoformat()
        }
        processing_results_queue, _ = get_queues()
        processing_results_queue.put({
            "type": "attendance_update",
            "data": [attendance_update]
        })
        
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

        logger.info(f"Employee registered successfully: {employee_id} ({name})")
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

@router.put("/employees/{employee_id}/profile")
async def update_employee_profile(
    employee_id: str,
    name: str = Form(...),
    department: str = Form(...),
    position: str = Form(...),
    status: str = Form("active"),
    shift_id: str = Form(...),
    email: Optional[str] = Form(None),
    phone_number: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None)
):
    """Update employee profile with optional photo update"""
    try:
        # Find employee by employee_id (not objectId)
        employee_model = Employee()
        existing_employees = db_query("Employee", where={
            "employee_id": {
                "$in": [employee_id]
            }
        })
        
        if not existing_employees:
            raise HTTPException(status_code=404, detail="Employee not found")
        
        existing_employee = existing_employees[0]
        objectId = existing_employee.get("objectId")
        
        # Prepare update data
        update_data = {
            "name": name,
            "department": department,
            "position": position,
            "status": status,
            "shift": {
                "__type": "Pointer",
                "className": "Shift",
                "objectId": shift_id
            }
        }
        
        # Add optional fields
        if email:
            update_data["email"] = email
        if phone_number:
            update_data["phone_number"] = phone_number
        
        # Handle image update if provided
        if image and image.filename:
            logger.info(f"Processing image update for employee {employee_id}")
            
            # Read and decode image
            contents = await image.read()
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            # Get face embedding
            face_recognition = get_face_recognition()
            embedding = face_recognition.get_embedding(img)
            
            if embedding is None:
                raise HTTPException(
                    status_code=400, 
                    detail="No face detected in the uploaded image"
                )

            # Check if this face is already registered by comparing with other employees
            all_employees = employee_model.query()
            # Exclude current employee from face similarity check
            other_employees = [emp for emp in all_employees if emp.get("employee_id") != employee_id]
            
            # Find matches with similarity > 0.6
            face_similarity_threshold = 0.6
            matches = face_recognition.find_matches_for_embeddings(
                [embedding], other_employees, threshold=face_similarity_threshold
            )
            
            if matches:
                # If we found a matching face with similarity > 0.6
                match = matches[0]  # Get the best match
                similar_employee = match['employee']
                similarity = match['similarity']
                similarity_percent = round(similarity * 100, 1)
                
                logger.warning(f"Face similarity match found during update: {similar_employee.get('name')} with {similarity_percent}% similarity")
                
                raise HTTPException(
                    status_code=400,
                    detail=f"Face already registered to another employee: {similar_employee.get('name')} (ID: {similar_employee.get('employee_id')}) with {similarity_percent}% similarity"
                )

            # Update embedding
            update_data["embedding"] = face_recognition.embedding_to_str(embedding)
            logger.info(f"Updated face embedding for employee {employee_id}")

        # Get current time for updatedAt
        current_time = get_local_time()
        update_data["updatedAt"] = {
            "__type": "Date",
            "iso": current_time.isoformat()
        }
        
        # Update employee using objectId
        result = employee_model.update(objectId, update_data)
        
        # Broadcast update
        attendance_update = {
            "action": "update_user",
            "user_id": employee_id,
            "name": name,
            "timestamp": current_time.isoformat()
        }
        processing_results_queue, _ = get_queues()
        processing_results_queue.put({
            "type": "attendance_update",
            "data": [attendance_update]
        })
        
        logger.info(f"Employee profile updated successfully: {employee_id} ({name})")
        return {
            "message": "Employee profile updated successfully",
            "employee": result
        }
        
    except HTTPException as he:
        # Re-raise HTTP exceptions to preserve status code and details
        logger.error(f"HTTP error during employee profile update: {str(he)}")
        raise
    except Exception as e:
        logger.error(f"Error updating employee profile: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update employee profile: {str(e)}"
        ) 