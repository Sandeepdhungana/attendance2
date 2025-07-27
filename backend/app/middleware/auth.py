from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict, Any
from app.utils.auth import AuthUtils
from app.models import Employee
import logging

logger = logging.getLogger(__name__)

# HTTP Bearer token extractor
bearer_scheme = HTTPBearer()

class AuthMiddleware:
    @staticmethod
    def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> Dict[str, Any]:
        """
        Extract and validate JWT token from Authorization header
        Returns user information if token is valid
        """
        token = credentials.credentials
        
        # Verify the token
        user_data = AuthUtils.extract_user_from_token(token)
        if not user_data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Verify employee exists and is active
        employee_model = Employee()
        employee = employee_model.get(user_data["user_id"])
        if not employee or not employee.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Employee account is inactive",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return user_data
    
    @staticmethod
    def get_current_active_user(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        """
        Get current active user (alias for get_current_user)
        """
        return current_user
    
    @staticmethod
    def get_admin_user(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        """
        Require admin access for accessing endpoints
        """
        if not current_user.get("is_admin", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )
        return current_user
    
    @staticmethod
    def optional_auth(credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))) -> Optional[Dict[str, Any]]:
        """
        Optional authentication - returns user data if token is provided and valid, None otherwise
        """
        if not credentials:
            return None
        
        token = credentials.credentials
        user_data = AuthUtils.extract_user_from_token(token)
        
        if not user_data:
            return None
        
        # Verify employee exists and is active
        employee_model = Employee()
        employee = employee_model.get(user_data["user_id"])
        if not employee or not employee.get("is_active", True):
            return None
        
        return user_data

# Create dependency functions for easy import
get_current_user = AuthMiddleware.get_current_user
get_current_active_user = AuthMiddleware.get_current_active_user
get_admin_user = AuthMiddleware.get_admin_user
optional_auth = AuthMiddleware.optional_auth 