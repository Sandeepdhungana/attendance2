from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown"""
    # Startup
    logger.info("Application starting up...")
    
    # Import here to avoid circular imports
    from .utils.websocket import process_queue, process_websocket_responses
    from .dependencies import process_pool
    import asyncio
    
    # Start WebSocket response processing tasks
    asyncio.create_task(process_queue())
    asyncio.create_task(process_websocket_responses())
    logger.info("WebSocket processing tasks started")
    
    yield
    
    # Shutdown
    logger.info("Application shutting down...")
    process_pool.shutdown()
    logger.info("Process pool shutdown completed")

def create_app() -> FastAPI:
    app = FastAPI(
        title="Face Attendance API",
        description="Restaurant People Counting & Face Attendance System", 
        version="1.0.0",
        lifespan=lifespan  # This fixes the ASGI lifespan protocol warning
    )
    
    # CORS configuration is now handled in main.py with proper security restrictions
    
    return app 