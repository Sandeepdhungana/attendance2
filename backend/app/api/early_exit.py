from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models
from ..utils.websocket import broadcast_attendance_update
from ..utils.time_utils import get_local_time
import logging
from pydantic import BaseModel

class EarlyExitRequest(BaseModel):
    attendance_id: int
    reason: str

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/early-exit-reason")
async def submit_early_exit_reason(
    request: EarlyExitRequest,
    db: Session = Depends(get_db)
):
    """Submit reason for early exit"""
    try:
        attendance_id = request.attendance_id
        reason = request.reason
        
        logger.info(f"Received early exit reason submission - attendance_id: {attendance_id}, reason: {reason}")
        
        if not attendance_id or not reason:
            raise HTTPException(status_code=400, detail="Missing required fields")
        
        # Get attendance record
        attendance = db.query(models.Attendance).filter(
            models.Attendance.id == attendance_id
        ).first()
        
        if not attendance:
            logger.error(f"Attendance record not found for ID: {attendance_id}")
            raise HTTPException(status_code=404, detail="Attendance record not found")
        
        # Create early exit reason
        new_reason = models.EarlyExitReason(
            user_id=attendance.user_id,
            attendance_id=attendance_id,
            reason=reason
        )
        db.add(new_reason)
        db.commit()
        
        # Get user info for broadcasting
        user = db.query(models.User).filter(models.User.user_id == attendance.user_id).first()
        
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
    reasons = db.query(models.EarlyExitReason).order_by(
        models.EarlyExitReason.timestamp.desc()
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