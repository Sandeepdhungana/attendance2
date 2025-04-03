from fastapi import FastAPI, File, UploadFile, Depends, HTTPException, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, date, timezone, timedelta
import cv2
import numpy as np
from typing import List
import base64
import json
import asyncio
import logging
import pytz

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

# Get local timezone
try:
    local_tz = pytz.timezone('Asia/Kolkata')  # Default to IST, can be changed based on your location
except:
    # Fallback if pytz is not available
    local_tz = timezone(timedelta(hours=5, minutes=30))  # IST offset as fallback

def get_local_time():
    """Get current time in local timezone"""
    return datetime.now(local_tz)

def get_local_date():
    """Get current date in local timezone"""
    return get_local_time().date()

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

@app.websocket("/ws/attendance")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    logger.info(f"New WebSocket connection. Total connections: {len(active_connections)}")
    
    try:
        # Get database session
        db = next(get_db())
        
        # Track the last recognized users to detect when they leave the frame
        last_recognized_users = {}  # Dictionary to track users by their user_id
        no_face_count = 0
        
        while True:
            # Receive image data from client
            data = await websocket.receive_text()
            
            try:
                # Parse the JSON data
                json_data = json.loads(data)
                image_data = json_data.get("image")
                entry_type = json_data.get("entry_type", "entry")  # Default to entry if not specified
                
                if not image_data:
                    await websocket.send_json({"error": "No image data received"})
                    continue
                
                # Decode base64 image
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
                        await websocket.send_json({"error": "Failed to decode image"})
                        continue
                    
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
                            
                        continue
                    
                    # Reset no face counter when faces are detected
                    no_face_count = 0
                    
                    # Get all users from the database
                    users = db.query(models.User).all()
                    
                    # Find matches for all detected faces
                    matches = face_recognition.find_matches_for_embeddings(face_embeddings, users)
                    
                    if not matches:
                        await websocket.send_json({"error": "No matching users found in the frame"})
                        continue
                    
                    # Process each matched user
                    processed_users = []
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
                                    confidence=similarity  # Use similarity directly as confidence
                                )
                                db.add(new_attendance)
                                db.commit()
                                
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
                                
                                processed_users.append({
                                    "message": "Attendance exit recorded successfully",
                                    "user_id": user.user_id,
                                    "name": user.name,
                                    "similarity": similarity
                                })
                    
                    # Send response with all processed users
                    await websocket.send_json({
                        "multiple_users": True,
                        "users": processed_users
                    })
                
                except Exception as e:
                    logger.error(f"Error processing image: {str(e)}")
                    await websocket.send_json({"error": f"Error processing image: {str(e)}"})
            
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON data received"})
            except Exception as e:
                logger.error(f"WebSocket error: {str(e)}")
                await websocket.send_json({"error": f"Server error: {str(e)}"})
    
    except WebSocketDisconnect:
        active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Remaining connections: {len(active_connections)}")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        if websocket in active_connections:
            active_connections.remove(websocket)
    finally:
        # Close the database session
        db.close()

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
                
                processed_users.append({
                    "message": "Attendance exit recorded successfully",
                    "user_id": user.user_id,
                    "name": user.name,
                    "similarity": similarity
                })
    
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
    
    # Delete the attendance record
    db.delete(attendance)
    db.commit()
    
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