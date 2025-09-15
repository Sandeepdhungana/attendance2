import os
from typing import Dict, Any
from dotenv import load_dotenv

# Load environment variables from .env file
# Look for the .env file in the same directory as this file
current_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=os.path.join(current_dir, '.env'))

# WebSocket settings
PING_INTERVAL = 30  # seconds
PING_TIMEOUT = 60  # seconds
MAX_FRAMES_PER_SECOND = 1
MAX_CONCURRENT_TASKS_PER_CLIENT = 1

# Cache settings
USER_CACHE_TTL = 300  # 5 minutes

# Directory settings
IMAGES_DIR = "images"
if not os.path.exists(IMAGES_DIR):
    os.makedirs(IMAGES_DIR)

# Back4App settings
BACK4APP_APPLICATION_ID = os.getenv("BACK4APP_APPLICATION_ID")
BACK4APP_REST_API_KEY = os.getenv("BACK4APP_REST_API_KEY")
BACK4APP_MASTER_KEY = os.getenv("BACK4APP_MASTER_KEY")
BACK4APP_SERVER_URL = os.getenv("BACK4APP_SERVER_URL")

print(BACK4APP_APPLICATION_ID)
print(BACK4APP_REST_API_KEY)
print(BACK4APP_MASTER_KEY)
print(BACK4APP_SERVER_URL)

# SendPulse settings
SENDPULSE_API_URL = os.getenv("SENDPULSE_API_URL", "https://api.sendpulse.com")
SENDPULSE_CLIENT_ID = os.getenv("SENDPULSE_CLIENT_ID")
SENDPULSE_CLIENT_SECRET = os.getenv("SENDPULSE_CLIENT_SECRET")

# Face recognition settings
FACE_RECOGNITION_THRESHOLD = float(os.getenv("FACE_RECOGNITION_THRESHOLD", "0.6"))

# JWT Authentication settings
# You can override these in your .env file:
# ACCESS_TOKEN_EXPIRE_MINUTES=30  (in minutes)
# REFRESH_TOKEN_EXPIRE_HOURS=48   (in hours)
JWT_SECRET_KEY = BACK4APP_APPLICATION_ID  # Using app ID as secret key
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))  # 30 minutes
REFRESH_TOKEN_EXPIRE_HOURS = int(os.getenv("REFRESH_TOKEN_EXPIRE_HOURS", "48"))   # 48 hours 