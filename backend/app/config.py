import os
from typing import Dict, Any

# WebSocket settings
PING_INTERVAL = 30  # seconds
PING_TIMEOUT = 60  # seconds
MAX_FRAMES_PER_SECOND = 1
MAX_CONCURRENT_TASKS_PER_CLIENT = 2

# Cache settings
USER_CACHE_TTL = 300  # 5 minutes

# Directory settings
IMAGES_DIR = "images"
if not os.path.exists(IMAGES_DIR):
    os.makedirs(IMAGES_DIR)

# Database settings
DATABASE_URL = "sqlite:///./attendance.db"

# Face recognition settings
FACE_RECOGNITION_THRESHOLD = 0.6  # Minimum similarity score for face recognition 