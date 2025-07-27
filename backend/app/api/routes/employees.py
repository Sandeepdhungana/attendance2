from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from app.models import Employee
from app.middleware.auth import get_current_user, get_admin_user
from app.utils.auth import AuthUtils
from app.utils.time_utils import get_local_time
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class EmployeeResponse(BaseModel):
    objectId: str
    employee_id: str
    name: Optional[str] = None
    email: Optional[str] = None
    is_admin: bool = False
    is_active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class EmployeeUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None

@router.get("/employees", response_model=List[EmployeeResponse])
async def get_all_employees(current_user: dict = Depends(get_admin_user)):
    """
    Get all employees (admin only)
    """
    try:
        employee_model = Employee()
        employees = employee_model.query(limit=1000)  # Get all employees
        
        # Format response
        formatted_employees = []
        for emp in employees:
            formatted_employees.append(EmployeeResponse(
                objectId=emp.get("objectId", ""),
                employee_id=emp.get("employee_id", ""),
                name=emp.get("name"),
                email=emp.get("email"),
                is_admin=emp.get("is_admin", False),
                is_active=emp.get("is_active", True),
                created_at=emp.get("created_at", {}).get("iso") if isinstance(emp.get("created_at"), dict) else emp.get("created_at"),
                updated_at=emp.get("updated_at", {}).get("iso") if isinstance(emp.get("updated_at"), dict) else emp.get("updated_at")
            ))
        
        logger.info(f"Retrieved {len(formatted_employees)} employees for admin {current_user['email']}")
        return formatted_employees
        
    except Exception as e:
        logger.error(f"Error fetching employees: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch employees"
        )

@router.get("/employees/{employee_id}")
async def get_employee(employee_id: str, current_user: dict = Depends(get_current_user)):
    """
    Get employee by ID (users can get their own data, admins can get any)
    """
    try:
        employee_model = Employee()
        
        # Check if user is requesting their own data or if they're admin
        if not current_user.get("is_admin", False) and current_user["employee_id"] != employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only access your own employee data"
            )
        
        # Find employee by employee_id
        employee = employee_model.find_by_employee_id(employee_id)
        
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )
        
        return EmployeeResponse(
            objectId=employee.get("objectId", ""),
            employee_id=employee.get("employee_id", ""),
            name=employee.get("name"),
            email=employee.get("email"),
            is_admin=employee.get("is_admin", False),
            is_active=employee.get("is_active", True),
            created_at=employee.get("created_at", {}).get("iso") if isinstance(employee.get("created_at"), dict) else employee.get("created_at"),
            updated_at=employee.get("updated_at", {}).get("iso") if isinstance(employee.get("updated_at"), dict) else employee.get("updated_at")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching employee {employee_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch employee"
        )

@router.put("/employees/{object_id}")
async def update_employee(
    object_id: str, 
    update_data: EmployeeUpdateRequest,
    current_user: dict = Depends(get_admin_user)
):
    """
    Update employee (admin only)
    """
    try:
        employee_model = Employee()
        
        # Get the employee first to verify it exists
        employee = employee_model.get(object_id)
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )
        
        # Build update data
        update_fields = {}
        
        if update_data.name is not None:
            update_fields["name"] = update_data.name
            
        if update_data.email is not None:
            # Check if email is already taken by another employee
            existing_employee = employee_model.find_by_email(str(update_data.email))
            if existing_employee and existing_employee["objectId"] != object_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email is already taken by another employee"
                )
            update_fields["email"] = str(update_data.email)
            
        if update_data.is_admin is not None:
            update_fields["is_admin"] = update_data.is_admin
            
        if update_data.is_active is not None:
            update_fields["is_active"] = update_data.is_active
            
        if update_data.password is not None and update_data.password.strip():
            # Hash the new password
            update_fields["password_hash"] = AuthUtils.hash_password(update_data.password)
        
        # Add updated timestamp
        current_time = get_local_time()
        update_fields["updated_at"] = {
            "__type": "Date",
            "iso": current_time.isoformat()
        }
        
        # Update the employee
        result = employee_model.update(object_id, update_fields)
        
        logger.info(f"Employee {employee['employee_id']} updated by admin {current_user['email']}")
        
        return {"message": "Employee updated successfully", "objectId": object_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating employee {object_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update employee"
        )

@router.delete("/employees/{object_id}")
async def delete_employee(object_id: str, current_user: dict = Depends(get_admin_user)):
    """
    Delete employee (admin only)
    """
    try:
        employee_model = Employee()
        
        # Get the employee first to verify it exists
        employee = employee_model.get(object_id)
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )
        
        # Prevent admin from deleting themselves
        if employee["employee_id"] == current_user["employee_id"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot delete your own account"
            )
        
        # Delete the employee
        employee_model.delete(object_id)
        
        logger.info(f"Employee {employee['employee_id']} deleted by admin {current_user['email']}")
        
        return {"message": "Employee deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting employee {object_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete employee"
        ) 