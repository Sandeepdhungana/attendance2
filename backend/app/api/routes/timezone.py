from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from typing import Dict, Any
from app.database import get_db
from app.models import TimezoneConfig
import pytz
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/timezone")
def get_timezone(db: Session = Depends(get_db)):
    """Get current timezone configuration"""
    timezone_config = db.query(TimezoneConfig).first()
    if not timezone_config:
        # Return default if no configuration exists
        return {"timezone": "Asia/Kolkata"}
    return {"timezone": timezone_config.timezone_name}

@router.post("/timezone")
async def set_timezone(timezone: str = Form(...), db: Session = Depends(get_db)):
    """Set application timezone"""
    try:
        # Validate timezone
        pytz.timezone(timezone)
        
        # Update or create timezone configuration
        timezone_config = db.query(TimezoneConfig).first()
        if timezone_config:
            timezone_config.timezone_name = timezone
        else:
            timezone_config = TimezoneConfig(timezone_name=timezone)
            db.add(timezone_config)
        
        db.commit()
        return {"message": "Timezone updated successfully", "timezone": timezone}
    except pytz.exceptions.UnknownTimeZoneError:
        raise HTTPException(status_code=400, detail="Invalid timezone")
    except Exception as e:
        logger.error(f"Error setting timezone: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update timezone")

@router.get("/timezones")
def get_available_timezones():
    """Get list of all available timezones"""
    return {"timezones": pytz.all_timezones} 