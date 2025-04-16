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
    get_thread_pool,
    get_pending_futures,
    get_client_tasks,
    get_queues,
    get_active_connections,
    get_face_recognition,
    get_employee_cache,
    get_cached_employees
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

    # Get thread pool for I/O bound tasks
    thread_pool = get_thread_pool()

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "get_attendance":
                # Run database query in thread pool to avoid blocking
                def fetch_attendance():
                    attendance_records = query("Attendance")
                    return [{
                        "id": record["employee_id"],
                        "objectId": record["objectId"],
                        "employee_id": record["employee_id"],
                        "entry_time": record.get("timestamp", {}).get("iso") if record.get("timestamp") else None,
                        "exit_time": record.get("exit_time", {}).get("iso") if record.get("exit_time") else None,
                        "confidence": record.get("confidence", 0),
                        "is_late": record.get("is_late", False),
                        "is_early_exit": record.get("is_early_exit", False),
                        "late_message": f"Late arrival: {record.get('timestamp', {}).get('iso')}" if record.get("is_late", False) else None,
                        "early_exit_message": f"Early exit: {record.get('exit_time', {}).get('iso')}" if record.get("is_early_exit", False) else None
                    } for record in attendance_records]
                
                # Run in thread pool and await completion
                # records = await asyncio.get_event_loop().run_in_executor(thread_pool, fetch_attendance)
                records = fetch_attendance()
                await websocket.send_json({
                    "type": "attendance_data",
                    "data": records
                })

            elif data.get("type") == "get_employees":
                # Run employee query in thread pool
                def fetch_employees():
                    # Use cached employees if available
                    try:
                        employees = get_cached_employees()
                    except:
                        employees = query("Employee")
                        
                    return [{
                        "employee_id": employee["employee_id"],
                        "name": employee["name"],
                        "created_at": employee.get("createdAt", "")
                    } for employee in employees]
                
                # Run in thread pool and await completion
                # employees_data = await asyncio.get_event_loop().run_in_executor(thread_pool, fetch_employees)
                employees_data = fetch_employees()
                await websocket.send_json({
                    "type": "employee_data",
                    "data": employees_data
                })

            elif data.get("type") == "delete_attendance":
                # Delete attendance record
                attendance_id = data.get("attendance_id")
                
                if attendance_id:
                    # Define the delete operation to run in thread pool
                    def delete_attendance_record():
                       
                        attendance_record = query("Attendance", where={"objectId": attendance_id}, limit=1)
                        if attendance_record:
                            attendance = attendance_record[0]
                            delete("Attendance", attendance_id)
                            
                            return attendance
                        return None
                    
                    # Run deletion in thread pool
                    attendance = delete_attendance_record()
                    if attendance:
                        # Broadcast attendance deletion
                        await broadcast_attendance_update({
                            "action": "delete",
                            "employee_id": attendance["employee_id"],
                            "id": attendance["employee_id"],  # Set id for proper matching in frontend
                            "objectId": attendance["objectId"],  # Include objectId for proper referencing
                            "timestamp": get_local_time().isoformat()
                        })
                        
                        # Also send response to the current client
                        await websocket.send_json({
                            "status": "success",
                            "message": "Attendance record deleted successfully"
                        })
                    else:
                        await websocket.send_json({
                            "status": "error",
                            "message": f"Attendance record with ID {attendance_id} not found"
                        })
                else:
                    logger.warning("No attendance_id provided for deletion")
                    await websocket.send_json({
                        "status": "error",
                        "message": "No attendance_id provided for deletion"
                    })

            elif data.get("type") == "delete_employee":
                # Delete employee operation
                employee_id = data.get("employee_id")
                if employee_id:
                    # Define delete employee operation for thread pool
                    def delete_employee_record():
                        # Get employee info before deletion
                        employee = query("Employee", where={"employee_id": employee_id}, limit=1)
                        if employee:
                            employee = employee[0]
                            # Delete the employee
                            delete("Employee", employee["objectId"])
                            return employee
                        return None
                    
                    # Run in thread pool
                    # employee = await asyncio.get_event_loop().run_in_executor(thread_pool, delete_employee_record)
                    employee = delete_employee_record()
                    
                    if employee:
                        # Broadcast employee deletion
                        await broadcast_attendance_update({
                            "action": "delete_employee",
                            "employee_id": employee_id,
                            "name": employee["name"],
                            "timestamp": get_local_time().isoformat()
                        })
                        await websocket.send_json({
                            "status": "success",
                            "message": "Employee deleted successfully"
                        })
                    else:
                        await websocket.send_json({
                            "status": "error",
                            "message": "Employee not found"
                        })

            elif data.get("type") == "register_employee":
                # Register new employee
                employee_id = data.get("employee_id")
                name = data.get("name")
                image_data = data.get("image")
                position = data.get("position")
                department = data.get("department")
                status = data.get("status")

                if not all([employee_id, name, image_data]):
                    await websocket.send_json({
                        "status": "error",
                        "message": "Missing required fields (employee_id, name, or image)"
                    })
                    continue

                # Check if employee already exists in thread pool
                def check_employee():
                    return query("Employee", where={"employee_id": employee_id}, limit=1)
                
                existing_employee = check_employee()
                
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

                    # Get face embedding - this is CPU intensive, so use process pool
                    face_recognition = get_face_recognition()
                    process_pool = get_process_pool()
                    
                    def get_face_embedding():
                        return face_recognition.get_embedding(img)
                    
                    # embedding = await asyncio.get_event_loop().run_in_executor(
                    #     process_pool, get_face_embedding)
                    embedding = get_face_embedding()
                    
                    if embedding is None:
                        await websocket.send_json({
                            "status": "error",
                            "message": "No face detected in image"
                        })
                        continue

                    # Create new employee with embedding in thread pool
                    def create_employee_record():
                        current_time = get_local_time().isoformat()
                        return create("Employee", {
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
                            },
                            "position": position,
                            "department": department,
                            "status": status
                            
                        })
                    
                    # new_employee = await asyncio.get_event_loop().run_in_executor(
                    #     thread_pool, create_employee_record)

                    new_employee = create_employee_record()

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
                            "message": "Server Busy with other images"
                        })
                        continue
                    client_pending_tasks[client_id] += 1

           
                entry_type = data.get("entry_type", "entry")

                # Submit image processing to process pool (CPU intensive task)
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