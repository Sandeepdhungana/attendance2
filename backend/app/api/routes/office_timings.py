from fastapi import APIRouter, HTTPException, Form
from typing import Dict, Any
from app.services.attendance import get_office_timings, set_office_timings
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/office-timings")
def get_timings():
    """Get current office timings"""
    return get_office_timings()

@router.post("/office-timings")
async def update_timings(
    login_time: str = Form(...),
    logout_time: str = Form(...)
):
    """Set office timings"""
    try:
        return set_office_timings(login_time, logout_time)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) 