from fastapi import FastAPI, File, UploadFile, Depends, HTTPException, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, date, timezone, timedelta
import cv2
import numpy as np
from typing import List, Dict, Any, Optional
import base64
import json
import asyncio
import logging
import pytz
import multiprocessing
from multiprocessing import Process, Queue, Manager
import concurrent.futures
import threading
from queue import Queue as ThreadQueue
import time
import os
import signal
import uuid

import models
import database
from face_utils import FaceRecognition
from database import engine, get_db

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI()
face_recognition = FaceRecognition()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active WebSocket connections
active_connections = {}

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

# WebSocket ping interval in seconds (30 seconds)
PING_INTERVAL = 30

# WebSocket ping timeout in seconds (60 seconds)
PING_TIMEOUT = 60

# Maximum number of frames to process per second
MAX_FRAMES_PER_SECOND = 1

# Maximum number of concurrent image processing tasks per client
MAX_CONCURRENT_TASKS_PER_CLIENT = 2

# Dictionary to track number of pending tasks per client
client_pending_tasks = manager.dict()
client_pending_tasks_lock = manager.Lock()

# Get local timezone
try:
    # Default to IST, can be changed based on your location
    local_tz = pytz.timezone('Asia/Kolkata')
except:
    # Fallback if pytz is not available
    local_tz = timezone(timedelta(hours=5, minutes=30))  # IST offset as fallback

# Create images directory if it doesn't exist
IMAGES_DIR = "images"
if not os.path.exists(IMAGES_DIR):
    os.makedirs(IMAGES_DIR)
    logger.info(f"Created images directory: {IMAGES_DIR}")

# Process cleanup handler
def cleanup_processes():
    """Clean up all processes when the application exits"""
    for process in multiprocessing.active_children():
        process.terminate()
    process_pool.shutdown(wait=True)

# Register cleanup handler
signal.signal(signal.SIGTERM, lambda signum, frame: cleanup_processes())
signal.signal(signal.SIGINT, lambda signum, frame: cleanup_processes())

def get_cached_users(db: Session):
    """Get users from cache or database with TTL"""
    global user_cache, user_cache_last_updated

    current_time = time.time()
    with user_cache_lock:
        if current_time - user_cache_last_updated.value > USER_CACHE_TTL or not user_cache:
            # Update cache
            users = db.query(models.User).all()
            user_cache.clear()
            user_cache.update({user.user_id: user for user in users})
            user_cache_last_updated.value = current_time
            logger.info("User cache updated")
        return list(user_cache.values())

# Function to process the queue and broadcast updates


async def process_queue():
    """Process the queue and broadcast updates to all connected clients"""
    while True:
        try:
            # Check if there are any items in the queue
            if not processing_results_queue.empty():
                # Get the next item from the queue
                item = processing_results_queue.get()

                # Process the item based on its type
                if item.get("type") == "attendance_update":
                    # Broadcast the attendance update
                    await broadcast_attendance_update(item.get("data", []))

                # Mark the task as done
                processing_results_queue.task_done()

            # Sleep for a short time to avoid busy waiting
            await asyncio.sleep(0.1)
        except Exception as e:
            logger.error(f"Error processing queue: {str(e)}")
            # Sleep for a longer time if there was an error
            await asyncio.sleep(1)

# Function to handle future completion


def handle_future_completion(future, client_id):
    try:
        processed_users, attendance_updates, last_recognized_users, no_face_count = future.result()

        # Decrement pending tasks counter
        with client_pending_tasks_lock:
            if client_id in client_pending_tasks:
                client_pending_tasks[client_id] = max(0, client_pending_tasks[client_id] - 1)

        # Put the results in the websocket responses queue
        websocket_responses_queue.put({
            "client_id": client_id,
            "processed_users": processed_users,
            "attendance_updates": attendance_updates,
            "last_recognized_users": last_recognized_users,
            "no_face_count": no_face_count
        })
    except Exception as e:
        logger.error(f"Error handling future completion: {str(e)}")
        # Decrement pending tasks counter even on error
        with client_pending_tasks_lock:
            if client_id in client_pending_tasks:
                client_pending_tasks[client_id] = max(0, client_pending_tasks[client_id] - 1)
        # Put error in the queue
        websocket_responses_queue.put({
            "client_id": client_id,
            "error": str(e)
        })
    finally:
        # Clean up the future from pending_futures
        for key, value in list(pending_futures.items()):
            if value == client_id:
                del pending_futures[key]
                break

# Function to process the websocket responses queue


async def process_websocket_responses():
    """Process the websocket responses queue and send responses to clients"""
    while True:
        try:
            # Check if there are any items in the queue
            if not websocket_responses_queue.empty():
                # Get the next item from the queue
                item = websocket_responses_queue.get()
                client_id = item["client_id"]

                # Check if the client is still connected
                if client_id not in active_connections:
                    logger.info(f"Skipping response to disconnected client {client_id}")
                    websocket_responses_queue.task_done()
                    continue

                websocket = active_connections[client_id]

                # Check if this is an error response
                if "error" in item:
                    try:
                        await websocket.send_json({"status": "processing_error", "message": item["error"]})
                    except Exception as e:
                        logger.error(
                            f"Error sending error response to client {client_id}: {str(e)}")
                        # Remove the client from active connections if it's causing errors
                        if client_id in active_connections:
                            del active_connections[client_id]
                    continue

                # Process the results
                processed_users = item["processed_users"]
                attendance_updates = item["attendance_updates"]

                if not processed_users:
                    if item["no_face_count"] > 0:
                        # No face detected
                        try:
                            await websocket.send_json({"status": "no_face_detected"})
                        except Exception as e:
                            logger.error(
                                f"Error sending no_face_detected response to client {client_id}: {str(e)}")
                            if client_id in active_connections:
                                del active_connections[client_id]
                    else:
                        # No matching users found
                        try:
                            await websocket.send_json({"status": "no_matching_users"})
                        except Exception as e:
                            logger.error(
                                f"Error sending no_matching_users response to client {client_id}: {str(e)}")
                            if client_id in active_connections:
                                del active_connections[client_id]
                else:
                    # Send response with all processed users to the current client
                    try:
                        await websocket.send_json({
                            "multiple_users": True,
                            "users": processed_users
                        })
                    except Exception as e:
                        logger.error(
                            f"Error sending processed_users response to client {client_id}: {str(e)}")
                        if client_id in active_connections:
                            del active_connections[client_id]

                    # Add attendance updates to the queue for broadcasting
                    if attendance_updates:
                        processing_results_queue.put({
                            "type": "attendance_update",
                            "data": attendance_updates
                        })

                # Mark the task as done
                websocket_responses_queue.task_done()

            # Sleep for a short time to avoid busy waiting
            await asyncio.sleep(0.1)
        except Exception as e:
            logger.error(f"Error processing websocket responses: {str(e)}")
            # Sleep for a longer time if there was an error
            await asyncio.sleep(1)

# Start the queue processing task when the application starts


@app.on_event("startup")
async def startup_event():
    """Start the queue processing tasks when the application starts"""
    asyncio.create_task(process_queue())
    asyncio.create_task(process_websocket_responses())
    logger.info("Queue processing tasks started")


async def broadcast_attendance_update(attendance_data):
    """Broadcast attendance updates to all connected clients"""
    if not active_connections:
        logger.info("No active connections to broadcast to")
        return

    # Create a message with the attendance update
    message = {
        "type": "attendance_update",
        "data": attendance_data
    }

    # Log the broadcast
    logger.info(
        f"Broadcasting attendance update to {len(active_connections)} clients: {attendance_data}")

    # Send to all connected clients
    disconnected_clients = []
    for client_id, websocket in active_connections.items():
        try:
            await websocket.send_json(message)
            logger.debug(f"Successfully sent attendance update to client {client_id}")
        except Exception as e:
            logger.error(f"Error broadcasting to client {client_id}: {str(e)}")
            # Mark for removal
            disconnected_clients.append(client_id)

    # Remove any disconnected clients
    for client_id in disconnected_clients:
        if client_id in active_connections:
            del active_connections[client_id]
            logger.info(
                f"Removed disconnected client {client_id}. Remaining connections: {len(active_connections)}")


def get_local_time():
    """Get current time in local timezone"""
    return datetime.now(local_tz)


def get_local_date():
    """Get current date in local timezone"""
    return get_local_time().date()

# Function to process image in a separate process


def process_image_in_process(image_data: str, entry_type: str, client_id: str):
    """
    Process image in a separate process

    Args:
        image_data: Base64 encoded image data
        entry_type: Type of entry (entry or exit)
        client_id: ID of the client making the request

    Returns:
        Tuple of (processed_users, attendance_updates, last_recognized_users, no_face_count)
    """
    # Create a new database session for this process
    db = next(get_db())
    try:
        # Remove data URL prefix if present
        if "," in image_data:
            image_data = image_data.split(",")[1]

        # Decode base64 to bytes
        image_bytes = base64.b64decode(image_data)

        # Convert to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return [], [], {}, 0

        # Get all face embeddings from the image
        face_embeddings = face_recognition.get_embeddings(img)
        if not face_embeddings:
            return [], [], {}, 1

        # Get all users from the cache
        users = get_cached_users(db)

        # Find matches for all detected faces
        matches = face_recognition.find_matches_for_embeddings(
            face_embeddings, users)

        if not matches:
            return [], [], {}, 0

        # Process each matched user
        processed_users = []
        attendance_updates = []
        last_recognized_users = {}

        for match in matches:
            user = match['user']
            similarity = match['similarity']
            bbox = match['bbox']

            # Update last recognized users
            last_recognized_users[user.user_id] = {
                'user': user,
                'similarity': similarity,
                'bbox': bbox
            }

            # Check if attendance already marked for today
            today = get_local_date()
            existing_attendance = db.query(models.Attendance).filter(
                models.Attendance.user_id == user.user_id,
                models.Attendance.timestamp >= today
            ).first()

            if entry_type == "entry":
                if existing_attendance:
                    processed_users.append({
                        "message": "Attendance already marked for today",
                        "user_id": user.user_id,
                        "name": user.name,
                        "timestamp": existing_attendance.timestamp.isoformat(),
                        "similarity": similarity
                    })
                else:
                    # Mark attendance
                    new_attendance = models.Attendance(
                        user_id=user.user_id,
                        confidence=similarity
                    )
                    db.add(new_attendance)
                    db.commit()

                    # Create attendance update for broadcasting
                    attendance_update = {
                        "action": "entry",
                        "user_id": user.user_id,
                        "name": user.name,
                        "timestamp": new_attendance.timestamp.isoformat(),
                        "similarity": similarity
                    }
                    attendance_updates.append(attendance_update)

                    processed_users.append({
                        "message": "Attendance marked successfully",
                        "user_id": user.user_id,
                        "name": user.name,
                        "timestamp": new_attendance.timestamp.isoformat(),
                        "similarity": similarity
                    })
            else:  # exit
                if not existing_attendance:
                    processed_users.append({
                        "message": "No attendance record found for today",
                        "user_id": user.user_id,
                        "name": user.name,
                        "similarity": similarity
                    })
                else:
                    # Delete the attendance record
                    db.delete(existing_attendance)
                    db.commit()

                    # Create attendance update for broadcasting
                    attendance_update = {
                        "action": "exit",
                        "user_id": user.user_id,
                        "name": user.name,
                        "timestamp": get_local_time().isoformat(),
                        "similarity": similarity
                    }
                    attendance_updates.append(attendance_update)

                    processed_users.append({
                        "message": "Attendance exit recorded successfully",
                        "user_id": user.user_id,
                        "name": user.name,
                        "similarity": similarity
                    })

        return processed_users, attendance_updates, last_recognized_users, 0

    except Exception as e:
        logger.error(f"Error processing image in process: {str(e)}")
        return [], [], {}, 0
    finally:
        # Always close the database session
        db.close()


@app.post("/register")
async def register_user(
    user_id: str = Form(...),
    name: str = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Read and decode image
    contents = await image.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # Get face embedding
    embedding = face_recognition.get_embedding(img)
    if embedding is None:
        raise HTTPException(
            status_code=400, detail="No face detected in image")

    # Check if user already exists
    existing_user = db.query(models.User).filter(
        models.User.user_id == user_id).first()
    if existing_user:
        raise HTTPException(
            status_code=400, detail="User ID already registered")

    # Create new user
    new_user = models.User(
        user_id=user_id,
        name=name,
        embedding=face_recognition.embedding_to_str(embedding)
    )
    db.add(new_user)
    db.commit()

    logger.info(f"User registered successfully: {user_id} ({name})")
    return {"message": "User registered successfully"}


async def ping_client(websocket: WebSocket):
    """Send periodic ping messages to keep the connection alive"""
    try:
        while True:
            await asyncio.sleep(PING_INTERVAL)
            try:
                # Send a ping message
                await websocket.send_json({"type": "ping"})
                logger.debug("Sent ping to client")
            except Exception as e:
                logger.error(f"Error sending ping: {str(e)}")
                break
    except asyncio.CancelledError:
        logger.info("Ping task cancelled")
    except Exception as e:
        logger.error(f"Ping task error: {str(e)}")


@app.websocket("/ws/attendance")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    await websocket.accept()
    
    # Generate unique client ID
    client_id = str(uuid.uuid4())
    active_connections[client_id] = websocket
    
    logger.info(
        f"New WebSocket connection {client_id}. Total connections: {len(active_connections)}")

    # Initialize pending tasks counter for this client
    with client_pending_tasks_lock:
        client_pending_tasks[client_id] = 0

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "get_attendance":
                # Get all attendance records
                attendance_records = db.query(models.Attendance).order_by(
                    models.Attendance.timestamp.desc()).all()
                await websocket.send_json({
                    "type": "attendance_data",
                    "data": [{
                        "id": record.id,
                        "user_id": record.user_id,
                        "timestamp": record.timestamp.isoformat(),
                        "confidence": record.confidence
                    } for record in attendance_records]
                })

            elif data.get("type") == "get_users":
                # Get all users from cache
                users = get_cached_users(db)
                await websocket.send_json({
                    "type": "user_data",
                    "data": [{
                        "user_id": user.user_id,
                        "name": user.name,
                        "created_at": user.created_at.isoformat()
                    } for user in users]
                })

            elif data.get("type") == "delete_attendance":
                # Delete attendance record
                attendance_id = data.get("attendance_id")
                if attendance_id:
                    attendance = db.query(models.Attendance).filter(
                        models.Attendance.id == attendance_id).first()
                    if attendance:
                        db.delete(attendance)
                        db.commit()
                        await broadcast_attendance_update([{
                            "action": "delete",
                            "user_id": attendance.user_id,
                            "name": attendance.user.name,
                            "timestamp": get_local_time().isoformat()
                        }])

            elif data.get("type") == "delete_user":
                # Delete user
                user_id = data.get("user_id")
                if user_id:
                    user = db.query(models.User).filter(
                        models.User.user_id == user_id).first()
                    if user:
                        db.delete(user)
                        db.commit()
                        await broadcast_attendance_update([{
                            "action": "delete_user",
                            "user_id": user_id,
                            "name": user.name,
                            "timestamp": get_local_time().isoformat()
                        }])

            elif data.get("type") == "register_user":
                # Register new user
                user_id = data.get("user_id")
                name = data.get("name")
                image_data = data.get("image")

                if not all([user_id, name, image_data]):
                    await websocket.send_json({
                        "status": "error",
                        "message": "Missing required fields (user_id, name, or image)"
                    })
                    continue

                # Check if user already exists
                existing_user = db.query(models.User).filter(
                    models.User.user_id == user_id).first()
                if existing_user:
                    await websocket.send_json({
                        "status": "error",
                        "message": "User ID already registered"
                    })
                    continue

                try:
                    # Process the image
                    # Remove data URL prefix if present
                    if "," in image_data:
                        image_data = image_data.split(",")[1]

                    # Decode base64 to bytes
                    image_bytes = base64.b64decode(image_data)
                    nparr = np.frombuffer(image_bytes, np.uint8)
                    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                    if img is None:
                        await websocket.send_json({
                            "status": "error",
                            "message": "Invalid image data"
                        })
                        continue

                    # Get face embedding
                    embedding = face_recognition.get_embedding(img)
                    if embedding is None:
                        await websocket.send_json({
                            "status": "error",
                            "message": "No face detected in image"
                        })
                        continue

                    # Create new user with embedding
                    new_user = models.User(
                        user_id=user_id,
                        name=name,
                        embedding=face_recognition.embedding_to_str(embedding)
                    )
                    db.add(new_user)
                    db.commit()

                    # Save the registration image
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                    filename = f"register_{user_id}_{timestamp}.jpg"
                    filepath = os.path.join(IMAGES_DIR, filename)
                    # cv2.imwrite(filepath, img)
                    logger.info(f"Saved registration image to {filepath}")

                    # Broadcast user registration
                    await broadcast_attendance_update([{
                        "action": "register_user",
                        "user_id": user_id,
                        "name": name,
                        "timestamp": get_local_time().isoformat()
                    }])

                    await websocket.send_json({
                        "status": "success",
                        "message": "User registered successfully"
                    })

                except Exception as e:
                    logger.error(f"Error registering user: {str(e)}")
                    await websocket.send_json({
                        "status": "error",
                        "message": f"Error registering user: {str(e)}"
                    })

            elif "image" in data:
                # Check if client has too many pending tasks
                with client_pending_tasks_lock:
                    if client_pending_tasks.get(client_id, 0) >= MAX_CONCURRENT_TASKS_PER_CLIENT:
                        await websocket.send_json({
                            "status": "error",
                            "message": "Too many pending tasks. Please wait."
                        })
                        continue
                    client_pending_tasks[client_id] += 1

                # Process image for face recognition
                entry_type = data.get("entry_type", "entry")

                # Submit image processing to process pool
                future = process_pool.submit(
                    process_image_in_process,
                    data["image"],
                    entry_type,
                    client_id
                )

                # Store the future with client_id
                pending_futures[future] = client_id

                # Add callback for when the future completes
                future.add_done_callback(
                    lambda f: handle_future_completion(f, client_id))

            elif data.get("type") == "ping":
                # Respond to ping
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        if client_id in active_connections:
            del active_connections[client_id]
        logger.info(
            f"WebSocket connection {client_id} closed. Total connections: {len(active_connections)}")
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {str(e)}")
        try:
            await websocket.send_json({
                "status": "error",
                "message": str(e)
            })
        except:
            pass
    finally:
        try:
            if client_id in active_connections:
                del active_connections[client_id]
            with client_pending_tasks_lock:
                if client_id in client_pending_tasks:
                    del client_pending_tasks[client_id]
        except KeyError:
            pass
        logger.info(
            f"WebSocket connection {client_id} closed. Total connections: {len(active_connections)}")

def client_process_handler(websocket: WebSocket, db: Session):
    """
    Handler for client process
    """
    try:
        # Initialize process-local variables
        last_recognized_users = {}
        no_face_count = 0

        # Process messages from the queue
        while True:
            try:
                # Get message from queue
                message = websocket_responses_queue.get(timeout=1)
                if message.get("client_id") == websocket:
                    # Process message
                    if "error" in message:
                        logger.error(f"Error in client process: {message['error']}")
                    else:
                        # Update process-local variables
                        last_recognized_users = message.get("last_recognized_users", {})
                        no_face_count = message.get("no_face_count", 0)
            except Exception as e:
                logger.error(f"Error in client process handler: {str(e)}")
                break
    except Exception as e:
        logger.error(f"Client process error: {str(e)}")
    finally:
        # Clean up
        if websocket in active_connections:
            active_connections.remove(websocket)
        with client_pending_tasks_lock:
            if websocket in client_pending_tasks:
                del client_pending_tasks[websocket]

# # Function to save a frame to the images folder
# def save_frame(image_data, prefix="frame"):
#     """Save a frame to the images folder with a timestamp"""
#     return
#     try:
#         # Remove data URL prefix if present
#         if "," in image_data:
#             image_data = image_data.split(",")[1]

#         # Decode base64 to bytes
#         image_bytes = base64.b64decode(image_data)

#         # Convert to numpy array
#         nparr = np.frombuffer(image_bytes, np.uint8)
#         img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

#         if img is None:
#             logger.error("Failed to decode image data")
#             return False

#         # Generate filename with timestamp
#         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
#         filename = f"{prefix}_{timestamp}.jpg"
#         filepath = os.path.join(IMAGES_DIR, filename)

#         # Save the image
#         # success = cv2.imwrite(filepath, img)
#         success = False
#         if success:
#             logger.info(f"Saved frame to {filepath}")
#             return True
#         else:
#             logger.error(f"Failed to save frame to {filepath}")
#             return False
#     except Exception as e:
#         logger.error(f"Error saving frame: {str(e)}")
#         return False


@app.get("/users")
def get_users(db: Session = Depends(get_db)):
    """Get all registered users"""
    users = db.query(models.User).all()
    return [
        {
            "user_id": user.user_id,
            "name": user.name,
            "created_at": user.created_at.isoformat() if user.created_at else None
        }
        for user in users
    ]


@app.get("/attendance")
def get_attendance(db: Session = Depends(get_db)):
    """Get all attendance records"""
    attendances = db.query(models.Attendance).order_by(
        models.Attendance.timestamp.desc()).all()
    return [
        {
            "id": att.id,
            "user_id": att.user_id,
            "timestamp": att.timestamp.isoformat(),
            "confidence": att.confidence
        }
        for att in attendances
    ]


@app.delete("/attendance/{attendance_id}")
def delete_attendance(attendance_id: int, db: Session = Depends(get_db)):
    """Delete an attendance record"""
    # Find the attendance record
    attendance = db.query(models.Attendance).filter(
        models.Attendance.id == attendance_id).first()
    if not attendance:
        raise HTTPException(
            status_code=404, detail="Attendance record not found")

    # Store user info before deletion for broadcasting
    user_id = attendance.user_id
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    user_name = user.name if user else "Unknown"

    # Delete the attendance record
    db.delete(attendance)
    db.commit()

    # Create attendance update for broadcasting
    attendance_update = {
        "action": "delete",
        "user_id": user_id,
        "name": user_name,
        "attendance_id": attendance_id,
        "timestamp": get_local_time().isoformat()
    }

    # Add the update to the processing results queue
    processing_results_queue.put({
        "type": "attendance_update",
        "data": [attendance_update]
    })

    logger.info(f"Attendance record deleted successfully: ID {attendance_id}")
    return {"message": "Attendance record deleted successfully"}


@app.delete("/users/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db)):
    """Delete a user"""
    # Find the user
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Delete the user
    db.delete(user)
    db.commit()

    logger.info(f"User deleted successfully: {user_id}")
    return {"message": "User deleted successfully"}


@app.post("/attendance")
async def mark_attendance(
    image: UploadFile = File(...),
    entry_type: str = Form("entry"),  # Default to entry if not specified
    db: Session = Depends(get_db)
):
    """Mark attendance for a user based on face recognition"""
    # Read and decode image
    contents = await image.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # Save the frame
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    filename = f"rest_api_{entry_type}_{timestamp}.jpg"
    filepath = os.path.join(IMAGES_DIR, filename)
    # cv2.imwrite(filepath, img)
    logger.info(f"Saved REST API frame to {filepath}")

    # Get all face embeddings from the image
    face_embeddings = face_recognition.get_embeddings(img)
    if not face_embeddings:
        raise HTTPException(
            status_code=400, detail="No face detected in image")

    # Get all users from the database
    users = db.query(models.User).all()

    # Find matches for all detected faces
    matches = face_recognition.find_matches_for_embeddings(
        face_embeddings, users)

    if not matches:
        raise HTTPException(
            status_code=400,
            detail="No matching users found in the image"
        )

    # Process each matched user
    processed_users = []
    attendance_updates = []  # Track attendance updates to broadcast

    for match in matches:
        user = match['user']
        similarity = match['similarity']

        # Check if attendance already marked for today
        today = get_local_date()
        existing_attendance = db.query(models.Attendance).filter(
            models.Attendance.user_id == user.user_id,
            models.Attendance.timestamp >= today
        ).first()

        if entry_type == "entry":
            if existing_attendance:
                processed_users.append({
                    "message": "Attendance already marked for today",
                    "user_id": user.user_id,
                    "name": user.name,
                    "timestamp": existing_attendance.timestamp.isoformat(),
                    "similarity": similarity
                })
            else:
                # Mark attendance
                new_attendance = models.Attendance(
                    user_id=user.user_id,
                    confidence=similarity  # Use similarity directly as confidence
                )
                db.add(new_attendance)
                db.commit()

                # Create attendance update for broadcasting
                attendance_update = {
                    "action": "entry",
                    "user_id": user.user_id,
                    "name": user.name,
                    "timestamp": new_attendance.timestamp.isoformat(),
                    "similarity": similarity
                }
                attendance_updates.append(attendance_update)

                processed_users.append({
                    "message": "Attendance marked successfully",
                    "user_id": user.user_id,
                    "name": user.name,
                    "timestamp": new_attendance.timestamp.isoformat(),
                    "similarity": similarity
                })
        else:  # exit
            if not existing_attendance:
                processed_users.append({
                    "message": "No attendance record found for today",
                    "user_id": user.user_id,
                    "name": user.name,
                    "similarity": similarity
                })
            else:
                # Delete the attendance record
                db.delete(existing_attendance)
                db.commit()

                # Create attendance update for broadcasting
                attendance_update = {
                    "action": "exit",
                    "user_id": user.user_id,
                    "name": user.name,
                    "timestamp": get_local_time().isoformat(),
                    "similarity": similarity
                }
                attendance_updates.append(attendance_update)

                processed_users.append({
                    "message": "Attendance exit recorded successfully",
                    "user_id": user.user_id,
                    "name": user.name,
                    "similarity": similarity
                })

    # Broadcast attendance updates to all connected clients
    if attendance_updates:
        logger.info(
            f"Broadcasting {len(attendance_updates)} attendance updates from REST API")
        await broadcast_attendance_update(attendance_updates)

    # Return response with all processed users
    return {
        "multiple_users": True,
        "users": processed_users
    }


@app.post("/debug/face-recognition")
async def debug_face_recognition(
    image: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Debug endpoint for face recognition"""
    # Read and decode image
    contents = await image.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # Save the frame
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    filename = f"debug_{timestamp}.jpg"
    filepath = os.path.join(IMAGES_DIR, filename)
    # cv2.imwrite(filepath, img)
    logger.info(f"Saved debug frame to {filepath}")

    # Get all face embeddings from the image
    face_embeddings = face_recognition.get_embeddings(img)
    if not face_embeddings:
        raise HTTPException(
            status_code=400, detail="No face detected in image")

    # Get all users from the database
    users = db.query(models.User).all()

    # Find matches for all detected faces
    matches = face_recognition.find_matches_for_embeddings(
        face_embeddings, users)

    if not matches:
        raise HTTPException(
            status_code=400,
            detail="No matching users found in the image"
        )

    # Process each matched user
    processed_users = []
    for match in matches:
        user = match['user']
        similarity = match['similarity']

        processed_users.append({
            "message": "Face recognized",
            "user_id": user.user_id,
            "name": user.name,
            "similarity": similarity
        })

    # Return response with all processed users
    return {
        "multiple_users": True,
        "users": processed_users
    }
