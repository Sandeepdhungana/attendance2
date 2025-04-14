from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.database import get_db
from app.services.user import get_users, delete_user
from app.dependencies import get_face_recognition
from app.utils.websocket import broadcast_attendance_update
from app.utils.time_utils import get_local_time
from app.dependencies import get_queues
from app.models import User
import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/users")
def get_all_users(db: Session = Depends(get_db)):
    """Get all registered users"""
    return get_users(db)

@router.delete("/users/{user_id}")
def delete_user_route(user_id: str, db: Session = Depends(get_db)):
    """Delete a user"""
    try:
        result = delete_user(user_id, db)
        # Broadcast user deletion
        attendance_update = {
            "action": "delete_user",
            "user_id": user_id,
            "timestamp": get_local_time().isoformat()
        }
        processing_results_queue, _ = get_queues()
        processing_results_queue.put({
            "type": "attendance_update",
            "data": [attendance_update]
        })
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/register")
async def register_user(
    user_id: str = Form(...),
    name: str = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Register a new user"""
    # Read and decode image
    contents = await image.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # Get face embedding
    face_recognition = get_face_recognition()
    embedding = face_recognition.get_embedding(img)
    if embedding is None:
        raise HTTPException(
            status_code=400, detail="No face detected in image")

    # Check if user already exists
    existing_user = db.query(User).filter(
        User.user_id == user_id).first()
    if existing_user:
        raise HTTPException(
            status_code=400, detail="User ID already registered")

    # Create new user
    new_user = User(
        user_id=user_id,
        name=name,
        embedding=face_recognition.embedding_to_str(embedding)
    )
    db.add(new_user)
    db.commit()

    # Broadcast user registration
    attendance_update = {
        "action": "register_user",
        "user_id": user_id,
        "name": name,
        "timestamp": get_local_time().isoformat()
    }
    processing_results_queue, _ = get_queues()
    processing_results_queue.put({
        "type": "attendance_update",
        "data": [attendance_update]
    })

    logger.info(f"User registered successfully: {user_id} ({name})")
    return {"message": "User registered successfully"} 