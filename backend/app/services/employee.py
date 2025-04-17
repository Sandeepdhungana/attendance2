from app.models import Employee, Shift
from typing import List, Dict, Any
from app.database import query

def get_employees() -> List[Dict[str, Any]]:
    """Get all employees with their shift information"""
    employee_model = Employee()
    employees = employee_model.query()
    
    # Fetch all shfts in one query
    shifts = query("Shift")
    
    # Create a dictionary of shifts for quick lookup
    shift_dict = {shift["objectId"]: shift for shift in shifts}
    
    # Format employee data with shift information
    formatted_employees = []
    for employee in employees:
        shift = None
        if employee.get("shift") and employee["shift"].get("objectId"):
            shift_id = employee["shift"]["objectId"]
            shift = shift_dict.get(shift_id)
        
        formatted_employee = {
            "objectId": employee["objectId"],
            "employee_id": employee["employee_id"],
            "name": employee["name"],
            "department": employee.get("department", ""),
            "position": employee.get("position", ""),
            "status": employee.get("status", "active"),
            "shift": shift,
            "created_at": employee["createdAt"],
            "updated_at": employee["updatedAt"]
        }
        formatted_employees.append(formatted_employee)
    
    return formatted_employees

def delete_employee(employee_id: str, object_id: str = None) -> Dict[str, str]:
    """Delete an employee"""
    employee_model = Employee()
    
    try:
        if object_id:
            # If objectId is provided, check if employee exists first
            employee_obj = employee_model.get(object_id)
            if not employee_obj:
                raise ValueError(f"Employee with objectId {object_id} not found")
                
            # Delete the employee
            result = employee_model.delete(object_id)
            if "error" in result:
                raise ValueError(f"Error deleting employee: {result.get('error')}")
                
            return {"message": f"Employee deleted successfully", "object_id": object_id}
        
        # If only employee_id is provided, find the employee by employee_id (backward compatibility)
        employees = employee_model.query(where={"employee_id": employee_id}, limit=1)
        if not employees:
            raise ValueError(f"Employee with ID {employee_id} not found")
        
        object_id = employees[0]["objectId"]
        result = employee_model.delete(object_id)
        if "error" in result:
            raise ValueError(f"Error deleting employee: {result.get('error')}")
            
        return {"message": f"Employee {employee_id} deleted successfully", "object_id": object_id}
    except Exception as e:
        import logging
        logging.error(f"Error in delete_employee: {str(e)}", exc_info=True)
        raise 