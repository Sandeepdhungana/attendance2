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

# Back4App settings
BACK4APP_APPLICATION_ID = "VXlRAyM9B1ejoZuMmMthHVZgaWs0WJf4s9AIN0Be"
BACK4APP_REST_API_KEY = "6dALgL7Y4M8qwqAZewdQZBGRKP2DdD9TgXL64qTa"
BACK4APP_MASTER_KEY = "78CsqfmbtuWHclu8gnJuuip0VcgCnkeRboZz8m1x"
BACK4APP_SERVER_URL = "https://parseapi.back4app.com"


SENDPULSE_API_URL = "https://api.sendpulse.com"
SENDPULSE_CLIENT_ID = "e6166297e5fa0df74a742b1f8d6c0fa1"
SENDPULSE_CLIENT_SECRET = "4ebf9af5bc18d5eb74eb6309f99226f7"

# Face recognition settings
FACE_RECOGNITION_THRESHOLD = 0.6  # Minimum similarity score for face recognition 