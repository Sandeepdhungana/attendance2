import cv2
import numpy as np
import os
import time
import json
import requests
import insightface
from insightface.app import FaceAnalysis
import sqlite3
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

# Import from the main application
try:
    import models
    import database
    from face_utils import FaceRecognition
    from database import engine, get_db
    from sqlalchemy.orm import Session
    
    # Create database tables
    models.Base.metadata.create_all(bind=engine)
    
    # Get database session
    db = next(get_db())
    
    # Initialize face recognition
    face_recognition = FaceRecognition()
    
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
        return get_local_time().date()
    
    USING_MAIN_APP = True
except ImportError:
    USING_MAIN_APP = False
    print("Warning: Could not import modules from the main application.")
    print("Falling back to standalone implementation.")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("face_attendance.log"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("face_attendance")

# Configuration
FACE_DETECTION_INTERVAL = 1.0  # Seconds between face detection attempts
CONFIDENCE_THRESHOLD = 0.6  # Minimum confidence for face recognition
DATABASE_PATH = "face_attendance.db"
API_BASE_URL = "http://localhost:8000/api"
WS_URL = "ws://localhost:8000/ws/attendance-updates"
FACE_DB_PATH = "face_db"  # Directory containing face embeddings
VIDEO_DIR = "video"  # Directory containing video files
DISPLAY_WIDTH = 500  # Display width
DISPLAY_HEIGHT = 500  # Display height

# Store active WebSocket connections for notifications
active_connections: List[websocket.WebSocket] = []

# Initialize database connection (fallback if not using main app)
def init_db():
    logger.info("Initializing database connection")
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # Create users table if it doesn't exist
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # Create attendance table if it doesn't exist
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        confidence REAL NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (user_id)
    )
    ''')
    
    conn.commit()
    logger.info("Database initialized successfully")
    return conn

# Get all registered users from the database (fallback if not using main app)
def get_registered_users(conn):
    logger.info("Fetching registered users from database")
    cursor = conn.cursor()
    cursor.execute("SELECT user_id, name FROM users")
    users = {row[0]: row[1] for row in cursor.fetchall()}
    logger.info(f"Found {len(users)} registered users")
    return users

# Record attendance in the database
def record_attendance(user_id, confidence, db_session=None):
    logger.info(f"Recording attendance for user {user_id} with confidence {confidence:.2f}")
    
    if USING_MAIN_APP and db_session:
        # Use the main application's database models
        try:
            # Check if attendance already marked for today
            today = get_local_date()
            existing_attendance = db_session.query(models.Attendance).filter(
                models.Attendance.user_id == user_id,
                models.Attendance.timestamp >= today
            ).first()
            
            if existing_attendance:
                logger.info(f"Attendance already marked for today for user {user_id}")
                return
            
            # Mark attendance
            new_attendance = models.Attendance(
                user_id=user_id,
                confidence=confidence
            )
            db_session.add(new_attendance)
            db_session.commit()
            
            logger.info(f"Attendance marked successfully for user {user_id}")
            
            # Notify the frontend via WebSocket
            notify_frontend(user_id, confidence)
            
        except Exception as e:
            logger.error(f"Error recording attendance: {e}", exc_info=True)
    else:
        # Fallback to SQLite implementation
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO attendance (user_id, confidence) VALUES (?, ?)",
            (user_id, confidence)
        )
        conn.commit()
        conn.close()
        
        # Notify the frontend via WebSocket
        notify_frontend(user_id, confidence)

# Notify the frontend via WebSocket
def notify_frontend(user_id, confidence):
    try:
        logger.info(f"Sending WebSocket notification for user {user_id}")
        ws = websocket.create_connection(WS_URL)
        ws.send(json.dumps({
            "type": "attendance_update",
            "user_id": user_id,
            "timestamp": datetime.now().isoformat(),
            "confidence": confidence
        }))
        ws.close()
        logger.info("WebSocket notification sent successfully")
    except Exception as e:
        logger.error(f"WebSocket notification failed: {e}")

# Load face embeddings from the database (fallback if not using main app)
def load_face_embeddings():
    logger.info("Loading face embeddings")
    face_embeddings = {}
    
    # Check if face database directory exists
    if not os.path.exists(FACE_DB_PATH):
        os.makedirs(FACE_DB_PATH)
        logger.info(f"Created face database directory: {FACE_DB_PATH}")
        return face_embeddings
    
    # Load each embedding file
    for filename in os.listdir(FACE_DB_PATH):
        if filename.endswith(".npy"):
            user_id = filename.split(".")[0]
            embedding_path = os.path.join(FACE_DB_PATH, filename)
            embedding = np.load(embedding_path)
            face_embeddings[user_id] = embedding
            logger.info(f"Loaded embedding for user: {user_id}")
    
    logger.info(f"Loaded {len(face_embeddings)} face embeddings")
    return face_embeddings

# Process a frame for face detection and recognition
def process_frame(frame, db_session=None):
    try:
        if USING_MAIN_APP and db_session:
            # Use the main application's face recognition
            logger.debug("Detecting faces in frame using main app's face recognition")
            
            # Get all face embeddings from the image
            face_embeddings = face_recognition.get_embeddings(frame)
            if not face_embeddings:
                logger.debug("No faces detected in frame")
                return
            
            logger.info(f"Detected {len(face_embeddings)} faces in frame")
            
            # Get all users from the database
            users = db_session.query(models.User).all()
            
            # Find matches for all detected faces
            matches = face_recognition.find_matches_for_embeddings(face_embeddings, users)
            
            if not matches:
                logger.debug("No matching users found in the frame")
                return
            
            # Process each matched user
            for match in matches:
                user = match['user']
                similarity = match['similarity']
                bbox = match['bbox']
                
                # Draw rectangle around the face
                # Ensure bbox is in the correct format (x1, y1, x2, y2)
                if isinstance(bbox, (list, tuple, np.ndarray)) and len(bbox) == 4:
                    x1, y1, x2, y2 = [int(coord) for coord in bbox]
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    
                    # Draw name and confidence
                    cv2.putText(
                        frame, 
                        f"{user.name} ({similarity:.2f})", 
                        (x1, y1-10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 
                        0.5, 
                        (0, 255, 0), 
                        2
                    )
                    
                    logger.info(f"Recognized user {user.name} ({user.user_id}) with confidence {similarity:.2f}")
                    
                    # Record attendance
                    record_attendance(user.user_id, similarity, db_session)
                    
                    # Add a small delay to avoid multiple detections of the same person
                    time.sleep(0.5)
                else:
                    logger.warning(f"Invalid bounding box format: {bbox}")
        else:
            # Fallback to standalone implementation
            logger.debug("Detecting faces in frame using standalone implementation")
            
            # Initialize InsightFace if not already done
            if not hasattr(process_frame, 'face_analyzer'):
                process_frame.face_analyzer = FaceAnalysis(name="buffalo_l")
                process_frame.face_analyzer.prepare(ctx_id=0, det_size=(640, 640))
                process_frame.face_embeddings = load_face_embeddings()
                process_frame.registered_users = get_registered_users(init_db())
            
            # Detect faces in the frame
            faces = process_frame.face_analyzer.get(frame)
            
            if not faces:
                logger.debug("No faces detected in frame")
                return
            
            logger.info(f"Detected {len(faces)} faces in frame")
            
            for face in faces:
                # Get face bounding box
                bbox = face.bbox.astype(int)
                x1, y1, x2, y2 = bbox
                
                # Draw rectangle around the face
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                
                # Get face embedding
                embedding = face.embedding
                
                # Try to recognize the face
                best_match_id = None
                best_match_score = 0
                
                for user_id, stored_embedding in process_frame.face_embeddings.items():
                    # Calculate cosine similarity
                    similarity = np.dot(embedding, stored_embedding) / (
                        np.linalg.norm(embedding) * np.linalg.norm(stored_embedding)
                    )
                    
                    if similarity > best_match_score:
                        best_match_score = similarity
                        best_match_id = user_id
                
                if best_match_id and best_match_score >= CONFIDENCE_THRESHOLD:
                    # Draw name and confidence
                    name = process_frame.registered_users.get(best_match_id, "Unknown")
                    cv2.putText(
                        frame, 
                        f"{name} ({best_match_score:.2f})", 
                        (x1, y1-10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 
                        0.5, 
                        (0, 255, 0), 
                        2
                    )
                    
                    logger.info(f"Recognized user {name} ({best_match_id}) with confidence {best_match_score:.2f}")
                    
                    # Record attendance
                    record_attendance(best_match_id, best_match_score)
                    
                    # Add a small delay to avoid multiple detections of the same person
                    time.sleep(0.5)
                else:
                    cv2.putText(
                        frame, 
                        "Unknown", 
                        (x1, y1-10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 
                        0.5, 
                        (0, 0, 255), 
                        2
                    )
                    logger.debug(f"Unknown face detected with best match score {best_match_score:.2f}")
    except Exception as e:
        logger.error(f"Processing error: {e}", exc_info=True)

# Main function
def main(video_path=None, use_webcam=False):
    logger.info("Starting face attendance application")
    
    # Initialize database session
    db_session = None
    if USING_MAIN_APP:
        db_session = next(get_db())
        logger.info("Using main application's database session")
    else:
        logger.info("Using standalone database implementation")
        init_db()
    
    # Initialize video capture
    if use_webcam:
        logger.info("Initializing webcam capture")
        cap = cv2.VideoCapture(0)  # Use default webcam
        if not cap.isOpened():
            logger.error("Error: Could not open webcam")
            return
        logger.info("Webcam initialized successfully")
    elif video_path:
        # Use the provided video file
        logger.info(f"Initializing video capture from file: {video_path}")
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"Error: Could not open video file: {video_path}")
            return
        logger.info(f"Video file opened successfully: {video_path}")
    else:
        # List available videos in the video directory
        if not os.path.exists(VIDEO_DIR):
            os.makedirs(VIDEO_DIR)
            logger.info(f"Created video directory: {VIDEO_DIR}")
            logger.info("Please add video files to the 'video' directory and run again.")
            return
        
        video_files = [f for f in os.listdir(VIDEO_DIR) if f.endswith(('.mp4', '.avi', '.mov', '.mkv'))]
        if not video_files:
            logger.error(f"No video files found in {VIDEO_DIR} directory.")
            logger.info("Please add video files to the 'video' directory and run again.")
            return
        
        # Use the first video file found
        video_path = os.path.join(VIDEO_DIR, video_files[0])
        logger.info(f"Using first video file found: {video_path}")
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"Error: Could not open video file: {video_path}")
            return
        logger.info(f"Video file opened successfully: {video_path}")
    
    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps if fps > 0 else 0
    logger.info(f"Video properties: {frame_count} frames, {fps:.2f} fps, {duration:.2f} seconds")
    
    # Set display resolution
    logger.info(f"Setting display resolution to {DISPLAY_WIDTH}x{DISPLAY_HEIGHT}")
    
    last_detection_time = 0
    frame_count = 0
    start_time = time.time()
    
    # Calculate delay between frames based on FPS
    frame_delay = 1.0 / fps if fps > 0 else 0.033  # Default to ~30fps if FPS is 0
    logger.info(f"Setting frame delay to {frame_delay:.3f} seconds ({1/frame_delay:.1f} fps)")
    
    logger.info("Starting video processing. Press 'q' to quit, 'p' to pause/resume.")
    paused = False
    
    try:
        while True:
            if not paused:
                ret, frame = cap.read()
                if not ret:
                    logger.info("End of video reached.")
                    break
                
                frame_count += 1
                
                # Resize frame for display
                display_frame = cv2.resize(frame, (DISPLAY_WIDTH, DISPLAY_HEIGHT))
                
                # Process frame for face detection at intervals
                current_time = time.time()
                if current_time - last_detection_time >= FACE_DETECTION_INTERVAL:
                    # Create a copy of the frame for processing
                    process_frame(display_frame.copy(), db_session)
                    last_detection_time = current_time
                
                # Display the frame
                cv2.imshow('Face Attendance', display_frame)
                
                # Add delay to control playback speed
                time.sleep(frame_delay)
            
            # Check for key presses
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                logger.info("Quit command received")
                break
            elif key == ord('p'):
                paused = not paused
                logger.info("Paused" if paused else "Resumed")
    
    finally:
        # Calculate and log statistics
        elapsed_time = time.time() - start_time
        logger.info(f"Processing completed. Processed {frame_count} frames in {elapsed_time:.2f} seconds")
        logger.info(f"Average processing speed: {frame_count/elapsed_time:.2f} fps")
        
        # Clean up
        logger.info("Cleaning up resources")
        cap.release()
        cv2.destroyAllWindows()
        if db_session:
            db_session.close()
        logger.info("Application terminated")

if __name__ == "__main__":
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Process a video file or webcam for face attendance.')
    parser.add_argument('--video', type=str, help='Path to the video file to process')
    parser.add_argument('--webcam', action='store_true', help='Use webcam instead of video file')
    args = parser.parse_args()
    
    # Run the main function with the provided options
    main(args.video, args.webcam) 