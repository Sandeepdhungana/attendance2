from . import create_app
from .api import router as api_router
from .api.routes import attendance, employees, timezone, websocket, early_exit
from .utils.websocket import process_queue, process_websocket_responses
from .dependencies import process_pool
from .database import query, create, create_class_schema
from .utils.time_utils import get_local_time
import asyncio
import logging
import resource
import psutil
import time
import gc
import os
from app.models import Employee, Attendance, OfficeTiming, Shift, TimezoneConfig
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger(__name__)

# Memory management settings
MEMORY_LIMIT_GB = 2  # Limit to 2GB of memory
MEMORY_CHECK_INTERVAL = 60  # Check memory every 60 seconds
HIGH_MEMORY_THRESHOLD = 85  # Warn at 85% usage
CRITICAL_MEMORY_THRESHOLD = 95  # Emergency actions at 95%

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
                "grace_period": 10
            },
            {
                "name": "Evening Shift",
                "login_time": "14:00",
                "logout_time": "23:00",
                "grace_period": 10
            },
            {
                "name": "Night Shift",
                "login_time": "22:00",
                "logout_time": "07:00",
                "grace_period": 10
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


async def monitor_memory():
    """Task to periodically monitor memory usage and take action if needed"""
    while True:
        try:
            memory = psutil.virtual_memory()
            percent_used = memory.percent
            available_mb = memory.available / (1024 * 1024)
            
            # Log memory info
            logger.info(f"Memory usage: {percent_used:.1f}% used, {available_mb:.1f}MB available")
            
            # Take action based on memory usage
            if percent_used > CRITICAL_MEMORY_THRESHOLD:
                logger.critical(f"CRITICAL MEMORY USAGE: {percent_used:.1f}%! Taking emergency action.")
                # Force garbage collection
                gc.collect()
                gc.collect()
                # Sleep a bit to let memory clear
                await asyncio.sleep(1)
                # Check if still critical
                if psutil.virtual_memory().percent > CRITICAL_MEMORY_THRESHOLD:
                    logger.critical("Memory usage still critical after GC. Restricting new connections.")
                    # You might want to implement a flag to temporarily pause new connections
            elif percent_used > HIGH_MEMORY_THRESHOLD:
                logger.warning(f"HIGH MEMORY USAGE: {percent_used:.1f}%. Running garbage collection.")
                gc.collect()
                
        except Exception as e:
            logger.error(f"Error in memory monitoring: {str(e)}")
            
        # Wait for next check
        await asyncio.sleep(MEMORY_CHECK_INTERVAL)


@app.on_event("startup")
async def startup_event():
    """Initialize the application on startup"""
    # Configure memory limits - set soft limit to MEMORY_LIMIT_GB GB, hard limit to max value (-1)
    try:
        memory_limit_bytes = MEMORY_LIMIT_GB * 1024 * 1024 * 1024  # Convert GB to bytes
        resource.setrlimit(resource.RLIMIT_AS, (memory_limit_bytes, -1))
        logger.info(f"Set memory limit to {MEMORY_LIMIT_GB}GB")
    except Exception as e:
        logger.warning(f"Failed to set memory limit: {str(e)}")
    
    # Log initial memory usage
    try:
        process = psutil.Process(os.getpid())
        process_memory = process.memory_info().rss / (1024 * 1024)  # Convert to MB
        system_memory = psutil.virtual_memory()
        logger.info(f"Initial memory usage - Process: {process_memory:.1f}MB, System: {system_memory.percent:.1f}% used")
    except Exception as e:
        logger.warning(f"Failed to get memory info: {str(e)}")
    
    # Start the WebSocket response processing tasks
    asyncio.create_task(process_queue())
    asyncio.create_task(process_websocket_responses())
    
    # Start memory monitoring task
    asyncio.create_task(monitor_memory())
    
    logger.info("Application startup completed")


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown"""
    # Perform manual garbage collection before shutdown
    gc.collect()
    process_pool.shutdown()
    logger.info("Application shutdown completed")
