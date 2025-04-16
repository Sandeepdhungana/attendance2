from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any
import uuid
import asyncio
import logging
import base64
import numpy as np
import cv2
import os
from datetime import datetime
from app.database import query, create, delete, update
from app.dependencies import (
    get_process_pool,
    get_pending_futures,
    get_client_tasks,
    get_queues,
    get_active_connections,
    get_face_recognition,
    get_employee_cache
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
from app.config import IMAGES_DIR, MAX_CONCURRENT_TASKS_PER_CLIENT

logger = logging.getLogger(__name__)

router = APIRouter()

@router.websocket("/ws/attendance")
async def websocket_endpoint(websocket: WebSocket):
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
                attendance_records = query("Attendance")

                await websocket.send_json({
                    "type": "attendance_data",
                    "data": [{
                        "id": record["objectId"],
                        "employee_id": record["employee_id"],
                        "name": record.get("employee_name", "Unknown Employee"),
                        "entry_time": record.get("timestamp", None),
                        "exit_time": record.get("exit_time", None),
                        "confidence": record.get("confidence", 0),
                        "is_late": record.get("is_late", False),
                        "is_early_exit": record.get("is_early_exit", False),
                        "late_message": f"Late arrival: {record['timestamp']}" if record.get("is_late", False) else None,
                        "early_exit_message": f"Early exit: {record['exit_time']}" if record.get("is_early_exit", False) else None
                    } for record in attendance_records]
                })

            elif data.get("type") == "get_employees":
                # Get all employees
                employees = query("Employee")
                await websocket.send_json({
                    "type": "employee_data",
                    "data": [{
                        "employee_id": employee["employee_id"],
                        "name": employee["name"],
                        "created_at": employee.get("createdAt", "")
                    } for employee in employees]
                })

            elif data.get("type") == "delete_attendance":
                # Delete attendance record
                attendance_id = data.get("attendance_id")
                if attendance_id:
                    # Get attendance record first to get employee information
                    attendance_record = query("Attendance", where={"objectId": attendance_id}, limit=1)
                    if attendance_record:
                        attendance = attendance_record[0]
                        # Delete attendance record
                        delete("Attendance", attendance_id)
                        
                        # Broadcast attendance deletion
                        await broadcast_attendance_update({
                            "action": "delete",
                            "employee_id": attendance["employee_id"],
                            "name": attendance.get("employee_name", "Unknown Employee"),
                            "timestamp": get_local_time().isoformat()
                        })

            elif data.get("type") == "delete_employee":
                # Delete employee
                employee_id = data.get("employee_id")
                if employee_id:
                    # Get employee info before deletion
                    employee = query("Employee", where={"employee_id": employee_id}, limit=1)
                    if employee:
                        employee = employee[0]
                        # Delete the employee
                        delete("Employee", employee["objectId"])
                        
                        # Broadcast employee deletion
                        await broadcast_attendance_update({
                            "action": "delete_employee",
                            "employee_id": employee_id,
                            "name": employee["name"],
                            "timestamp": get_local_time().isoformat()
                        })

            elif data.get("type") == "register_employee":
                # Register new employee
                employee_id = data.get("employee_id")
                name = data.get("name")
                image_data = data.get("image")

                if not all([employee_id, name, image_data]):
                    await websocket.send_json({
                        "status": "error",
                        "message": "Missing required fields (employee_id, name, or image)"
                    })
                    continue

                # Check if employee already exists
                existing_employee = query("Employee", where={"employee_id": employee_id}, limit=1)
                if existing_employee:
                    await websocket.send_json({
                        "status": "error",
                        "message": "Employee ID already registered"
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

                    # Create new employee with embedding
                    current_time = get_local_time().isoformat()
                    new_employee = create("Employee", {
                        "employee_id": employee_id,
                        "name": name,
                        "embedding": face_recognition.embedding_to_str(embedding),
                        "created_at": {
                            "__type": "Date",
                            "iso": current_time
                        },
                        "updated_at": {
                            "__type": "Date",
                            "iso": current_time
                        }
                    })

                    # Save the registration image
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                    filename = f"register_{employee_id}_{timestamp}.jpg"
                    filepath = os.path.join(IMAGES_DIR, filename)
                    # cv2.imwrite(filepath, img)
                    logger.info(f"Saved registration image to {filepath}")

                    # Broadcast employee registration
                    await broadcast_attendance_update({
                        "action": "register_employee",
                        "employee_id": employee_id,
                        "name": name,
                        "timestamp": get_local_time().isoformat()
                    })

                    await websocket.send_json({
                        "status": "success",
                        "message": "Employee registered successfully"
                    })

                except Exception as e:
                    logger.error(f"Error registering employee: {str(e)}")
                    await websocket.send_json({
                        "status": "error",
                        "message": f"Error registering employee: {str(e)}"
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

                # Get queues for this client
                queues = get_queues()
                if client_id not in queues:
                    queues[client_id] = asyncio.Queue()

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

                # Start processing queue for this client if not already running
                if not any(task.get_name() == f"queue_processor_{client_id}" 
                         for task in asyncio.all_tasks()):
                    asyncio.create_task(
                        process_queue(),
                        name=f"queue_processor_{client_id}"
                    )

                # Start ping task if not already running
                if not any(task.get_name() == f"ping_{client_id}" 
                         for task in asyncio.all_tasks()):
                    asyncio.create_task(
                        ping_client(websocket),
                        name=f"ping_{client_id}"
                    )

            elif data.get("type") == "ping":
                # Respond to ping
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info(f"WebSocket connection {client_id} closed")
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
        # Clean up
        if client_id in active_connections:
            del active_connections[client_id]
        with client_pending_tasks_lock:
            if client_id in client_pending_tasks:
                del client_pending_tasks[client_id]
        logger.info(f"WebSocket connection {client_id} closed. Total connections: {len(active_connections)}") 