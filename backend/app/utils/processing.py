import cv2
import numpy as np
import base64
import logging
from typing import List, Dict, Any
from ..dependencies import get_face_recognition
from ..database import get_db
from ..models import User, Attendance, OfficeTiming
from ..utils.time_utils import get_local_date, get_local_time, convert_to_local_time
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

def process_attendance_for_user(user: User, similarity: float, entry_type: str, db):
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

def process_image_in_process(image_data: str, entry_type: str, client_id: str):
    """Process image in a separate process"""
    db = next(get_db())
    try:
        # Remove data URL prefix if present
        if "," in image_data:
            image_data = image_data.split(",")[1]

        # Decode base64 to bytes
        image_bytes = base64.b64decode(image_data)

        # Convert to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return [], [], {}, 0

        # Get all face embeddings from the image
        face_recognition = get_face_recognition()
        face_embeddings = face_recognition.get_embeddings(img)
        if not face_embeddings:
            return [], [], {}, 1

        # Get all users from the database
        users = db.query(User).all()

        # Find matches for all detected faces
        matches = face_recognition.find_matches_for_embeddings(face_embeddings, users)

        if not matches:
            return [], [], {}, 0

        # Process each matched user
        processed_users = []
        attendance_updates = []
        last_recognized_users = {}

        for match in matches:
            user = match['user']
            similarity = match['similarity']

            # Update last recognized users
            last_recognized_users[user.user_id] = {
                'user': user,
                'similarity': similarity
            }

            # Process attendance using shared function
            result = process_attendance_for_user(user, similarity, entry_type, db)
            
            if result["processed_user"]:
                processed_users.append(result["processed_user"])
            
            if result["attendance_update"]:
                attendance_updates.append(result["attendance_update"])

        return processed_users, attendance_updates, last_recognized_users, 0

    except Exception as e:
        logger.error(f"Error processing image in process: {str(e)}")
        return [], [], {}, 0
    finally:
        db.close() 