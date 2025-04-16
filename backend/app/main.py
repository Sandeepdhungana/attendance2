from fastapi import FastAPI
from . import create_app
from .api import router as api_router
from .api.routes import attendance, employees, office_timings, timezone, websocket
from .utils.websocket import process_queue, process_websocket_responses
from .dependencies import process_pool
from .database import query, create, create_class_schema
from .utils.time_utils import get_local_time
import asyncio
import logging
import signal
import multiprocessing
from app.models import Employee, Attendance, OfficeTiming, Shift, TimezoneConfig
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger(__name__)

app = create_app()

# Configure CORS with WebSocket support
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all API routes
app.include_router(api_router)
app.include_router(attendance.router, tags=["attendance"])
app.include_router(employees.router, tags=["employees"])
app.include_router(office_timings.router, tags=["office-timings"])
app.include_router(timezone.router, tags=["timezone"])
app.include_router(websocket.router, tags=["websocket"])

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
            "status": "String",  # active, inactive, on_leave
            "shift": "Pointer<Shift>",
            "created_at": "Date",
            "updated_at": "Date"
        },
        "Shift": {
            "name": "String",
            "login_time": "String",
            "logout_time": "String",
            "created_at": "Date",
            "updated_at": "Date"
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
            "created_at": "Date",
            "updated_at": "Date"
        },
        "TimezoneConfig": {
            "timezone_name": "String",
            "timezone_offset": "String",
            "created_at": "Date",
            "updated_at": "Date"
        },
        "EarlyExitReason": {
            "employee_id": "String",
            "attendance_id": "String",
            "reason": "String",
            "created_at": "Date",
            "updated_at": "Date"
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
                "logout_time": "18:00"
            },
            {
                "name": "Evening Shift",
                "login_time": "14:00",
                "logout_time": "23:00"
            },
            {
                "name": "Night Shift",
                "login_time": "22:00",
                "logout_time": "07:00"
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
            "timezone_name": "Asia/Kolkata",
            "timezone_offset": "+05:30"
        })
        logger.info("Created default timezone configuration")

    logger.info("Database initialization completed!")

@app.on_event("startup")
async def startup_event():
    """Initialize the application on startup"""
    # this is always commented out
    # initialize_back4app()
    # Start the WebSocket response processing tasks
    asyncio.create_task(process_queue())
    asyncio.create_task(process_websocket_responses())
    logger.info("Application startup completed")

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown"""
    process_pool.shutdown()
    logger.info("Application shutdown completed") 