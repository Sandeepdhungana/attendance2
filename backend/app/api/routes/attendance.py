from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.database import get_db
from app.services.attendance import get_attendance_records, delete_attendance_record, process_attendance_for_user
from app.utils.processing import process_image_in_process
from app.dependencies import get_process_pool, get_pending_futures, get_client_tasks, get_queues, get_face_recognition
from app.utils.websocket import broadcast_attendance_update
from app.utils.time_utils import get_local_time
import asyncio
import logging
import numpy as np
import cv2
from app.models import User, Attendance, EarlyExitReason

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/attendance")
def get_attendance(db: Session = Depends(get_db)):
    """Get all attendance records"""
    return get_attendance_records(db)

@router.delete("/attendance/{attendance_id}")
def delete_attendance(attendance_id: int, db: Session = Depends(get_db)):
    """Delete an attendance record"""
    try:
        attendance_update = delete_attendance_record(attendance_id, db)
        # Add the update to the processing results queue
        processing_results_queue, _ = get_queues()
        processing_results_queue.put({
            "type": "attendance_update",
            "data": [attendance_update]
        })
        return {"message": "Attendance record deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/attendance")
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

    # Get face recognition instance
    face_recognition = get_face_recognition()

    # Get all face embeddings from the image
    face_embeddings = face_recognition.get_embeddings(img)
    if not face_embeddings:
        raise HTTPException(
            status_code=400, detail="No face detected in image")

    # Get all users from the database
    users = db.query(User).all()

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
    attendance_updates = []

    for match in matches:
        user = match['user']
        similarity = match['similarity']

        # Process attendance using shared function
        result = process_attendance_for_user(user, similarity, entry_type, db)
        
        if result["processed_user"]:
            processed_users.append(result["processed_user"])
        
        if result["attendance_update"]:
            attendance_updates.append(result["attendance_update"])

    # Broadcast attendance updates
    if attendance_updates:
        await broadcast_attendance_update(attendance_updates)

    # Return response with all processed users
    return {
        "multiple_users": True,
        "users": processed_users
    }

@router.post("/early-exit-reason")
async def submit_early_exit_reason(
    attendance_id: int = Form(...),
    reason: str = Form(...),
    db: Session = Depends(get_db)
):
    """Submit reason for early exit"""
    try:
        logger.info(f"Received early exit reason submission - attendance_id: {attendance_id}, reason: {reason}")
        
        # Get attendance record
        attendance = db.query(Attendance).filter(
            Attendance.id == attendance_id
        ).first()
        
        if not attendance:
            logger.error(f"Attendance record not found for ID: {attendance_id}")
            raise HTTPException(status_code=404, detail="Attendance record not found")
        
        # Create early exit reason
        new_reason = EarlyExitReason(
            user_id=attendance.user_id,
            attendance_id=attendance_id,
            reason=reason
        )
        db.add(new_reason)
        db.commit()
        
        # Get user info for broadcasting
        user = db.query(User).filter(User.user_id == attendance.user_id).first()
        
        # Broadcast the update
        await broadcast_attendance_update([{
            "action": "early_exit_reason",
            "user_id": attendance.user_id,
            "name": user.name if user else "Unknown",
            "timestamp": get_local_time().isoformat(),
            "reason": reason
        }])
        
        logger.info(f"Early exit reason submitted successfully for user {attendance.user_id}")
        return {"message": "Early exit reason submitted successfully"}
    except Exception as e:
        logger.error(f"Error submitting early exit reason: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/early-exit-reasons")
def get_early_exit_reasons(db: Session = Depends(get_db)):
    """Get all early exit reasons"""
    reasons = db.query(EarlyExitReason).order_by(
        EarlyExitReason.timestamp.desc()
    ).all()
    return [
        {
            "id": reason.id,
            "user_id": reason.user_id,
            "user_name": reason.user.name,
            "attendance_id": reason.attendance_id,
            "reason": reason.reason,
            "timestamp": reason.timestamp.isoformat()
        }
        for reason in reasons
    ]

@router.delete("/early-exit-reasons/{reason_id}")
def delete_early_exit_reason(reason_id: int, db: Session = Depends(get_db)):
    """Delete an early exit reason"""
    # Find the early exit reason
    reason = db.query(EarlyExitReason).filter(
        EarlyExitReason.id == reason_id).first()
    if not reason:
        raise HTTPException(
            status_code=404, detail="Early exit reason not found")

    # Store info before deletion for broadcasting
    user_id = reason.user_id
    user = db.query(User).filter(User.user_id == user_id).first()
    user_name = user.name if user else "Unknown"
    attendance_id = reason.attendance_id

    # Delete the early exit reason
    db.delete(reason)
    db.commit()

    # Create update for broadcasting
    update = {
        "action": "delete_early_exit_reason",
        "user_id": user_id,
        "name": user_name,
        "attendance_id": attendance_id,
        "reason_id": reason_id,
        "timestamp": get_local_time().isoformat()
    }

    # Add the update to the processing results queue
    processing_results_queue, _ = get_queues()
    processing_results_queue.put({
        "type": "attendance_update",
        "data": [update]
    })

    logger.info(f"Early exit reason deleted successfully: ID {reason_id}")
    return {"message": "Early exit reason deleted successfully"} 