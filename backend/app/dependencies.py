from app.database import get_db
from app.face_utils import FaceRecognition
from multiprocessing import Manager, cpu_count
import concurrent.futures
import time
import logging
import gc
import weakref
from app.models import Employee
import threading
import atexit

logger = logging.getLogger(__name__)

# Determine optimal number of workers based on CPU count
CPU_COUNT = cpu_count()
# CRITICAL MEMORY FIX: Reduce process workers to prevent memory exhaustion
# Each worker loads ~1.5GB of face recognition models, so limit to max 2 workers
# This prevents "process terminated abruptly" errors from memory overload
PROCESS_WORKERS = min(max(CPU_COUNT // 2, 1), 2)  # Use half CPUs, max 2 workers to prevent memory exhaustion
THREAD_WORKERS = min(CPU_COUNT * 2, 8)  # Limit max threads to prevent resource exhaustion

logger.info(f"System has {CPU_COUNT} CPUs, using {PROCESS_WORKERS} process workers (memory-optimized for face recognition) and {THREAD_WORKERS} thread workers")

# Memory optimization constants
MAX_QUEUE_SIZE = 50  # Reduced from 100 to prevent memory accumulation
MAX_EMPLOYEE_CACHE_SIZE = 1000  # Limit employee cache size
EMPLOYEE_CACHE_TTL = 300  # 5 minutes
CACHE_CLEANUP_INTERVAL = 600  # 10 minutes
MAX_PENDING_FUTURES = 100  # Limit pending futures
MAX_CLIENT_TASKS = 1000  # Limit client tasks tracking

# Create a process pool for CPU-intensive tasks (face recognition)
# Use a threading.Lock to control access to process_pool during recreation
process_pool_lock = threading.Lock()
process_pool = concurrent.futures.ProcessPoolExecutor(max_workers=PROCESS_WORKERS)

# Create a thread pool for I/O bound tasks (database operations, network calls)
thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=THREAD_WORKERS, thread_name_prefix="io_worker")

# Create multiprocessing queues with size limits
manager = Manager()
processing_results_queue = manager.Queue(maxsize=MAX_QUEUE_SIZE)
websocket_responses_queue = manager.Queue(maxsize=MAX_QUEUE_SIZE)

# Dictionary to store pending futures with size limit
pending_futures = {}

# Employee cache to avoid frequent database queries with memory optimization
employee_cache = manager.dict()
employee_cache_lock = manager.Lock()
employee_cache_last_updated = manager.Value('d', 0)
employee_cache_last_cleanup = manager.Value('d', 0)

# Dictionary to track number of pending tasks per client with size limit
client_pending_tasks = manager.dict()
client_pending_tasks_lock = manager.Lock()

# Store active WebSocket connections
active_connections = {}

# Initialize face recognition
face_recognition = FaceRecognition()

# Cleanup tracking
_last_global_cleanup = time.time()
_shutdown_initiated = False

def cleanup_expired_futures():
    """Clean up expired futures to prevent memory leaks"""
    global pending_futures
    
    if len(pending_futures) == 0:
        return 0
        
    expired_count = 0
    expired_futures = []
    
    # Find expired futures
    for future in list(pending_futures.keys()):
        if future.done() or future.cancelled():
            expired_futures.append(future)
    
    # Remove expired futures
    for future in expired_futures:
        pending_futures.pop(future, None)
        expired_count += 1
    
    if expired_count > 0:
        logger.debug(f"Cleaned up {expired_count} expired futures")
    
    return expired_count

def cleanup_client_tasks():
    """Clean up client tasks for disconnected clients"""
    with client_pending_tasks_lock:
        if len(client_pending_tasks) == 0:
            return 0
            
        cleaned_count = 0
        disconnected_clients = []
        
        # Find clients not in active connections
        for client_id in list(client_pending_tasks.keys()):
            if client_id not in active_connections:
                disconnected_clients.append(client_id)
        
        # Remove disconnected clients
        for client_id in disconnected_clients:
            client_pending_tasks.pop(client_id, None)
            cleaned_count += 1
        
        if cleaned_count > 0:
            logger.debug(f"Cleaned up {cleaned_count} disconnected client task records")
        
        return cleaned_count

def cleanup_employee_cache():
    """Clean up employee cache to prevent unlimited growth"""
    current_time = time.time()
    
    with employee_cache_lock:
        if current_time - employee_cache_last_cleanup.value < CACHE_CLEANUP_INTERVAL:
            return 0
            
        employee_cache_last_cleanup.value = current_time
        
        # If cache is too large, clear it
        if len(employee_cache) > MAX_EMPLOYEE_CACHE_SIZE:
            logger.info(f"Employee cache too large ({len(employee_cache)} entries), clearing")
            employee_cache.clear()
            employee_cache_last_updated.value = 0
            return len(employee_cache)
    
    return 0

def perform_global_cleanup():
    """Perform comprehensive cleanup of all resources"""
    global _last_global_cleanup
    current_time = time.time()
    
    # Only run cleanup every few minutes
    if current_time - _last_global_cleanup < 300:  # 5 minutes
        return
    
    _last_global_cleanup = current_time
    logger.debug("Performing global resource cleanup")
    
    try:
        # Cleanup various resources
        cleanup_expired_futures()
        cleanup_client_tasks()
        cleanup_employee_cache()
        
        # Limit pending futures
        if len(pending_futures) > MAX_PENDING_FUTURES:
            logger.warning(f"Too many pending futures ({len(pending_futures)}), cleaning oldest")
            # Remove oldest futures
            futures_to_remove = list(pending_futures.keys())[:-MAX_PENDING_FUTURES]
            for future in futures_to_remove:
                if not future.done():
                    future.cancel()
                pending_futures.pop(future, None)
        
        # Force garbage collection
        collected = gc.collect()
        if collected > 0:
            logger.debug(f"Global cleanup: garbage collector freed {collected} objects")
            
    except Exception as e:
        logger.error(f"Error during global cleanup: {str(e)}")

def get_face_recognition() -> FaceRecognition:
    # Perform cleanup when accessing face recognition
    perform_global_cleanup()
    return face_recognition

def get_process_pool():
    """
    Get the current process pool. If the pool is broken, create a new one.
    Memory-optimized to prevent process termination from face recognition model loading.
    """
    global process_pool
    
    # Perform cleanup
    perform_global_cleanup()
    
    with process_pool_lock:
        try:
            # Check if the pool is broken by submitting a simple task
            if hasattr(process_pool, '_broken') and process_pool._broken:
                logger.warning("Process pool is broken, creating a new memory-optimized one")
                # Close the old pool (it's already broken, so just clean up)
                try:
                    process_pool.shutdown(wait=False)
                except Exception as e:
                    logger.warning(f"Error shutting down broken process pool: {str(e)}")
                
                # Create a new process pool with memory-safe worker count
                process_pool = concurrent.futures.ProcessPoolExecutor(max_workers=PROCESS_WORKERS)
                logger.info(f"Created new process pool with {PROCESS_WORKERS} workers (memory-optimized)")
        except Exception as e:
            logger.error(f"Error checking process pool: {str(e)}")
            # If we can't check the pool, assume it's broken and create a new one
            try:
                process_pool.shutdown(wait=False)
            except:
                pass
            
            # Create a new process pool with memory-safe worker count
            process_pool = concurrent.futures.ProcessPoolExecutor(max_workers=PROCESS_WORKERS)
            logger.info(f"Created new process pool after error with {PROCESS_WORKERS} workers (memory-optimized)")
    
    return process_pool

def get_thread_pool():
    # Perform cleanup when accessing thread pool
    perform_global_cleanup()
    return thread_pool

def get_queues():
    # Perform cleanup when accessing queues
    perform_global_cleanup()
    return processing_results_queue, websocket_responses_queue

def get_pending_futures():
    # Cleanup expired futures when accessing
    cleanup_expired_futures()
    return pending_futures

def get_employee_cache():
    # Perform cleanup when accessing cache
    cleanup_employee_cache()
    return employee_cache, employee_cache_lock, employee_cache_last_updated

def get_client_tasks():
    # Cleanup disconnected clients when accessing
    cleanup_client_tasks()
    return client_pending_tasks, client_pending_tasks_lock

def get_active_connections():
    return active_connections

def get_cached_employees():
    """Get employees from cache or database with TTL and memory optimization"""
    current_time = time.time()
    
    # Perform cleanup
    cleanup_employee_cache()
    
    with employee_cache_lock:
        if current_time - employee_cache_last_updated.value > EMPLOYEE_CACHE_TTL or not employee_cache:
            # Update cache
            try:
                employees = Employee().query()
                
                # Limit cache size to prevent memory issues
                if len(employees) > MAX_EMPLOYEE_CACHE_SIZE:
                    logger.warning(f"Too many employees ({len(employees)}), limiting cache to {MAX_EMPLOYEE_CACHE_SIZE}")
                    employees = employees[:MAX_EMPLOYEE_CACHE_SIZE]
                
                employee_cache.clear()
                employee_cache.update({employee["objectId"]: employee for employee in employees})
                employee_cache_last_updated.value = current_time
                logger.debug(f"Employee cache updated with {len(employee_cache)} entries")
            except Exception as e:
                logger.error(f"Error updating employee cache: {str(e)}")
                # Return empty list if cache update fails
                return []
        
        return list(employee_cache.values())

def shutdown_dependencies():
    """Shutdown all dependency resources gracefully"""
    global _shutdown_initiated
    
    if _shutdown_initiated:
        return
        
    _shutdown_initiated = True
    logger.info("Shutting down dependencies")
    
    try:
        # Shutdown process pool
        with process_pool_lock:
            try:
                process_pool.shutdown(wait=False)
                logger.info("Process pool shutdown initiated")
            except Exception as e:
                logger.error(f"Error shutting down process pool: {str(e)}")
        
        # Shutdown thread pool
        try:
            thread_pool.shutdown(wait=False)
            logger.info("Thread pool shutdown initiated")
        except Exception as e:
            logger.error(f"Error shutting down thread pool: {str(e)}")
        
        # Clear all data structures
        try:
            pending_futures.clear()
            active_connections.clear()
            
            with client_pending_tasks_lock:
                client_pending_tasks.clear()
            
            with employee_cache_lock:
                employee_cache.clear()
            
            # Drain queues
            try:
                while not processing_results_queue.empty():
                    processing_results_queue.get_nowait()
            except:
                pass
                
            try:
                while not websocket_responses_queue.empty():
                    websocket_responses_queue.get_nowait()
            except:
                pass
            
            logger.info("Data structures cleared")
        except Exception as e:
            logger.error(f"Error clearing data structures: {str(e)}")
        
        # Force garbage collection
        gc.collect()
        logger.info("Dependencies shutdown complete")
        
    except Exception as e:
        logger.error(f"Error during dependencies shutdown: {str(e)}")

# Register shutdown function to run on exit
atexit.register(shutdown_dependencies) 