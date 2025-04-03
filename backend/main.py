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
active_connections: List[WebSocket] = []

# Create a thread pool for image processing
thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)

# Queue for processing results
processing_results_queue = Queue()

# WebSocket ping interval in seconds (30 seconds)
PING_INTERVAL = 30

# WebSocket ping timeout in seconds (60 seconds)
PING_TIMEOUT = 60

# Get local timezone
try:
    local_tz = pytz.timezone('Asia/Kolkata')  # Default to IST, can be changed based on your location
except:
    # Fallback if pytz is not available
    local_tz = timezone(timedelta(hours=5, minutes=30))  # IST offset as fallback

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

# Start the queue processing task when the application starts
@app.on_event("startup")
async def startup_event():
    """Start the queue processing task when the application starts"""
    asyncio.create_task(process_queue())
    logger.info("Queue processing task started")

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
        db_session: Database session
        last_recognized_users: Dictionary tracking recognized users
        no_face_count: Counter for frames with no face
        
    Returns:
        Tuple of (processed_users, attendance_updates, last_recognized_users, no_face_count)
    """
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
        users = db_session.query(models.User).all()
        
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
            existing_attendance = db_session.query(models.Attendance).filter(
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
                    db_session.add(new_attendance)
                    db_session.commit()
                    
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
                    db_session.delete(existing_attendance)
                    db_session.commit()
                    
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
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    logger.info(f"New WebSocket connection. Total connections: {len(active_connections)}")
    
    # Start ping task
    ping_task = asyncio.create_task(ping_client(websocket))
    
    try:
        # Get database session
        db = next(get_db())
        
        # Track the last recognized users to detect when they leave the frame
        last_recognized_users = {}  # Dictionary to track users by their user_id
        no_face_count = 0
        
        while True:
            try:
                # Receive image data from client with a timeout
                data = await asyncio.wait_for(websocket.receive_text(), timeout=PING_TIMEOUT)
                
                try:
                    # Parse the JSON data
                    json_data = json.loads(data)
                    
                    # Check if this is a pong response
                    if json_data.get("type") == "pong":
                        logger.debug("Received pong from client")
                        continue
                    
                    image_data = json_data.get("image")
                    entry_type = json_data.get("entry_type", "entry")  # Default to entry if not specified
                    
                    if not image_data:
                        # Send acknowledgment but don't disconnect
                        await websocket.send_json({"status": "no_image_data"})
                        continue
                    
                    # Submit image processing to thread pool
                    future = thread_pool.submit(
                        process_image_in_thread, 
                        image_data, 
                        entry_type, 
                        db, 
                        last_recognized_users, 
                        no_face_count
                    )
                    
                    # Wait for the result
                    processed_users, attendance_updates, last_recognized_users, no_face_count = future.result()
                    
                    # Handle the results
                    if not processed_users:
                        if no_face_count > 0:
                            # No face detected, send acknowledgment but don't disconnect
                            await websocket.send_json({"status": "no_face_detected"})
                            continue
                        else:
                            # No matching users found, send acknowledgment but don't disconnect
                            await websocket.send_json({"status": "no_matching_users"})
                            continue
                    
                    # Send response with all processed users to the current client
                    await websocket.send_json({
                        "multiple_users": True,
                        "users": processed_users
                    })
                    
                    # Broadcast attendance updates to all connected clients
                    if attendance_updates:
                        logger.info(f"Broadcasting {len(attendance_updates)} attendance updates")
                        await broadcast_attendance_update(attendance_updates)
                
                except json.JSONDecodeError:
                    # Invalid JSON, send acknowledgment but don't disconnect
                    await websocket.send_json({"status": "invalid_json"})
                    logger.warning("Invalid JSON data received")
                except Exception as e:
                    # Any other error, send acknowledgment but don't disconnect
                    logger.error(f"Error processing data: {str(e)}")
                    await websocket.send_json({"status": "processing_error", "message": str(e)})
            
            except asyncio.TimeoutError:
                # Timeout occurred, send a ping to check if the client is still alive
                logger.warning("Timeout waiting for client data, sending ping")
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception as e:
                    logger.error(f"Error sending ping after timeout: {str(e)}")
                    break
            except WebSocketDisconnect:
                # Client disconnected, break the loop
                logger.info("Client disconnected")
                break
            except Exception as e:
                # Any other error, log it but don't disconnect
                logger.error(f"WebSocket error: {str(e)}")
                # Try to send an error message to the client
                try:
                    await websocket.send_json({"status": "connection_error", "message": str(e)})
                except:
                    # If sending fails, the client might have disconnected
                    break
    
    except Exception as e:
        logger.error(f"WebSocket connection error: {str(e)}")
    finally:
        # Cancel the ping task
        ping_task.cancel()
        try:
            await ping_task
        except asyncio.CancelledError:
            pass
        
        # Clean up
        if websocket in active_connections:
            active_connections.remove(websocket)
            logger.info(f"WebSocket disconnected. Remaining connections: {len(active_connections)}")
        # Close the database session
        try:
            db.close()
        except:
            pass

@app.post("/attendance")
async def mark_attendance(
    image: UploadFile = File(...),
    entry_type: str = Form("entry"),  # Default to entry if not specified
    db: Session = Depends(get_db)
):
    # Read and decode image
    contents = await image.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
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

@app.get("/attendance")
def get_attendance(db: Session = Depends(get_db)):
    attendances = db.query(models.Attendance).order_by(models.Attendance.timestamp.desc()).all()
    return [
        {
            "id": att.id,
            "user_id": att.user_id,
            "timestamp": att.timestamp,
            "confidence": att.confidence
        }
        for att in attendances
    ]

@app.delete("/attendance/{attendance_id}")
def delete_attendance(attendance_id: int, db: Session = Depends(get_db)):
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
    
    # Add the update to the processing results queue instead of directly creating a task
    processing_results_queue.put({
        "type": "attendance_update",
        "data": [attendance_update]
    })
    
    logger.info(f"Attendance record deleted successfully: ID {attendance_id}")
    return {"message": "Attendance record deleted successfully"}

@app.get("/users")
def get_users(db: Session = Depends(get_db)):
    users = db.query(models.User).all()
    return [
        {
            "user_id": user.user_id,
            "name": user.name,
            "created_at": user.created_at
        }
        for user in users
    ]

@app.delete("/users/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db)):
    # Find the user
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete the user
    db.delete(user)
    db.commit()
    
    logger.info(f"User deleted successfully: {user_id}")
    return {"message": "User deleted successfully"}

@app.post("/debug/face-recognition")
async def debug_face_recognition(
    image: UploadFile = File(...),
    threshold: float = Form(0.6),
    db: Session = Depends(get_db)
):
    """Debug endpoint to test face recognition with a specific threshold"""
    # Read and decode image
    contents = await image.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # Get face embedding
    query_embedding = face_recognition.get_embedding(img)
    if query_embedding is None:
        raise HTTPException(status_code=400, detail="No face detected in image")
    
    # Get all users and their embeddings
    users = db.query(models.User).all()
    stored_embeddings = [(user, face_recognition.str_to_embedding(user.embedding)) 
                        for user in users]
    
    # Find best match
    best_match = None
    best_similarity = 0.0
    all_similarities = []
    
    for user, embedding in stored_embeddings:
        similarity = face_recognition.compare_faces(query_embedding, embedding)
        all_similarities.append({
            "user_id": user.user_id,
            "name": user.name,
            "similarity": similarity
        })
        if similarity > best_similarity:
            best_similarity = similarity
            best_match = user
    
    # Sort similarities for display (highest first)
    all_similarities.sort(key=lambda x: x["similarity"], reverse=True)
    
    return {
        "threshold": threshold,
        "best_match": {
            "user_id": best_match.user_id if best_match else None,
            "name": best_match.name if best_match else None,
            "similarity": best_similarity
        },
        "all_similarities": all_similarities,
        "match_found": best_match is not None and best_similarity >= threshold
    } 