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

def delete_employee(employee_id: str) -> Dict[str, str]:
    """Delete an employee"""
    employee_model = Employee()
    # First find the employee by employee_id
    employees = employee_model.query(where={"employee_id": employee_id}, limit=1)
    if not employees:
        raise ValueError(f"Employee with ID {employee_id} not found")
    
    employee_model.delete(employees[0]["objectId"])
    return {"message": f"Employee {employee_id} deleted successfully"} 