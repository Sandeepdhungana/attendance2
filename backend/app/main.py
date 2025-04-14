from fastapi import FastAPI
from . import create_app
from .api import router as api_router
from .utils.websocket import process_queue, process_websocket_responses
from .dependencies import process_pool
import asyncio
import logging
import signal
import multiprocessing
from app.models import Base
from app.database import engine


logger = logging.getLogger(__name__)

# Create database tables
Base.metadata.create_all(bind=engine)

app = create_app()

# Include API routes
app.include_router(api_router)

# Process cleanup handler
def cleanup_processes():
    """Clean up all processes when the application exits"""
    for process in multiprocessing.active_children():
        process.terminate()
    process_pool.shutdown(wait=True)

# Register cleanup handler
signal.signal(signal.SIGTERM, lambda signum, frame: cleanup_processes())
signal.signal(signal.SIGINT, lambda signum, frame: cleanup_processes())

@app.on_event("startup")
async def startup_event():
    """Start the queue processing tasks when the application starts"""
    asyncio.create_task(process_queue())
    asyncio.create_task(process_websocket_responses())
    logger.info("Queue processing tasks started") 