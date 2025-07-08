from . import create_app
from .api import router as api_router
from .api.routes import attendance, employees, timezone, websocket, early_exit
from .utils.websocket import process_queue, process_websocket_responses
from .utils.security import SecurityMiddleware, get_real_ip
from .dependencies import process_pool
from .database import query, create, create_class_schema
from .utils.time_utils import get_local_time
from .config import SECURITY_CONFIG
import asyncio
import logging
from app.models import Employee, Attendance, OfficeTiming, Shift, TimezoneConfig
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
import re

logger = logging.getLogger(__name__)

app = create_app()

# Security middleware to block access to sensitive files and IPs
@app.middleware("http")
async def security_middleware(request: Request, call_next):
    """Security middleware: IP blocking, rate limiting, and path protection"""
    
    # Get real client IP (considering proxies)
    client_ip = get_real_ip(request)
    request.state.client_ip = client_ip
    
    try:
        # Check IP blocking and rate limiting
        await SecurityMiddleware.check_security(request)
        
        # Check for sensitive path access attempts
        path = request.url.path.lower()
        blocked_patterns = [
            r"^/\.git/?",          # Git directories
            r"^/\.env",            # Environment files
            r"^/\.ssh/?",          # SSH keys
            r"^/config\.ini",      # Config files
            r"^/secrets\.json",    # Secret files
            r"^/database\.sqlite", # Database files
            r"^/\.htaccess",       # Apache config
            r"^/web\.config",      # IIS config
            r"^/backup\.sql",      # Backup files
            r"^/dump\.sql",        # Database dumps
        ]
        
        # Check if path matches any blocked pattern
        for pattern in blocked_patterns:
            if re.match(pattern, path):
                logger.warning(f"Blocked access attempt to sensitive path: {path} from {client_ip}")
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Access forbidden"}
                )
        
        response = await call_next(request)
        
        # Add security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        return response
        
    except HTTPException as e:
        return JSONResponse(
            status_code=e.status_code,
            content={"detail": e.detail}
        )

# Configure CORS with security-based settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=SECURITY_CONFIG.get("ALLOWED_ORIGINS", ["http://localhost:3000"]),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],  # Specific methods only
    allow_headers=["*"],
)

# Include all API routes
app.include_router(api_router)
app.include_router(attendance.router, tags=["attendance"])
app.include_router(employees.router, tags=["employees"])
app.include_router(timezone.router, tags=["timezone"])
app.include_router(websocket.router, tags=["websocket"])
app.include_router(early_exit.router, tags=["early-exit"])


def initialize_back4app():
    """Initialize Back4App database with default data"""
    logger.info("Initializing Back4App database...")

    # Define all required classes and their fields
    required_classes = {
        "Employee": {
            "employee_id": "String",
            "name": "String",
            "embedding": "String",
            "department": "String",
            "position": "String",
            "status": "String",
            "shift": "Pointer<Shift>",
            "phone_number": "String",
            "email": "String",
            "is_admin": "Boolean",
        },
        "Shift": {
            "name": "String",
            "login_time": "String",
            "logout_time": "String",
            "grace_period": "Number",
        },
        "Attendance": {
            "employee_id": "String",
            "employee": "Pointer<Employee>",
            "timestamp": "Date",
            "exit_time": "Date",
            "confidence": "Number",
            "is_late": "Boolean",
            "is_early_exit": "Boolean",
            "early_exit_reason": "String",
        },
        "TimezoneConfig": {
            "timezone_name": "String",
            "timezone_offset": "String",

        },
        "EarlyExitReason": {
            "employee_id": "String",
            "attendance_id": "String",
            "attendance": "Pointer<Attendance>",
            "employee": "Pointer<Employee>",
            "reason": "String",

        }
    }

    # Create or verify each class
    logger.info("Available classes in Back4App:")
    for class_name, fields in required_classes.items():
        try:
            # Try to query the class to verify it exists
            result = create_class_schema(class_name, fields)
            logger.info(result)
            logger.info(f"- {class_name} (exists)")
        except Exception as e:
            # If class doesn't exist, create it
            try:
                # Create class schema in Back4App
                create_class_schema(class_name, fields)
                logger.info(f"- {class_name} (created)")
            except Exception as e:
                logger.error(f"Error creating class {class_name}: {str(e)}")

    # Create default shifts if not exists
    shifts = query("Shift", limit=1)
    if not shifts:
        default_shifts = [
            {
                "name": "Morning Shift",
                "login_time": "09:00",
                "logout_time": "18:00",
                "grace_period": 30
            },
            {
                "name": "Evening Shift",
                "login_time": "14:00",
                "logout_time": "23:00",
                "grace_period": 30
            },
            {
                "name": "Night Shift",
                "login_time": "22:00",
                "logout_time": "07:00",
                "grace_period": 30
            }
        ]
        for shift_data in default_shifts:
            shift = Shift()
            shift.create(shift_data)
        logger.info("Created default shifts")

    # Check and create default timezone config if not exists
    timezone_config = query("TimezoneConfig", limit=1)
    if not timezone_config:
        timezone = TimezoneConfig()
        timezone.create({
            "timezone_name": "Asia/Dubai",
            "timezone_offset": "+04:00"
        })
        logger.info("Created default timezone configuration")

    logger.info("Database initialization completed!")


# Startup and shutdown events are now handled in the lifespan function in __init__.py
# This fixes the ASGI lifespan protocol warning
