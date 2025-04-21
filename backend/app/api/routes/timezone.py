from fastapi import APIRouter, HTTPException, Form
from app.models import TimezoneConfig
from app.database import query
import pytz
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter()

def get_timezone_offset(timezone_name):
    """Calculate timezone offset from timezone name"""
    tz = pytz.timezone(timezone_name)
    offset = tz.utcoffset(datetime.utcnow())
    hours, remainder = divmod(offset.total_seconds(), 3600)
    minutes = remainder // 60
    sign = "+" if hours >= 0 else "-"
    return f"{sign}{abs(int(hours)):02d}:{abs(int(minutes)):02d}"

@router.get("/timezone")
def get_timezone():
    """Get current timezone configuration"""
    timezone_configs = query("TimezoneConfig", limit=1)
    if not timezone_configs:
        # Return default if no configuration exists
        return {"timezone": "Asia/Kolkata"}
    return {"timezone": timezone_configs[0]["timezone_name"]}

@router.post("/timezone")
async def set_timezone(timezone: str = Form(...)):
    """Set application timezone"""
    try:
        # Validate timezone
        pytz.timezone(timezone)
        
        # Calculate timezone offset
        timezone_offset = get_timezone_offset(timezone)
        
        # Update or create timezone configuration
        timezone_configs = query("TimezoneConfig", limit=1)
        if timezone_configs:
            timezone_config = TimezoneConfig()
            timezone_config.update(timezone_configs[0]["objectId"], {
                "timezone_name": timezone,
                "timezone_offset": timezone_offset
            })
        else:
            timezone_config = TimezoneConfig()
            timezone_config.create({
                "timezone_name": timezone,
                "timezone_offset": timezone_offset
            })
        
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