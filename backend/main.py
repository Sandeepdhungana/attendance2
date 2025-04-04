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
import concurrent.futures
import threading
from queue import Queue
import time
import os

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
active_connections = set()

# Create a thread pool for image processing
thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)

# Queue for processing results
processing_results_queue = Queue()

# Queue for WebSocket responses
websocket_responses_queue = Queue()

# Dictionary to store pending futures
pending_futures = {}

# WebSocket ping interval in seconds (30 seconds)
PING_INTERVAL = 30

# WebSocket ping timeout in seconds (60 seconds)
PING_TIMEOUT = 60

# Maximum number of frames to process per second
MAX_FRAMES_PER_SECOND = 1

# Get local timezone
try:
    local_tz = pytz.timezone('Asia/Kolkata')  # Default to IST, can be changed based on your location
except:
    # Fallback if pytz is not available
    local_tz = timezone(timedelta(hours=5, minutes=30))  # IST offset as fallback

# Create images directory if it doesn't exist
IMAGES_DIR = "images"
if not os.path.exists(IMAGES_DIR):
    os.makedirs(IMAGES_DIR)
    logger.info(f"Created images directory: {IMAGES_DIR}")

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
def handle_future_completion(future, websocket):
    try:
        processed_users, attendance_updates, last_recognized_users, no_face_count = future.result()
        
        # Put the results in the websocket responses queue
        websocket_responses_queue.put({
            "websocket": websocket,
            "processed_users": processed_users,
            "attendance_updates": attendance_updates,
            "last_recognized_users": last_recognized_users,
            "no_face_count": no_face_count
        })
    except Exception as e:
        logger.error(f"Error handling future completion: {str(e)}")
        # Put error in the queue
        websocket_responses_queue.put({
            "websocket": websocket,
            "error": str(e)
        })
    finally:
        # Clean up the future from pending_futures
        for key, value in list(pending_futures.items()):
            if value == future:
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
                websocket = item["websocket"]
                
                # Check if the websocket is still in active_connections
                if websocket not in active_connections:
                    logger.info("Skipping response to disconnected WebSocket")
                    websocket_responses_queue.task_done()
                    continue
                
                # Check if this is an error response
                if "error" in item:
                    try:
                        await websocket.send_json({"status": "processing_error", "message": item["error"]})
                    except Exception as e:
                        logger.error(f"Error sending error response to WebSocket: {str(e)}")
                        # Remove the websocket from active connections if it's causing errors
                        if websocket in active_connections:
                            active_connections.remove(websocket)
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
                            logger.error(f"Error sending no_face_detected response: {str(e)}")
                            if websocket in active_connections:
                                active_connections.remove(websocket)
                    else:
                        # No matching users found
                        try:
                            await websocket.send_json({"status": "no_matching_users"})
                        except Exception as e:
                            logger.error(f"Error sending no_matching_users response: {str(e)}")
                            if websocket in active_connections:
                                active_connections.remove(websocket)
                else:
                    # Send response with all processed users to the current client
                    try:
                        await websocket.send_json({
                            "multiple_users": True,
                            "users": processed_users
                        })
                    except Exception as e:
                        logger.error(f"Error sending processed_users response: {str(e)}")
                        if websocket in active_connections:
                            active_connections.remove(websocket)
                    
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
    logger.info(f"Broadcasting attendance update to {len(active_connections)} clients: {attendance_data}")
    
    # Send to all connected clients
    disconnected_clients = []
    for connection in active_connections:
        try:
            await connection.send_json(message)
            logger.debug(f"Successfully sent attendance update to client")
        except Exception as e:
            logger.error(f"Error broadcasting to client: {str(e)}")
            # Mark for removal
            disconnected_clients.append(connection)
    
    # Remove any disconnected clients
    for client in disconnected_clients:
        if client in active_connections:
            active_connections.remove(client)
            logger.info(f"Removed disconnected client. Remaining connections: {len(active_connections)}")

def get_local_time():
    """Get current time in local timezone"""
    return datetime.now(local_tz)

def get_local_date():
    """Get current date in local timezone"""
    return get_local_time().date()

# Function to process image in a separate thread
def process_image_in_thread(image_data: str, entry_type: str, db_session: Session, 
                           last_recognized_users: Dict[str, Any], no_face_count: int):
    """
    Process image in a separate thread
    
    Args:
        image_data: Base64 encoded image data
        entry_type: Type of entry (entry or exit)
        db_session: Database session (will be closed and replaced with a new one)
        last_recognized_users: Dictionary tracking recognized users
        no_face_count: Counter for frames with no face
        
    Returns:
        Tuple of (processed_users, attendance_updates, last_recognized_users, no_face_count)
    """
    # Create a new database session for this thread
    thread_db = next(get_db())
    
    try:
        # Close the passed session to avoid connection pool exhaustion
        db_session.close()
        
        # Remove data URL prefix if present
        if "," in image_data:
            image_data = image_data.split(",")[1]
        
        # Decode base64 to bytes
        image_bytes = base64.b64decode(image_data)
        
        # Convert to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return [], [], last_recognized_users, no_face_count
        
        # Get all face embeddings from the image
        face_embeddings = face_recognition.get_embeddings(img)
        if not face_embeddings:
            # No face detected, increment counter
            no_face_count += 1
            
            # If we've had multiple consecutive frames with no face, and we previously recognized users,
            # we can assume they've left the frame
            if no_face_count >= 3 and last_recognized_users:
                logger.info(f"Users {list(last_recognized_users.keys())} appear to have left the frame")
                last_recognized_users = {}
                no_face_count = 0
                
            return [], [], last_recognized_users, no_face_count
        
        # Reset no face counter when faces are detected
        no_face_count = 0
        
        # Get all users from the database
        users = thread_db.query(models.User).all()
        
        # Find matches for all detected faces
        matches = face_recognition.find_matches_for_embeddings(face_embeddings, users)
        
        if not matches:
            return [], [], last_recognized_users, no_face_count
        
        # Process each matched user
        processed_users = []
        attendance_updates = []  # Track attendance updates to broadcast
        
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
            existing_attendance = thread_db.query(models.Attendance).filter(
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
                    thread_db.add(new_attendance)
                    thread_db.commit()
                    
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
                    thread_db.delete(existing_attendance)
                    thread_db.commit()
                    
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
        
        return processed_users, attendance_updates, last_recognized_users, no_face_count
    
    except Exception as e:
        logger.error(f"Error processing image in thread: {str(e)}")
        return [], [], last_recognized_users, no_face_count
    finally:
        # Always close the thread's database session
        thread_db.close()

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
        raise HTTPException(status_code=400, detail="No face detected in image")
    
    # Check if user already exists
    existing_user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User ID already registered")
    
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
    active_connections.add(websocket)
    logger.info(f"New WebSocket connection. Total connections: {len(active_connections)}")
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "get_attendance":
                # Get all attendance records
                attendance_records = db.query(models.Attendance).order_by(models.Attendance.timestamp.desc()).all()
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
                # Get all users
                users = db.query(models.User).all()
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
                    attendance = db.query(models.Attendance).filter(models.Attendance.id == attendance_id).first()
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
                    user = db.query(models.User).filter(models.User.user_id == user_id).first()
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
                existing_user = db.query(models.User).filter(models.User.user_id == user_id).first()
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
                    cv2.imwrite(filepath, img)
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
                # Process image for face recognition
                entry_type = data.get("entry_type", "entry")
                
                # Decode base64 image
                image_data = data["image"].split(",")[1]
                image_bytes = base64.b64decode(image_data)
                nparr = np.frombuffer(image_bytes, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                # Save the frame
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                filename = f"websocket_{entry_type}_{timestamp}.jpg"
                filepath = os.path.join(IMAGES_DIR, filename)
                cv2.imwrite(filepath, img)
                logger.info(f"Saved WebSocket frame to {filepath}")
                
                # Get all face embeddings from the image
                face_embeddings = face_recognition.get_embeddings(img)
                if not face_embeddings:
                    await websocket.send_json({
                        "status": "no_face_detected",
                        "message": "No face detected in image"
                    })
                    continue
                
                # Get all users from the database
                users = db.query(models.User).all()
                
                # Find matches for all detected faces
                matches = face_recognition.find_matches_for_embeddings(face_embeddings, users)
                
                if not matches:
                    await websocket.send_json({
                        "status": "no_matching_users",
                        "message": "No matching users found in the image"
                    })
                    continue
                
                # Process each matched user
                processed_users = []
                attendance_updates = []
                
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
                                confidence=similarity
                            )
                            db.add(new_attendance)
                            db.commit()
                            
                            # Create attendance update
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
                            
                            # Create attendance update
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
                
                # Broadcast attendance updates
                if attendance_updates:
                    logger.info(f"Broadcasting {len(attendance_updates)} attendance updates from WebSocket")
                    await broadcast_attendance_update(attendance_updates)
                
                # Send response to client
                await websocket.send_json({
                    "multiple_users": True,
                    "users": processed_users
                })
            
            elif data.get("type") == "ping":
                # Respond to ping
                await websocket.send_json({"type": "pong"})
    
    except WebSocketDisconnect:
        active_connections.remove(websocket)
        logger.info(f"WebSocket connection closed. Total connections: {len(active_connections)}")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        try:
            await websocket.send_json({
                "status": "error",
                "message": str(e)
            })
        except:
            pass
    finally:
        try:
            active_connections.remove(websocket)
        except KeyError:
            pass
        logger.info(f"WebSocket connection closed. Total connections: {len(active_connections)}")

# Function to save a frame to the images folder
def save_frame(image_data, prefix="frame"):
    """Save a frame to the images folder with a timestamp"""
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
            logger.error("Failed to decode image data")
            return False
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = f"{prefix}_{timestamp}.jpg"
        filepath = os.path.join(IMAGES_DIR, filename)
        
        # Save the image
        success = cv2.imwrite(filepath, img)
        if success:
            logger.info(f"Saved frame to {filepath}")
            return True
        else:
            logger.error(f"Failed to save frame to {filepath}")
            return False
    except Exception as e:
        logger.error(f"Error saving frame: {str(e)}")
        return False

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
    attendances = db.query(models.Attendance).order_by(models.Attendance.timestamp.desc()).all()
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
    attendance = db.query(models.Attendance).filter(models.Attendance.id == attendance_id).first()
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    
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
    cv2.imwrite(filepath, img)
    logger.info(f"Saved REST API frame to {filepath}")
    
    # Get all face embeddings from the image
    face_embeddings = face_recognition.get_embeddings(img)
    if not face_embeddings:
        raise HTTPException(status_code=400, detail="No face detected in image")
    
    # Get all users from the database
    users = db.query(models.User).all()
    
    # Find matches for all detected faces
    matches = face_recognition.find_matches_for_embeddings(face_embeddings, users)
    
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
        logger.info(f"Broadcasting {len(attendance_updates)} attendance updates from REST API")
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
    cv2.imwrite(filepath, img)
    logger.info(f"Saved debug frame to {filepath}")
    
    # Get all face embeddings from the image
    face_embeddings = face_recognition.get_embeddings(img)
    if not face_embeddings:
        raise HTTPException(status_code=400, detail="No face detected in image")
    
    # Get all users from the database
    users = db.query(models.User).all()
    
    # Find matches for all detected faces
    matches = face_recognition.find_matches_for_embeddings(face_embeddings, users)
    
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