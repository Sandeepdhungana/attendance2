from fastapi import FastAPI, File, UploadFile, Depends, HTTPException, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, date
import cv2
import numpy as np
from typing import List
import base64
import json
import asyncio
import logging

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
        
        while True:
            # Receive image data from client
            data = await websocket.receive_text()
            
            try:
                # Parse the JSON data
                json_data = json.loads(data)
                image_data = json_data.get("image")
                
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
                    
                    # Get face embedding
                    query_embedding = face_recognition.get_embedding(img)
                    if query_embedding is None:
                        await websocket.send_json({"error": "No face detected in image"})
                        continue
                    
                    # Get all users and their embeddings
                    users = db.query(models.User).all()
                    stored_embeddings = [(user, face_recognition.str_to_embedding(user.embedding)) 
                                        for user in users]
                    
                    # Find best match
                    best_match = None
                    best_similarity = 0.0
                    for user, embedding in stored_embeddings:
                        similarity = face_recognition.compare_faces(query_embedding, embedding)
                        if similarity > best_similarity:
                            best_similarity = similarity
                            best_match = user
                    
                    # For cosine similarity, higher is better (more similar)
                    if best_match is None or best_similarity < face_recognition.threshold:
                        await websocket.send_json({"error": f"No matching user found (similarity: {best_similarity}, threshold: {face_recognition.threshold})"})
                        continue
                    
                    # Check if attendance already marked for today
                    today = date.today()
                    existing_attendance = db.query(models.Attendance).filter(
                        models.Attendance.user_id == best_match.user_id,
                        models.Attendance.timestamp >= today
                    ).first()
                    
                    if existing_attendance:
                        await websocket.send_json({
                            "message": "Attendance already marked for today",
                            "user_id": best_match.user_id,
                            "name": best_match.name
                        })
                    else:
                        # Mark attendance
                        new_attendance = models.Attendance(
                            user_id=best_match.user_id,
                            confidence=best_similarity  # Use similarity directly as confidence
                        )
                        db.add(new_attendance)
                        db.commit()
                        
                        await websocket.send_json({
                            "message": "Attendance marked successfully",
                            "user_id": best_match.user_id,
                            "name": best_match.name
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
    db: Session = Depends(get_db)
):
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
    for user, embedding in stored_embeddings:
        similarity = face_recognition.compare_faces(query_embedding, embedding)
        if similarity > best_similarity:
            best_similarity = similarity
            best_match = user
    
    # For cosine similarity, higher is better (more similar)
    if best_match is None or best_similarity < face_recognition.threshold:
        raise HTTPException(
            status_code=400, 
            detail=f"No matching user found (similarity: {best_similarity}, threshold: {face_recognition.threshold})"
        )
    
    # Check if attendance already marked for today
    today = date.today()
    existing_attendance = db.query(models.Attendance).filter(
        models.Attendance.user_id == best_match.user_id,
        models.Attendance.timestamp >= today
    ).first()
    
    if existing_attendance:
        return {
            "message": "Attendance already marked for today",
            "user_id": best_match.user_id,
            "name": best_match.name
        }
    
    # Mark attendance
    new_attendance = models.Attendance(
        user_id=best_match.user_id,
        confidence=best_similarity  # Use similarity directly as confidence
    )
    db.add(new_attendance)
    db.commit()
    
    return {
        "message": "Attendance marked successfully",
        "user_id": best_match.user_id,
        "name": best_match.name
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