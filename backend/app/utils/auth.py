from jose import jwt, JWTError
from passlib.context import CryptContext
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from app.config import BACK4APP_APPLICATION_ID
from app.utils.time_utils import get_local_time
import logging

logger = logging.getLogger(__name__)

# JWT Configuration
JWT_SECRET_KEY = BACK4APP_APPLICATION_ID  # Using app ID as secret key
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30  # 30 minutes
REFRESH_TOKEN_EXPIRE_DAYS = 30   # 30 days

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
    def generate_refresh_token() -> str:
        """Generate a secure random refresh token"""
        return secrets.token_urlsafe(32)
    
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
    def create_refresh_token_expires() -> datetime:
        """Create expiration datetime for refresh token"""
        return get_local_time() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
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