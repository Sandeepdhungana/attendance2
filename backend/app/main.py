from . import create_app
from .api import router as api_router
from .api.routes import attendance, employees, timezone, websocket, early_exit
from .utils.websocket import process_websocket_responses, process_queue, set_main_loop, shutdown_all
from .dependencies import process_pool, shutdown_dependencies
from .database import query, create, create_class_schema
from .utils.time_utils import get_local_time
import asyncio
import logging
import gc
import signal
import sys
from contextlib import asynccontextmanager
from app.models import Employee, Attendance, OfficeTiming, Shift, TimezoneConfig

logger = logging.getLogger(__name__)

# Store background tasks for proper cleanup
_background_tasks = []


def handle_shutdown_signal(signum, frame):
    """Handle shutdown signals gracefully"""
    logger.info(f"Received shutdown signal {signum}")
    # Set flag for graceful shutdown
    import asyncio
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(shutdown_application())
    except RuntimeError:
        # If no loop is running, exit immediately
        sys.exit(0)


async def shutdown_application():
    """Perform graceful application shutdown"""
    logger.info("Starting graceful application shutdown")

    try:
        # Cancel all background tasks
        if _background_tasks:
            logger.info(f"Cancelling {len(_background_tasks)} background tasks")
            for task in _background_tasks:
                if not task.done():
                    task.cancel()

            # Wait for tasks to complete cancellation
            await asyncio.gather(*_background_tasks, return_exceptions=True)
            _background_tasks.clear()

        # Shutdown WebSocket components
        await shutdown_all()

        # Shutdown dependencies
        shutdown_dependencies()

        # Force garbage collection
        gc.collect()

        logger.info("Graceful shutdown complete")

    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}")

    # Exit the application
    sys.exit(0)


def initialize_database():
    """Initialize database with default data - DISABLED FOR PRODUCTION"""
    # ALL DATABASE INITIALIZATION IS COMMENTED OUT - NO CREATION NEEDED
    
    # logger.info("Initializing Back4App database...")
    
    # # Define all required classes and their fields
    # required_classes = {
    #     "Employee": {
    #         "employee_id": "String",
    #         "name": "String",
    #         "embedding": "String",
    #         "department": "String",
    #         "position": "String",
    #         "status": "String",
    #         "shift": "Pointer<Shift>",
    #         "phone_number": "String",
    #         "email": "String",
    #         "is_admin": "Boolean",
    #     },
    #     "Shift": {
    #         "name": "String",
    #         "login_time": "String",
    #         "logout_time": "String",
    #         "grace_period": "Number",
    #     },
    #     "Attendance": {
    #         "employee_id": "String",
    #         "employee": "Pointer<Employee>",
    #         "timestamp": "Date",
    #         "exit_time": "Date",
    #         "confidence": "Number",
    #         "is_late": "Boolean",
    #         "is_early_exit": "Boolean",
    #         "early_exit_reason": "String",
    #     },
    #     "TimezoneConfig": {
    #         "timezone_name": "String",
    #         "timezone_offset": "String",
    #     },
    #     "EarlyExitReason": {
    #         "employee_id": "String",
    #         "attendance_id": "String",
    #         "attendance": "Pointer<Attendance>",
    #         "employee": "Pointer<Employee>",
    #         "reason": "String",
    #     }
    # }

    # # Create or verify each class
    # logger.info("Available classes in Back4App:")
    # for class_name, fields in required_classes.items():
    #     try:
    #         # Try to query the class to verify it exists
    #         result = create_class_schema(class_name, fields)
    #         logger.info(result)
    #         logger.info(f"- {class_name} (exists)")
    #     except Exception as e:
    #         # If class doesn't exist, create it
    #         try:
    #             # Create class schema in Back4App
    #             create_class_schema(class_name, fields)
    #             logger.info(f"- {class_name} (created)")
    #         except Exception as e:
    #             logger.error(f"Error creating class {class_name}: {str(e)}")

    # # Create default shifts if not exists
    # try:
    #     shifts = query("Shift", limit=1)
    #     if not shifts:
    #         default_shifts = [
    #             {
    #                 "name": "Morning Shift",
    #                 "login_time": "09:00",
    #                 "logout_time": "18:00",
    #                 "grace_period": 30
    #             },
    #             {
    #                 "name": "Evening Shift",
    #                 "login_time": "14:00",
    #                 "logout_time": "23:00",
    #                 "grace_period": 30
    #             },
    #             {
    #                 "name": "Night Shift",
    #                 "login_time": "22:00",
    #                 "logout_time": "07:00",
    #                 "grace_period": 30
    #             }
    #         ]
    #         for shift_data in default_shifts:
    #             shift = Shift()
    #             shift.create(shift_data)
    #         logger.info("Created default shifts")
    # except Exception as e:
    #     logger.error(f"Error creating default shifts: {str(e)}")

    # # Check and create default timezone config if not exists
    # try:
    #     timezone_config = query("TimezoneConfig", limit=1)
    #     if not timezone_config:
    #         timezone = TimezoneConfig()
    #         timezone.create({
    #             "timezone_name": "Asia/Dubai",
    #             "timezone_offset": "+04:00"
    #         })
    #         logger.info("Created default timezone configuration")
    # except Exception as e:
    #     logger.error(f"Error creating default timezone: {str(e)}")

    # logger.info("Database initialization completed!")
    
    logger.info("Database initialization skipped - no creation needed")


@asynccontextmanager
async def lifespan(app):
    """Manage application lifespan events with memory optimization"""
    # Startup
    logger.info("Starting up application...")

    try:
        # Set up signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, handle_shutdown_signal)
        signal.signal(signal.SIGTERM, handle_shutdown_signal)

        # Set the main event loop for websocket operations
        loop = asyncio.get_running_loop()
        logger.info(f"Got running loop: {loop}")
        set_main_loop(loop)
        logger.info("Main event loop set for websocket operations")

        # Start the WebSocket processing tasks
        queue_task = asyncio.create_task(process_queue())
        response_task = asyncio.create_task(process_websocket_responses())

        # Store tasks for cleanup
        _background_tasks.extend([queue_task, response_task])

        logger.info("Background tasks started")
        
        # Database initialization is disabled for production - no creation needed
        # initialize_database()
        
        logger.info("Application startup completed successfully")

    except Exception as e:
        logger.error(f"Failed to start application: {str(e)}")
        raise

    yield

    # Shutdown
    logger.info("Starting application shutdown...")

    try:
        # Cancel background tasks
        if _background_tasks:
            logger.info(f"Cancelling {len(_background_tasks)} background tasks")
            for task in _background_tasks:
                if not task.done():
                    task.cancel()

            # Wait for tasks to complete cancellation with timeout
            try:
                await asyncio.wait_for(
                    asyncio.gather(*_background_tasks, return_exceptions=True),
                    timeout=10.0
                )
            except asyncio.TimeoutError:
                logger.warning("Background task cancellation timed out")

            _background_tasks.clear()

        # Shutdown WebSocket components
        await shutdown_all()

        # Shutdown dependencies (process/thread pools, etc.)
        shutdown_dependencies()

        # Force garbage collection
        gc.collect()

        logger.info("Application shutdown completed successfully")

    except Exception as e:
        logger.error(f"Error during application shutdown: {str(e)}")
        # Try to force cleanup anyway
        try:
            shutdown_dependencies()
            gc.collect()
        except:
            pass


app = create_app(lifespan=lifespan)

# Include all API routes
app.include_router(api_router)
app.include_router(attendance.router, tags=["attendance"])
app.include_router(employees.router, tags=["employees"])
app.include_router(timezone.router, tags=["timezone"])
app.include_router(websocket.router, tags=["websocket"])
app.include_router(early_exit.router, tags=["early-exit"])
