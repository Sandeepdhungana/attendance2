from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from typing import Dict, Any
from app.database import get_db
from app.services.attendance import get_office_timings, set_office_timings
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/office-timings")
def get_timings(db: Session = Depends(get_db)):
    """Get current office timings"""
    return get_office_timings(db)

@router.post("/office-timings")
async def update_timings(
    login_time: str = Form(...),
    logout_time: str = Form(...),
    db: Session = Depends(get_db)
):
    """Set office timings"""
    try:
        return set_office_timings(login_time, logout_time, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) 