#!/usr/bin/env python3
"""
Setup script to create admin user account
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.models import Employee
from app.utils.auth import AuthUtils
from app.utils.time_utils import get_local_time
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def setup_admin_user():
    """Create admin user account"""
    
    # Admin user details
    admin_email = "sandeepdhungana10@gmail.com"
    admin_password = "sandeep@123"
    admin_employee_id = "1234"  # Use a simple employee ID
    
    try:
        # Initialize employee model
        employee_model = Employee()
        
        # Check if employee already exists
        existing_employee = employee_model.find_by_email(admin_email)
        
        if existing_employee:
            logger.info(f"Employee {admin_email} already exists. Updating password and role...")
            
            # Hash the new password using argon2
            password_hash = AuthUtils.hash_password(admin_password)
            
            # Update existing employee
            current_time = get_local_time()
            employee_model.update(existing_employee["objectId"], {
                "password_hash": password_hash,
                "is_admin": True,
                "is_active": True,
                "updated_at": {
                    "__type": "Date",
                    "iso": current_time.isoformat()
                }
            })
            
            logger.info(f"✅ Updated employee {admin_email} with new password and admin access")
            return
        
        # Create new admin employee
        logger.info(f"Creating new admin employee {admin_email}...")
        
        # Hash the password using argon2
        password_hash = AuthUtils.hash_password(admin_password)
        
        # Create the admin employee using the Employee model's create_user method
        result = employee_model.create_user(
            email=admin_email,
            password_hash=password_hash,
            employee_id=admin_employee_id,
            is_admin=True,
            name="Admin User"
        )
        logger.info(f"✅ Created admin employee {admin_email} with employee ID {admin_employee_id}")
        
    except Exception as e:
        logger.error(f"❌ Error creating admin user: {str(e)}")
        raise

if __name__ == "__main__":
    logger.info("🚀 Setting up admin user...")
    setup_admin_user()
    logger.info("✨ Admin user setup completed!") 