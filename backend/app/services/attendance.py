from typing import List, Dict, Any
from sqlalchemy.orm import Session
from ..models import Attendance, User, OfficeTiming
from ..utils.time_utils import get_local_date, get_local_time, convert_to_local_time
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

def get_attendance_records(db: Session) -> List[Dict[str, Any]]:
    """Get all attendance records"""
    attendances = db.query(Attendance).order_by(Attendance.timestamp.desc()).all()
    return [
        {
            "id": att.id,
            "user_id": att.user_id,
            "name": att.user.name if att.user else "Unknown User",
            "entry_time": att.timestamp.isoformat() if att.timestamp else None,
            "exit_time": att.exit_time.isoformat() if att.exit_time else None,
            "confidence": att.confidence,
            "is_late": att.is_late,
            "is_early_exit": att.is_early_exit,
            "late_message": f"Late arrival: {att.timestamp.strftime('%H:%M')}" if att.is_late else None,
            "early_exit_message": f"Early exit: {att.exit_time.strftime('%H:%M')}" if att.is_early_exit else None
        }
        for att in attendances
    ]

def delete_attendance_record(attendance_id: int, db: Session) -> Dict[str, Any]:
    """Delete an attendance record"""
    # Find the attendance record
    attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not attendance:
        raise ValueError("Attendance record not found")

    # Store user info before deletion for broadcasting
    user_id = attendance.user_id
    user = db.query(User).filter(User.user_id == user_id).first()
    user_name = user.name if user else "Unknown"

    # Delete the attendance record
    db.delete(attendance)
    db.commit()

    # Create attendance update for broadcasting
    attendance_update = {
        "action": "delete",
        "user_id": user_id,
        "name": user_name,
        "attendance_id": attendance_id,
        "timestamp": get_local_time().isoformat()
    }

    logger.info(f"Attendance record deleted successfully: ID {attendance_id}")
    return attendance_update

def get_office_timings(db: Session) -> Dict[str, Any]:
    """Get current office timings"""
    timing = db.query(OfficeTiming).first()
    if not timing:
        return {"login_time": None, "logout_time": None}
    
    return {
        "login_time": timing.login_time.strftime("%H:%M") if timing.login_time else None,
        "logout_time": timing.logout_time.strftime("%H:%M") if timing.logout_time else None
    }

def set_office_timings(login_time: str, logout_time: str, db: Session) -> Dict[str, Any]:
    """Set office timings"""
    try:
        # Parse times
        login_dt = datetime.strptime(login_time, "%H:%M").time()
        logout_dt = datetime.strptime(logout_time, "%H:%M").time()
        
        # Get current date in local timezone
        today = get_local_date()
        
        # Create timezone-aware datetime objects
        login_datetime = datetime.combine(today, login_dt)
        logout_datetime = datetime.combine(today, logout_dt)
        
        # Convert to local timezone
        login_datetime = convert_to_local_time(login_datetime)
        logout_datetime = convert_to_local_time(logout_datetime)
        
        # Check if timings already exist
        existing_timing = db.query(OfficeTiming).first()
        if existing_timing:
            existing_timing.login_time = login_datetime
            existing_timing.logout_time = logout_datetime
            db.commit()
        else:
            new_timing = OfficeTiming(
                login_time=login_datetime,
                logout_time=logout_datetime
            )
            db.add(new_timing)
            db.commit()
        
        return {"message": "Office timings updated successfully"}
    except Exception as e:
        logger.error(f"Error setting office timings: {str(e)}")
        raise ValueError(str(e))

def process_attendance_for_user(user, similarity, entry_type, db):
    """Process attendance for a user with consistent duplicate checking"""
    # Check if attendance already marked for today
    today = get_local_date()
    today_start = datetime.combine(today, datetime.min.time())
    today_start = convert_to_local_time(today_start)
    today_end = datetime.combine(today, datetime.max.time())
    today_end = convert_to_local_time(today_end)

    # Get any existing attendance record for today
    existing_attendance = db.query(Attendance).filter(
        Attendance.user_id == user.user_id,
        Attendance.timestamp >= today_start,
        Attendance.timestamp <= today_end
    ).first()

    result = {
        "processed_user": None,
        "attendance_update": None
    }

    if entry_type == "entry":
        if existing_attendance:
            # Check if there's already an entry without exit
            if not existing_attendance.exit_time:
                result["processed_user"] = {
                    "message": "Entry already marked for today",
                    "user_id": user.user_id,
                    "name": user.name,
                    "timestamp": existing_attendance.timestamp.isoformat(),
                    "similarity": similarity,
                    "entry_time": existing_attendance.timestamp.isoformat(),
                    "exit_time": None
                }
            else:
                # If there's an exit time, don't allow re-entry on same day
                result["processed_user"] = {
                    "message": "Cannot mark entry again for today after exit",
                    "user_id": user.user_id,
                    "name": user.name,
                    "timestamp": existing_attendance.timestamp.isoformat(),
                    "similarity": similarity,
                    "entry_time": existing_attendance.timestamp.isoformat(),
                    "exit_time": existing_attendance.exit_time.isoformat()
                }
            return result

        # New entry logic for users without existing attendance
        is_late = False
        late_message = None
        minutes_late = None
        current_time = get_local_time()
        
        # Get office timings
        office_timing = db.query(OfficeTiming).first()
        if office_timing and office_timing.login_time:
            # Convert login_time to timezone-aware datetime for today
            login_time = datetime.combine(today, office_timing.login_time.time())
            login_time = convert_to_local_time(login_time)
            
            # Calculate the grace period end time (1 hour after login time)
            grace_period_end = login_time + timedelta(hours=1)
            
            # Mark as late if entry is after grace period
            if current_time > grace_period_end:
                is_late = True
                time_diff = current_time - login_time
                minutes_late = int(time_diff.total_seconds() / 60)
                late_message = f"Late arrival: {current_time.strftime('%H:%M')} ({minutes_late} minutes late, Office time: {login_time.strftime('%H:%M')}, Grace period: {grace_period_end.strftime('%H:%M')})"

        new_attendance = Attendance(
            user_id=user.user_id,
            confidence=similarity,
            is_late=is_late,
            timestamp=current_time
        )
        db.add(new_attendance)
        db.commit()

        # Create message for on-time arrival
        message = "Entry marked successfully"
        if is_late:
            message += f" - {late_message}"
        else:
            message += f" - On time (Office time: {login_time.strftime('%H:%M')}, Grace period until: {grace_period_end.strftime('%H:%M')})"

        attendance_data = {
            "action": "entry",
            "user_id": user.user_id,
            "name": user.name,
            "timestamp": new_attendance.timestamp.isoformat(),
            "similarity": similarity,
            "is_late": is_late,
            "late_message": late_message,
            "entry_time": new_attendance.timestamp.isoformat(),
            "exit_time": None,
            "minutes_late": minutes_late
        }

        result["processed_user"] = {**attendance_data, "message": message}
        result["attendance_update"] = attendance_data

    else:  # exit
        if not existing_attendance:
            result["processed_user"] = {
                "message": "No entry record found for today",
                "user_id": user.user_id,
                "name": user.name,
                "similarity": similarity
            }
            return result
        elif existing_attendance.exit_time:
            result["processed_user"] = {
                "message": "Exit already marked for today",
                "user_id": user.user_id,
                "name": user.name,
                "timestamp": existing_attendance.exit_time.isoformat(),
                "similarity": similarity,
                "entry_time": existing_attendance.timestamp.isoformat(),
                "exit_time": existing_attendance.exit_time.isoformat()
            }
            return result

        # Process exit for users with existing entry but no exit
        is_early_exit = False
        early_exit_message = None
        current_time = get_local_time()
        
        # Get office timings
        office_timing = db.query(OfficeTiming).first()
        if office_timing and office_timing.logout_time:
            # Convert logout_time to timezone-aware datetime for today
            logout_time = datetime.combine(today, office_timing.logout_time.time())
            logout_time = convert_to_local_time(logout_time)
            
            if current_time < logout_time:
                is_early_exit = True
                early_exit_message = f"Early exit: {current_time.strftime('%H:%M')} (Office time: {logout_time.strftime('%H:%M')})"

        # Update the existing attendance record with exit time
        existing_attendance.exit_time = current_time
        existing_attendance.is_early_exit = is_early_exit
        db.commit()

        attendance_data = {
            "action": "exit",
            "user_id": user.user_id,
            "name": user.name,
            "timestamp": current_time.isoformat(),
            "similarity": similarity,
            "is_early_exit": is_early_exit,
            "early_exit_message": early_exit_message,
            "attendance_id": existing_attendance.id,
            "entry_time": existing_attendance.timestamp.isoformat(),
            "exit_time": current_time.isoformat()
        }

        result["processed_user"] = {
            **attendance_data,
            "message": "Exit recorded successfully" + (f" - {early_exit_message}" if early_exit_message else "")
        }
        result["attendance_update"] = attendance_data

    return result 