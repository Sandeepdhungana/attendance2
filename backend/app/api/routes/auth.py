from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.models import RefreshToken, Employee, PasswordReset
from app.utils.auth import AuthUtils
from app.middleware.auth import get_current_user
from app.utils.time_utils import get_local_time
from app.services.send_email import send_otp_email, send_password_reset_success_email
import logging
import random
import string
from datetime import timedelta
from app.config import REFRESH_TOKEN_EXPIRE_HOURS

logger = logging.getLogger(__name__)

router = APIRouter()

# Request/Response models
class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    employee_id: str
    is_admin: bool = False

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 1800  # 30 minutes

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class UserResponse(BaseModel):
    user_id: str
    email: str
    employee_id: str
    is_admin: bool
    is_active: bool

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp_code: str

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp_code: str
    new_password: str

class ForgotPasswordResponse(BaseModel):
    message: str
    expires_in_minutes: int = 15

@router.post("/login", response_model=TokenResponse)
async def login(user_login: UserLogin):
    """
    Login user and return JWT tokens
    """
    try:
        # Find employee by email
        employee_model = Employee()
        user = employee_model.find_by_email(user_login.email)
        
        if not user:
            logger.warning(f"Login attempt with non-existent email: {user_login.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Verify password
        if not AuthUtils.verify_password(user_login.password, user["password_hash"]):
            logger.warning(f"Failed login attempt for email: {user_login.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Check if user is active
        if not user.get("is_active", True):
            logger.warning(f"Login attempt for inactive user: {user_login.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is inactive"
            )
        
        # Create JWT access token
        token_data = {
            "user_id": user["objectId"],
            "employee_id": user["employee_id"],
            "email": user["email"],
            "is_admin": user.get("is_admin", False)
        }
        access_token = AuthUtils.create_access_token(token_data)
        
        # Create JWT refresh token (configurable expiry)
        refresh_token = AuthUtils.create_refresh_token(token_data)
        
        # We still store a hash for blacklisting purposes, but the token itself is now a JWT
        refresh_token_hash = AuthUtils.hash_token(refresh_token)
        expires_at = get_local_time() + timedelta(hours=REFRESH_TOKEN_EXPIRE_HOURS)
        
        # Store refresh token hash in database
        refresh_token_model = RefreshToken()
        refresh_token_model.create_token(
            user_id=user["objectId"],
            token_hash=refresh_token_hash,
            expires_at=expires_at
        )
        
        # Update employee's last login
        employee_model.update_last_login(user["objectId"])
        
        logger.info(f"User {user_login.email} logged in successfully")
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=1800  # 30 minutes for access token (refresh token expires per config)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.post("/register", response_model=UserResponse)
async def register(user_register: UserRegister):
    """
    Register a new user account
    """
    try:
        # Check if employee already exists
        employee_model = Employee()
        existing_user = employee_model.find_by_email(user_register.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Check if employee ID already exists
        existing_employee = employee_model.find_by_employee_id(user_register.employee_id)
        if existing_employee:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee ID already exists"
            )
        
        # Hash password
        password_hash = AuthUtils.hash_password(user_register.password)
        
        # Create employee with authentication data
        user = employee_model.create_user(
            email=user_register.email,
            password_hash=password_hash,
            employee_id=user_register.employee_id,
            is_admin=user_register.is_admin,
            name=user_register.employee_id  # Default name to employee_id, can be updated later
        )
        
        logger.info(f"User registered successfully: {user_register.email}")
        
        return UserResponse(
            user_id=user["objectId"],
            email=user_register.email,
            employee_id=user_register.employee_id,
            is_admin=user_register.is_admin,
            is_active=True
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(refresh_request: RefreshTokenRequest):
    """
    Refresh JWT access token using JWT refresh token
    """
    try:
        # Verify the JWT refresh token
        refresh_payload = AuthUtils.verify_refresh_token(refresh_request.refresh_token)
        
        if not refresh_payload:
            logger.warning("Invalid or expired refresh token used")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token"
            )
        
        # Check if token is blacklisted in database
        token_hash = AuthUtils.hash_token(refresh_request.refresh_token)
        refresh_token_model = RefreshToken()
        stored_token = refresh_token_model.find_by_token(token_hash)
        
        if not stored_token:
            logger.warning("Refresh token not found in database (possibly revoked)")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has been revoked"
            )
        
        # Get employee data from refresh token payload
        user_id = refresh_payload.get("user_id")
        employee_model = Employee()
        user = employee_model.get(user_id)
        
        if not user or not user.get("is_active", True):
            logger.warning("Refresh token used for inactive user")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is inactive"
            )
        
        # Create new access token
        token_data = {
            "user_id": user["objectId"],
            "employee_id": user["employee_id"],
            "email": user["email"],
            "is_admin": user.get("is_admin", False)
        }
        access_token = AuthUtils.create_access_token(token_data)
        
        # Generate new JWT refresh token
        new_refresh_token = AuthUtils.create_refresh_token(token_data)
        new_refresh_token_hash = AuthUtils.hash_token(new_refresh_token)
        expires_at = get_local_time() + timedelta(hours=REFRESH_TOKEN_EXPIRE_HOURS)
        
        # Revoke old refresh token
        refresh_token_model.revoke_token(stored_token["objectId"])
        
        # Store new refresh token hash
        refresh_token_model.create_token(
            user_id=user["objectId"],
            token_hash=new_refresh_token_hash,
            expires_at=expires_at
        )
        
        logger.info(f"Token refreshed for user: {user['email']}")
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
            expires_in=1800  # 30 minutes for access token (refresh token expires per config)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.post("/logout")
async def logout(
    refresh_request: RefreshTokenRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Logout user and revoke refresh token
    """
    try:
        # Hash the provided refresh token
        token_hash = AuthUtils.hash_token(refresh_request.refresh_token)
        
        # Find and revoke refresh token
        refresh_token_model = RefreshToken()
        stored_token = refresh_token_model.find_by_token(token_hash)
        
        if stored_token:
            refresh_token_model.revoke_token(stored_token["objectId"])
        
        logger.info(f"User logged out: {current_user['email']}")
        
        return {"message": "Logged out successfully"}
        
    except Exception as e:
        logger.error(f"Logout error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.post("/logout-all")
async def logout_all(current_user: dict = Depends(get_current_user)):
    """
    Logout from all devices by revoking all refresh tokens
    """
    try:
        # Revoke all refresh tokens for the user
        refresh_token_model = RefreshToken()
        refresh_token_model.revoke_all_user_tokens(current_user["user_id"])
        
        logger.info(f"All tokens revoked for user: {current_user['email']}")
        
        return {"message": "Logged out from all devices successfully"}
        
    except Exception as e:
        logger.error(f"Logout all error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """
    Get current user information
    """
    return UserResponse(
        user_id=current_user["user_id"],
        email=current_user["email"],
        employee_id=current_user["employee_id"],
        is_admin=current_user.get("is_admin", False),
        is_active=True
    )

@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(request: ForgotPasswordRequest):
    """
    Send OTP for password reset/setup
    """
    try:
        # Find employee by email
        employee_model = Employee()
        employee = employee_model.find_by_email(request.email)
        
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found with this email address"
            )
        
        # Check if employee is active
        if not employee.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Account is inactive. Please contact HR"
            )
        
        # Generate 6-digit OTP
        otp_code = ''.join(random.choices(string.digits, k=6))
        
        # Set OTP expiration (15 minutes)
        expires_at = get_local_time() + timedelta(minutes=15)
        
        # Store OTP in database
        password_reset_model = PasswordReset()
        password_reset_model.create_otp(
            email=request.email,
            otp_code=otp_code,
            expires_at=expires_at
        )
        
        # Send OTP email
        email_result = send_otp_email(
            email=request.email,
            otp_code=otp_code,
            employee_name=employee.get("name", ""),
            expires_minutes=15
        )
        
        if not email_result.get("success"):
            logger.error(f"Failed to send OTP email: {email_result.get('message')}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send OTP email. Please try again"
            )
        
        logger.info(f"Password reset OTP sent to {request.email}")
        
        return ForgotPasswordResponse(
            message="OTP sent to your email address. Please check your inbox",
            expires_in_minutes=15
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Forgot password error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.post("/verify-otp")
async def verify_otp(request: VerifyOTPRequest):
    """
    Verify OTP without resetting password (optional endpoint for validation)
    """
    try:
        # Find valid OTP
        password_reset_model = PasswordReset()
        otp_record = password_reset_model.find_valid_otp(request.email, request.otp_code)
        
        if not otp_record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired OTP"
            )
        
        return {"message": "OTP verified successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OTP verification error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """
    Reset password using OTP
    """
    try:
        # Find valid OTP
        password_reset_model = PasswordReset()
        otp_record = password_reset_model.find_valid_otp(request.email, request.otp_code)
        
        if not otp_record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired OTP"
            )
        
        # Find employee
        employee_model = Employee()
        employee = employee_model.find_by_email(request.email)
        
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )
        
        # Hash new password
        password_hash = AuthUtils.hash_password(request.new_password)
        
        # Update employee password
        current_time = get_local_time()
        employee_model.update(employee["objectId"], {
            "password_hash": password_hash,
            "updated_at": {
                "__type": "Date",
                "iso": current_time.isoformat()
            }
        })
        
        # Mark OTP as used
        password_reset_model.mark_otp_used(otp_record["objectId"])
        
        # Send confirmation email
        send_password_reset_success_email(
            email=request.email,
            employee_name=employee.get("name", "")
        )
        
        logger.info(f"Password reset successful for {request.email}")
        
        return {"message": "Password reset successful. You can now log in with your new password"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Password reset error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        ) 