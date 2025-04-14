from sqlalchemy.orm import Session
from app.database import get_db
from app.face_utils import FaceRecognition
from multiprocessing import Manager
import concurrent.futures
import multiprocessing
import time
import logging
from app.models import User

logger = logging.getLogger(__name__)

# Create a process pool for image processing
process_pool = concurrent.futures.ProcessPoolExecutor(max_workers=multiprocessing.cpu_count())

# Create multiprocessing queues
manager = Manager()
processing_results_queue = manager.Queue(maxsize=100)
websocket_responses_queue = manager.Queue(maxsize=100)

# Dictionary to store pending futures
pending_futures = {}

# User cache to avoid frequent database queries
user_cache = manager.dict()
user_cache_lock = manager.Lock()
user_cache_last_updated = manager.Value('d', 0)
USER_CACHE_TTL = 300  # 5 minutes

# Dictionary to track number of pending tasks per client
client_pending_tasks = manager.dict()
client_pending_tasks_lock = manager.Lock()

# Store active WebSocket connections
active_connections = {}

# Initialize face recognition
face_recognition = FaceRecognition()

def get_face_recognition() -> FaceRecognition:
    return face_recognition

def get_process_pool():
    return process_pool

def get_queues():
    return processing_results_queue, websocket_responses_queue

def get_pending_futures():
    return pending_futures

def get_user_cache():
    return user_cache, user_cache_lock, user_cache_last_updated

def get_client_tasks():
    return client_pending_tasks, client_pending_tasks_lock

def get_active_connections():
    return active_connections

def get_cached_users(db: Session):
    """Get users from cache or database with TTL"""
    current_time = time.time()
    with user_cache_lock:
        if current_time - user_cache_last_updated.value > USER_CACHE_TTL or not user_cache:
            # Update cache
            users = db.query(User).all()
            user_cache.clear()
            user_cache.update({user.user_id: user for user in users})
            user_cache_last_updated.value = current_time
            logger.info("User cache updated")
        return list(user_cache.values()) 