from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any
import uuid
import asyncio
import logging
import base64
import numpy as np
import cv2
import os
from datetime import datetime
from app.database import get_db
from app.dependencies import (
    get_process_pool,
    get_pending_futures,
    get_client_tasks,
    get_queues,
    get_active_connections,
    get_face_recognition,
    get_cached_users
)
from app.utils.websocket import (
    ping_client, 
    process_queue, 
    process_websocket_responses, 
    broadcast_attendance_update,
    handle_future_completion
)
from app.utils.processing import process_image_in_process
from app.utils.time_utils import get_local_time
from app.models import User, Attendance
from app.config import IMAGES_DIR, MAX_CONCURRENT_TASKS_PER_CLIENT

logger = logging.getLogger(__name__)

router = APIRouter()

@router.websocket("/ws/attendance")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    await websocket.accept()
    
    # Generate unique client ID
    client_id = str(uuid.uuid4())
    active_connections = get_active_connections()
    active_connections[client_id] = websocket
    
    logger.info(f"New WebSocket connection {client_id}. Total connections: {len(active_connections)}")

    # Initialize pending tasks counter for this client
    client_pending_tasks, client_pending_tasks_lock = get_client_tasks()
    with client_pending_tasks_lock:
        client_pending_tasks[client_id] = 0

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "get_attendance":
                # Get all attendance records
                attendance_records = db.query(Attendance).order_by(
                    Attendance.timestamp.desc()).all()
                await websocket.send_json({
                    "type": "attendance_data",
                    "data": [{
                        "id": record.id,
                        "user_id": record.user_id,
                        "timestamp": record.timestamp.isoformat(),
                        "confidence": record.confidence,
                        "is_late": record.is_late
                    } for record in attendance_records]
                })

            elif data.get("type") == "get_users":
                # Get all users from cache
                users = get_cached_users(db)
                await websocket.send_json({
                    "type": "user_data",
                    "data": [{
                        "user_id": user.user_id,
                        "name": user.name,
                        "created_at": user.created_at.isoformat()
                    } for user in users]
                })

            elif data.get("type") == "delete_attendance":
                # Delete attendance record
                attendance_id = data.get("attendance_id")
                if attendance_id:
                    attendance = db.query(Attendance).filter(
                        Attendance.id == attendance_id).first()
                    if attendance:
                        db.delete(attendance)
                        db.commit()
                        await broadcast_attendance_update([{
                            "action": "delete",
                            "user_id": attendance.user_id,
                            "name": attendance.user.name,
                            "timestamp": get_local_time().isoformat()
                        }])

            elif data.get("type") == "delete_user":
                # Delete user
                user_id = data.get("user_id")
                if user_id:
                    user = db.query(User).filter(
                        User.user_id == user_id).first()
                    if user:
                        db.delete(user)
                        db.commit()
                        await broadcast_attendance_update([{
                            "action": "delete_user",
                            "user_id": user_id,
                            "name": user.name,
                            "timestamp": get_local_time().isoformat()
                        }])

            elif data.get("type") == "register_user":
                # Register new user
                user_id = data.get("user_id")
                name = data.get("name")
                image_data = data.get("image")

                if not all([user_id, name, image_data]):
                    await websocket.send_json({
                        "status": "error",
                        "message": "Missing required fields (user_id, name, or image)"
                    })
                    continue

                # Check if user already exists
                existing_user = db.query(User).filter(
                    User.user_id == user_id).first()
                if existing_user:
                    await websocket.send_json({
                        "status": "error",
                        "message": "User ID already registered"
                    })
                    continue

                try:
                    # Process the image
                    # Remove data URL prefix if present
                    if "," in image_data:
                        image_data = image_data.split(",")[1]

                    # Decode base64 to bytes
                    image_bytes = base64.b64decode(image_data)
                    nparr = np.frombuffer(image_bytes, np.uint8)
                    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                    if img is None:
                        await websocket.send_json({
                            "status": "error",
                            "message": "Invalid image data"
                        })
                        continue

                    # Get face embedding
                    face_recognition = get_face_recognition()
                    embedding = face_recognition.get_embedding(img)
                    if embedding is None:
                        await websocket.send_json({
                            "status": "error",
                            "message": "No face detected in image"
                        })
                        continue

                    # Create new user with embedding
                    new_user = User(
                        user_id=user_id,
                        name=name,
                        embedding=face_recognition.embedding_to_str(embedding)
                    )
                    db.add(new_user)
                    db.commit()

                    # Save the registration image
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                    filename = f"register_{user_id}_{timestamp}.jpg"
                    filepath = os.path.join(IMAGES_DIR, filename)
                    # cv2.imwrite(filepath, img)
                    logger.info(f"Saved registration image to {filepath}")

                    # Broadcast user registration
                    await broadcast_attendance_update([{
                        "action": "register_user",
                        "user_id": user_id,
                        "name": name,
                        "timestamp": get_local_time().isoformat()
                    }])

                    await websocket.send_json({
                        "status": "success",
                        "message": "User registered successfully"
                    })

                except Exception as e:
                    logger.error(f"Error registering user: {str(e)}")
                    await websocket.send_json({
                        "status": "error",
                        "message": f"Error registering user: {str(e)}"
                    })

            elif "image" in data:
                # Check if client has too many pending tasks
                with client_pending_tasks_lock:
                    if client_pending_tasks.get(client_id, 0) >= MAX_CONCURRENT_TASKS_PER_CLIENT:
                        await websocket.send_json({
                            "status": "error",
                            "message": "Too many pending tasks. Please wait."
                        })
                        continue
                    client_pending_tasks[client_id] += 1

                # Process image for face recognition
                entry_type = data.get("entry_type", "entry")

                # Submit image processing to process pool
                process_pool = get_process_pool()
                future = process_pool.submit(
                    process_image_in_process,
                    data["image"],
                    entry_type,
                    client_id
                )

                # Store the future with client_id
                pending_futures = get_pending_futures()
                pending_futures[future] = client_id

                # Add callback for when the future completes
                future.add_done_callback(
                    lambda f: handle_future_completion(f, client_id))

            elif data.get("type") == "ping":
                # Respond to ping
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        if client_id in active_connections:
            del active_connections[client_id]
        logger.info(f"WebSocket connection {client_id} closed. Total connections: {len(active_connections)}")
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {str(e)}")
        try:
            await websocket.send_json({
                "status": "error",
                "message": str(e)
            })
        except:
            pass
    finally:
        try:
            if client_id in active_connections:
                del active_connections[client_id]
            with client_pending_tasks_lock:
                if client_id in client_pending_tasks:
                    del client_pending_tasks[client_id]
        except KeyError:
            pass
        logger.info(f"WebSocket connection {client_id} closed. Total connections: {len(active_connections)}") 