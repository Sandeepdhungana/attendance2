from jose import jwt, JWTError
from passlib.context import CryptContext
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from app.config import (
    JWT_SECRET_KEY, 
    JWT_ALGORITHM, 
    ACCESS_TOKEN_EXPIRE_MINUTES, 
    REFRESH_TOKEN_EXPIRE_HOURS
)
from app.utils.time_utils import get_local_time
import logging

logger = logging.getLogger(__name__)



# Password hashing context
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

class AuthUtils:
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using argon2"""
        return pwd_context.hash(password)
    
    @staticmethod
    def verify_password(password: str, hashed_password: str) -> bool:
        """Verify a password against its hash"""
        return pwd_context.verify(password, hashed_password)
    
    @staticmethod
    def create_refresh_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        """Create a JWT refresh token"""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(hours=REFRESH_TOKEN_EXPIRE_HOURS)
        
        to_encode.update({"exp": expire, "token_type": "refresh"})
        encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
        return encoded_jwt
    
    @staticmethod
    def hash_token(token: str) -> str:
        """Hash a token for storage"""
        import hashlib
        return hashlib.sha256(token.encode()).hexdigest()
    
    @staticmethod
    def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        """Create a JWT access token"""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
        return encoded_jwt
    
    @staticmethod
    def verify_refresh_token(token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode a JWT refresh token"""
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            # Verify it's actually a refresh token
            if payload.get("token_type") != "refresh":
                logger.warning("Token is not a refresh token")
                return None
            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("Refresh token has expired")
            return None
        except JWTError:
            logger.warning("Invalid refresh token")
            return None
    
    @staticmethod
    def get_refresh_token_expiry(token: str) -> Optional[datetime]:
        """Get refresh token expiration time"""
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM], options={"verify_exp": False})
            exp_timestamp = payload.get("exp")
            if exp_timestamp:
                return datetime.utcfromtimestamp(exp_timestamp)
            return None
        except JWTError:
            return None
    
    @staticmethod
    def verify_access_token(token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode a JWT access token"""
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("Access token has expired")
            return None
        except JWTError:
            logger.warning("Invalid access token")
            return None
    
    @staticmethod
    def extract_user_from_token(token: str) -> Optional[Dict[str, Any]]:
        """Extract user information from JWT token"""
        payload = AuthUtils.verify_access_token(token)
        if payload:
            return {
                "user_id": payload.get("user_id"),
                "employee_id": payload.get("employee_id"),
                "email": payload.get("email"),
                "is_admin": payload.get("is_admin", False)
            }
        return None
    
    @staticmethod
    def is_token_expired(token: str) -> bool:
        """Check if a token is expired"""
        try:
            jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            return False
        except jwt.ExpiredSignatureError:
            return True
        except JWTError:
            return True
    
    @staticmethod
    def get_token_expiry(token: str) -> Optional[datetime]:
        """Get token expiration time"""
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM], options={"verify_exp": False})
            exp_timestamp = payload.get("exp")
            if exp_timestamp:
                return datetime.utcfromtimestamp(exp_timestamp)
            return None
        except JWTError:
            return None 