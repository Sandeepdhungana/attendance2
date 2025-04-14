from datetime import datetime, date, timezone, timedelta
import pytz
import logging
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import TimezoneConfig

logger = logging.getLogger(__name__)

def get_configured_timezone(db: Session):
    """Get the configured timezone from database or return default"""
    try:
        timezone_config = db.query(TimezoneConfig).first()
        if timezone_config:
            return pytz.timezone(timezone_config.timezone_name)
        # If no configuration exists, create default
        default_config = TimezoneConfig()
        db.add(default_config)
        db.commit()
        return pytz.timezone(default_config.timezone_name)
    except Exception as e:
        logger.error(f"Error getting timezone configuration: {str(e)}")
        # Fallback to IST
        return timezone(timedelta(hours=5, minutes=30))

def get_local_time():
    """Get current time in configured timezone"""
    db = next(get_db())
    try:
        local_tz = get_configured_timezone(db)
        return datetime.now(local_tz)
    finally:
        db.close()

def get_local_date():
    """Get current date in local timezone"""
    return get_local_time().date()

def convert_to_local_time(dt):
    """Convert a datetime to configured timezone"""
    if dt is None:
        return None
    db = next(get_db())
    try:
        local_tz = get_configured_timezone(db)
        if dt.tzinfo is None:
            dt = local_tz.localize(dt)
        return dt.astimezone(local_tz)
    finally:
        db.close() 