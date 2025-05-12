from datetime import datetime, timedelta
import pytz
from app.database import query as db_query
import logging

logger = logging.getLogger(__name__)

class TimezoneConfigCache:
    _cache = None
    _last_clear = None
    _cache_ttl = 3600  # 1 hour in seconds
    
    @classmethod
    def get_timezone_config(cls):
        """Get timezone configuration with caching"""
        current_time = datetime.now()
        
        # Clear cache if needed
        if cls._cache is None or cls._last_clear is None or (current_time - cls._last_clear).total_seconds() > cls._cache_ttl:
            try:
                timezone_config = db_query("TimezoneConfig", limit=1)
                if timezone_config:
                    cls._cache = timezone_config[0]
                else:
                    # Default to UTC if no config found
                    cls._cache = {"timezone": "UTC"}
                cls._last_clear = current_time
            except Exception as e:
                logger.error(f"Error fetching timezone config: {str(e)}")
                # Fallback to UTC if query fails
                cls._cache = {"timezone": "UTC"}
                cls._last_clear = current_time
        
        return cls._cache

def get_local_time():
    """Get current time in local timezone"""
    try:
        config = TimezoneConfigCache.get_timezone_config()
        timezone_str = config.get("timezone", "UTC")
        timezone = pytz.timezone(timezone_str)
        return datetime.now(timezone)
    except Exception as e:
        logger.error(f"Error getting local time: {str(e)}")
        return datetime.now(pytz.UTC)

def convert_to_local_time(dt: datetime) -> datetime:
    """Convert a datetime to local timezone"""
    try:
        if dt.tzinfo is None:
            dt = pytz.UTC.localize(dt)
        
        config = TimezoneConfigCache.get_timezone_config()
        timezone_str = config.get("timezone", "UTC")
        timezone = pytz.timezone(timezone_str)
        return dt.astimezone(timezone)
    except Exception as e:
        logger.error(f"Error converting to local time: {str(e)}")
        return dt.astimezone(pytz.UTC)

def get_local_date():
    """Get current date in local timezone"""
    return get_local_time().date() 