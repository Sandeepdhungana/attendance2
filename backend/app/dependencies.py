from app.database import get_db
from app.face_utils import FaceRecognition
from multiprocessing import Manager, cpu_count
import concurrent.futures
import time
import logging
import gc
import sys
import os
import psutil
import threading
import traceback
from app.models import Employee
import threading

logger = logging.getLogger(__name__)

# Determine optimal number of workers based on CPU count and available memory
CPU_COUNT = cpu_count()
MEMORY_PER_WORKER_MB = 200  # Estimated memory per worker in MB
TOTAL_MEMORY_MB = psutil.virtual_memory().total / (1024 * 1024)

# Calculate optimal workers based on both CPU and memory constraints
MAX_CPU_WORKERS = max(CPU_COUNT - 1, 1)  # Leave one CPU for system tasks
MAX_MEMORY_WORKERS = int(TOTAL_MEMORY_MB / MEMORY_PER_WORKER_MB * 0.75)  # Use 75% of theoretical max

# Choose the smaller of the two limits
PROCESS_WORKERS = min(MAX_CPU_WORKERS, MAX_MEMORY_WORKERS)
THREAD_WORKERS = CPU_COUNT * 2  # More threads than CPUs for I/O bound tasks

# Limit max concurrent requests per process worker
MAX_CONCURRENT_REQUESTS_PER_WORKER = 2
MAX_CONCURRENT_REQUESTS = PROCESS_WORKERS * MAX_CONCURRENT_REQUESTS_PER_WORKER

# Process pool health monitoring
PROCESS_POOL_HEALTH_CHECK_INTERVAL = 60  # seconds
MAX_FAILED_TASKS_BEFORE_RESTART = 5
PROCESS_POOL_MAX_AGE = 3600  # seconds (1 hour) - recreate pool periodically

logger.info(f"System has {CPU_COUNT} CPUs and {TOTAL_MEMORY_MB:.1f}MB memory")
logger.info(f"Using {PROCESS_WORKERS} process workers (memory: {MEMORY_PER_WORKER_MB}MB/worker)")
logger.info(f"Max concurrent requests: {MAX_CONCURRENT_REQUESTS}")

# Create a process pool for CPU-intensive tasks (face recognition)
# Use a threading.Lock to control access to process_pool during recreation
process_pool_lock = threading.Lock()
process_pool = concurrent.futures.ProcessPoolExecutor(max_workers=PROCESS_WORKERS)
process_pool_creation_time = time.time()
failed_tasks_counter = 0

# Create a thread pool for I/O bound tasks (database operations, network calls)
thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=THREAD_WORKERS, thread_name_prefix="io_worker")

# Create multiprocessing queues
manager = Manager()
processing_results_queue = manager.Queue(maxsize=100)
websocket_responses_queue = manager.Queue(maxsize=100)

# Dictionary to store pending futures
pending_futures = {}

# Employee cache to avoid frequent database queries
employee_cache = manager.dict()
employee_cache_lock = manager.Lock()
employee_cache_last_updated = manager.Value('d', 0)
EMPLOYEE_CACHE_TTL = 300  # 5 minutes

# Dictionary to track number of pending tasks per client
client_pending_tasks = manager.dict()
client_pending_tasks_lock = manager.Lock()

# Store active WebSocket connections
active_connections = {}

# Initialize face recognition
face_recognition = FaceRecognition()

def get_face_recognition() -> FaceRecognition:
    return face_recognition

def recreate_process_pool(reason="Unknown"):
    """
    Recreate the process pool completely.
    """
    global process_pool, process_pool_creation_time, failed_tasks_counter
    
    with process_pool_lock:
        logger.warning(f"Recreating process pool. Reason: {reason}")
        
        # Force garbage collection to clean up memory
        gc.collect()
        
        # Shutdown existing pool with a timeout
        try:
            logger.info("Shutting down existing process pool")
            process_pool.shutdown(wait=False)
            logger.info("Process pool shutdown completed")
        except Exception as e:
            logger.error(f"Error shutting down process pool: {str(e)}")
            
        # Create new process pool
        try:
            logger.info(f"Creating new process pool with {PROCESS_WORKERS} workers")
            process_pool = concurrent.futures.ProcessPoolExecutor(max_workers=PROCESS_WORKERS)
            process_pool_creation_time = time.time()
            failed_tasks_counter = 0
            logger.info("New process pool created successfully")
        except Exception as e:
            logger.critical(f"Failed to create new process pool: {str(e)}")
            # Emergency fallback - try with minimal workers
            try:
                logger.warning("Attempting to create emergency process pool with 1 worker")
                process_pool = concurrent.futures.ProcessPoolExecutor(max_workers=1)
                process_pool_creation_time = time.time()
            except Exception as e2:
                logger.critical(f"Failed to create emergency process pool: {str(e2)}")
                # Nothing more we can do - application will need to restart

def check_and_handle_pool_recreation():
    """Check if pool needs recreation based on age or other metrics"""
    global process_pool_creation_time, failed_tasks_counter
    
    current_time = time.time()
    pool_age = current_time - process_pool_creation_time
    
    # Check if pool is too old
    if pool_age > PROCESS_POOL_MAX_AGE:
        recreate_process_pool(reason=f"Pool age exceeded limit ({pool_age:.1f}s > {PROCESS_POOL_MAX_AGE}s)")
        return True
        
    # Check if too many tasks have failed
    if failed_tasks_counter >= MAX_FAILED_TASKS_BEFORE_RESTART:
        recreate_process_pool(reason=f"Too many failed tasks ({failed_tasks_counter} > {MAX_FAILED_TASKS_BEFORE_RESTART})")
        return True
        
    # Check memory usage
    try:
        memory = psutil.virtual_memory()
        if memory.percent > 90:
            logger.warning(f"High memory usage detected: {memory.percent}%. Considering pool recreation.")
            # Only recreate if it's been running for a while (to avoid rapid recreation)
            if pool_age > 300:  # 5 minutes
                recreate_process_pool(reason=f"High memory usage: {memory.percent}%")
                return True
    except Exception as e:
        logger.error(f"Error checking memory for pool recreation: {str(e)}")
    
    return False

def get_process_pool():
    """
    Get the current process pool. If the pool is broken or needs recreation, create a new one.
    Also performs health checks periodically.
    """
    global process_pool, failed_tasks_counter
    
    with process_pool_lock:
        try:
            # Perform periodic health check
            if time.time() % PROCESS_POOL_HEALTH_CHECK_INTERVAL < 1:
                if check_and_handle_pool_recreation():
                    return process_pool
                
            # Check if the pool is broken
            if hasattr(process_pool, '_broken') and process_pool._broken:
                logger.warning("Process pool is broken, recreating")
                recreate_process_pool(reason="Pool is marked as broken")
            
            # Check if we have too many pending tasks
            if hasattr(process_pool, '_pending_work_items') and len(process_pool._pending_work_items) > MAX_CONCURRENT_REQUESTS:
                logger.warning(f"Too many pending tasks in pool: {len(process_pool._pending_work_items)}")
                # We don't recreate here, just log the warning
                
        except Exception as e:
            logger.error(f"Error checking process pool health: {str(e)}")
            try:
                # Something is wrong with the pool, recreate it
                recreate_process_pool(reason=f"Error during health check: {str(e)}")
            except Exception as e2:
                logger.critical(f"Failed to recover process pool: {str(e2)}")
    
    return process_pool

def handle_process_error(client_id, error):
    """Handle errors in process pool tasks"""
    global failed_tasks_counter
    
    with process_pool_lock:
        failed_tasks_counter += 1
        
    error_type = type(error).__name__
    error_str = str(error)
    logger.error(f"Process pool task error for client {client_id}: {error_type}: {error_str}")
    
    # Check for specific error types that require different handling
    if "MemoryError" in error_str or isinstance(error, MemoryError):
        logger.critical(f"Memory error in process pool: {error_str}")
        # Force garbage collection and recreate the pool
        gc.collect()
        recreate_process_pool(reason=f"Memory error: {error_str}")
    elif "A process in the process pool was terminated" in error_str:
        logger.critical(f"Process terminated unexpectedly: {error_str}")
        recreate_process_pool(reason="Process terminated unexpectedly")
        
    # Return a generic error response
    return {"error": f"Processing error: {error_type}", "details": error_str}, None, {}, 2

def get_thread_pool():
    return thread_pool

def get_queues():
    return processing_results_queue, websocket_responses_queue

def get_pending_futures():
    return pending_futures

def get_employee_cache():
    return employee_cache, employee_cache_lock, employee_cache_last_updated

def get_client_tasks():
    return client_pending_tasks, client_pending_tasks_lock

def get_active_connections():
    return active_connections

def get_cached_employees():
    """Get employees from cache or database with TTL"""
    current_time = time.time()
    with employee_cache_lock:
        if current_time - employee_cache_last_updated.value > EMPLOYEE_CACHE_TTL or not employee_cache:
            # Update cache
            try:
                employees = Employee().query()
                employee_cache.clear()
                employee_cache.update({employee["objectId"]: employee for employee in employees})
                employee_cache_last_updated.value = current_time
                logger.info("Employee cache updated")
            except Exception as e:
                logger.error(f"Error updating employee cache: {str(e)}")
                # Return current cache even if outdated
                if not employee_cache:
                    return []
        return list(employee_cache.values()) 