import cv2
import numpy as np
import os
import time
import json
import requests
import insightface
from insightface.app import FaceAnalysis
from datetime import datetime
import threading
import websocket
import base64
import argparse
import logging
import sys
import asyncio
import pytz
from typing import List
from app.database import query, create, update, delete
from app.config import BACK4APP_APPLICATION_ID, BACK4APP_REST_API_KEY, BACK4APP_SERVER_URL

# Headers for all requests
HEADERS = {
    "X-Parse-Application-Id": BACK4APP_APPLICATION_ID,
    "X-Parse-REST-API-Key": BACK4APP_REST_API_KEY,
    "Content-Type": "application/json"
}

BASE_URL = f"{BACK4APP_SERVER_URL}/classes"
    
    # Get local timezone
    try:
        local_tz = pytz.timezone('Asia/Kolkata')  # Default to IST
    except:
        # Fallback if pytz is not available
        from datetime import timezone, timedelta
        local_tz = timezone(timedelta(hours=5, minutes=30))  # IST offset as fallback
    
    def get_local_time():
        """Get current time in local timezone"""
        return datetime.now(local_tz)
    
    def get_local_date():
        """Get current date in local timezone"""
    return datetime.now(local_tz).date()

def get_registered_users():
    """Get all registered users from Back4App"""
    users = query("User")
    return users

def record_attendance(user_id, confidence):
    """Record attendance in Back4App"""
            today = get_local_date()
    today_start = datetime.combine(today, datetime.min.time())
    today_start = convert_to_local_time(today_start)
    today_end = datetime.combine(today, datetime.max.time())
    today_end = convert_to_local_time(today_end)

    # Check for existing attendance
    existing = query(
        "Attendance",
        where={
            "user_id": user_id,
            "timestamp": {
                "$gte": today_start.isoformat(),
                "$lte": today_end.isoformat()
            }
        },
        limit=1
    )

    if existing:
        # Update exit time if entry exists
        if not existing[0].get("exit_time"):
            update(
                "Attendance",
                existing[0]["objectId"],
                {"exit_time": get_local_time().isoformat()}
            )
    else:
        # Create new attendance record
        create(
            "Attendance",
            {
                "user_id": user_id,
                "confidence": confidence,
                "timestamp": get_local_time().isoformat()
            }
        )

def notify_frontend(user_id, confidence):
    """Notify frontend about attendance"""
    # Implement WebSocket notification
    pass

def load_face_embeddings():
    """Load face embeddings from Back4App"""
    users = query("User")
    embeddings = {}
    for user in users:
        if "face_embedding" in user:
            embeddings[user["user_id"]] = np.array(user["face_embedding"])
    return embeddings

def process_frame(frame, face_recognition):
    """Process a single frame for face recognition"""
    # Implement face recognition logic
    pass

def main(video_path=None, use_webcam=False):
    """Main function"""
    # Initialize face recognition
    face_recognition = FaceAnalysis()
    face_recognition.prepare(ctx_id=0, det_size=(640, 640))

    # Load face embeddings
    embeddings = load_face_embeddings()

    if use_webcam:
        cap = cv2.VideoCapture(0)
    else:
        cap = cv2.VideoCapture(video_path)

        while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
        # Process frame
        process_frame(frame, face_recognition)

        # Display frame
        cv2.imshow('Face Recognition', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
                break

        cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", help="Path to video file")
    parser.add_argument("--webcam", action="store_true", help="Use webcam")
    args = parser.parse_args()
    
    main(video_path=args.video, use_webcam=args.webcam) 