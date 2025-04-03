from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import pytz

Base = declarative_base()

# Get local timezone
try:
    local_tz = pytz.timezone('Asia/Kolkata')  # Default to IST, can be changed based on your location
except:
    # Fallback if pytz is not available
    from datetime import timezone, timedelta
    local_tz = timezone(timedelta(hours=5, minutes=30))  # IST offset as fallback

def get_local_time():
    """Get current time in local timezone"""
    return datetime.now(local_tz)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, unique=True, index=True)
    name = Column(String)
    embedding = Column(String)  # Store face embedding as string (will be converted to/from numpy array)
    created_at = Column(DateTime, default=get_local_time)
    
    attendances = relationship("Attendance", back_populates="user")

class Attendance(Base):
    __tablename__ = "attendances"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.user_id"))
    timestamp = Column(DateTime, default=get_local_time)
    confidence = Column(Float)  # Store matching confidence score
    
    user = relationship("User", back_populates="attendances") 