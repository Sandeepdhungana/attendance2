from datetime import datetime
import pytz
from ..database import query

def get_local_time():
    """Get current time in configured timezone"""
    # Get timezone configuration from Back4App
    timezone_config = query("TimezoneConfig", limit=1)
    if timezone_config:
        local_tz = pytz.timezone(timezone_config[0]["timezone_name"])
    else:
        # Default to IST if no configuration exists
        local_tz = pytz.timezone("Asia/Kolkata")
    
    return datetime.now(local_tz)

def get_local_date():
    """Get current date in local timezone"""
    return get_local_time().date()

def convert_to_local_time(dt):
    """Convert a datetime to configured timezone"""
    if dt is None:
        return None
    
    # Get timezone configuration from Back4App
    timezone_config = query("TimezoneConfig", limit=1)
    if timezone_config:
        local_tz = pytz.timezone(timezone_config[0]["timezone_name"])
    else:
        # Default to IST if no configuration exists
        local_tz = pytz.timezone("Asia/Dubai")
    
    if dt.tzinfo is None:
        dt = local_tz.localize(dt)
    return dt.astimezone(local_tz) 