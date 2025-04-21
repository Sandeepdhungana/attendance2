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
import concurrent.futures
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
from app.utils.processing import process_image_in_process, process_attendance_for_employee
from app.utils.time_utils import get_local_time
from app.config import IMAGES_DIR, MAX_CONCURRENT_TASKS_PER_CLIENT



logger = logging.getLogger(__name__)

router = APIRouter()

# Add function to create a new process pool


def create_new_process_pool():
    try:
        return concurrent.futures.ProcessPoolExecutor()
    except Exception as e:
        logger.error(f"Error creating new process pool: {str(e)}")
        return None


@router.websocket("/ws/attendance")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # Generate unique client ID
    client_id = str(uuid.uuid4())
    active_connections = get_active_connections()
    active_connections[client_id] = websocket

    logger.info(
        f"New WebSocket connection {client_id}. Total connections: {len(active_connections)}")

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
                        "name": query("Employee", where={"employee_id": att["employee_id"]}, limit=1)[0].get("name"),
                        "objectId": att["objectId"],
                        # Set id to employee_id for consistency with websocket
                        "id": att["employee_id"],
                        "employee_id": att["employee_id"],
                        "timestamp": att["timestamp"],
                        "entry_time": att.get("timestamp", {}).get("iso") if isinstance(att.get("timestamp"), dict) else att.get("timestamp"),
                        "exit_time": att.get("exit_time", {}).get("iso") if isinstance(att.get("exit_time"), dict) else att.get("exit_time"),
                        "confidence": att.get("confidence", 0),
                        "is_late": att.get("is_late", False),
                        "is_early_exit": att.get("is_early_exit", False),
                        "early_exit_reason": att.get("early_exit_reason"),
                        "created_at": att["createdAt"],
                        "updated_at": att["updatedAt"]
                    } for att in attendance_records]

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
                        "objectId": employee["objectId"],  # Include objectId
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

                        attendance_record = query(
                            "Attendance", where={"objectId": attendance_id}, limit=1)
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
                            # Set id for proper matching in frontend
                            "id": attendance["employee_id"],
                            # Include objectId for proper referencing
                            "objectId": attendance["objectId"],
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
                object_id = data.get("object_id")  # Add support for object_id

                if object_id:
                    # Delete directly by objectId
                    try:
                        # Get employee info before deletion
                        employee = query("Employee", where={
                                         "objectId": object_id}, limit=1)
                        if employee:
                            employee = employee[0]
                            employee_id = employee.get("employee_id")

                            # Delete the employee
                            delete("Employee", object_id)

                            # Broadcast employee deletion
                            await broadcast_attendance_update({
                                "action": "delete_employee",
                                "employee_id": employee_id,
                                "object_id": object_id,
                                "name": employee.get("name", "Unknown"),
                                "timestamp": get_local_time().isoformat()
                            })

                            await websocket.send_json({
                                "status": "success",
                                "message": "Employee deleted successfully"
                            })
                        else:
                            await websocket.send_json({
                                "status": "error",
                                "message": "Employee not found with provided objectId"
                            })
                    except Exception as e:
                        logger.error(
                            f"Error deleting employee by objectId: {str(e)}")
                        await websocket.send_json({
                            "status": "error",
                            "message": f"Error deleting employee: {str(e)}"
                        })
                elif employee_id:
                    # Define delete employee operation for thread pool
                    def delete_employee_record():
                        # Get employee info before deletion
                        employee = query("Employee", where={
                                         "employee_id": employee_id}, limit=1)
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
                            "object_id": employee.get("objectId", ""),
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
                else:
                    await websocket.send_json({
                        "status": "error",
                        "message": "No employee_id or object_id provided for deletion"
                    })

            elif data.get("type") == "register_employee":
                # Register new employee
                employee_id = data.get("employee_id")
                name = data.get("name")
                image_data = data.get("image")
                position = data.get("position")
                department = data.get("department")
                status = data.get("status")
                phone_number = data.get("phone_number")
                email = data.get("email")
                is_admin = data.get("is_admin")

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
                            "status": status,
                            "phone_number": phone_number,
                            "email": email,
                            "is_admin": is_admin
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

            elif data.get("type") == "process_image":
                # Check if we've reached the limit of concurrent tasks for this client
                with client_pending_tasks_lock:
                    if client_pending_tasks[client_id] >= MAX_CONCURRENT_TASKS_PER_CLIENT:
                        await websocket.send_json({
                            "status": "error",
                            "message": "Too many concurrent tasks. Please wait for previous tasks to complete."
                        })
                        continue

                    # Increment the counter for pending tasks
                    client_pending_tasks[client_id] += 1

                try:
                    # Get the base64 encoded image and decode it
                    image_data = data.get("image", "").split(",")[-1]
                    entry_type = data.get("entry_type", "entry")

                    # Decode base64 image
                    img_bytes = base64.b64decode(image_data)
                    nparr = np.frombuffer(img_bytes, np.uint8)
                    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                    # Save the image for debugging (optional)
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    image_path = os.path.join(
                        IMAGES_DIR, f"{client_id}_{timestamp}.jpg")
                    cv2.imwrite(image_path, img)

                    # Get process pool executor
                    process_pool = get_process_pool()

                    # Check if process pool is usable
                    if process_pool is None or process_pool._broken:
                        logger.warning(
                            "Process pool is broken or None, creating a new one")
                        process_pool = create_new_process_pool()

                        # If we couldn't create a new pool, return an error
                        if process_pool is None:
                            logger.error("Failed to create a new process pool")
                            await websocket.send_json({
                                "status": "error",
                                "message": "Server processing error. Please try again later."
                            })

                            # Decrement the counter for pending tasks
                            with client_pending_tasks_lock:
                                client_pending_tasks[client_id] -= 1

                            continue

                    # Submit the task to the process pool
                    try:
                        future = process_pool.submit(
                            process_image_in_process,
                            img,
                            'entry',  # Always use 'entry' regardless of what client sends
                            client_id
                        )

                        # Store the future in pending futures
                        pending_futures = get_pending_futures()
                        pending_futures[future] = client_id

                        # Add a callback to handle the future's completion
                        future.add_done_callback(
                            lambda f: handle_future_completion(f, client_id))

                        logger.info(
                            f"Submitted image processing task for client {client_id}")
                    except Exception as e:
                        # Handle broken process pool
                        logger.error(
                            f"Error submitting image processing task: {str(e)}")

                        # Try to create a new process pool
                        if "process pool is not usable anymore" in str(e):
                            logger.warning(
                                "Attempting to create a new process pool")
                            process_pool = create_new_process_pool()

                            # If we successfully created a new pool, try again
                            if process_pool is not None:
                                try:
                                    future = process_pool.submit(
                                        process_image_in_process,
                                        img,
                                        'entry',  # Always use 'entry' regardless of what client sends
                                        client_id
                                    )

                                    # Store the future in pending futures
                                    pending_futures = get_pending_futures()
                                    pending_futures[future] = client_id

                                    # Add a callback to handle the future's completion
                                    future.add_done_callback(
                                        lambda f: handle_future_completion(f, client_id))

                                    logger.info(
                                        f"Resubmitted image processing task for client {client_id} with new process pool")
                                    continue
                                except Exception as e2:
                                    logger.error(
                                        f"Error resubmitting task with new process pool: {str(e2)}")

                        # Decrement the counter for pending tasks
                        with client_pending_tasks_lock:
                            client_pending_tasks[client_id] -= 1

                        await websocket.send_json({
                            "status": "error",
                            "message": "Error processing image. Please try again."
                        })
                except Exception as e:
                    logger.error(f"Error processing image: {str(e)}")

                    # Decrement the counter for pending tasks
                    with client_pending_tasks_lock:
                        client_pending_tasks[client_id] -= 1

                    await websocket.send_json({
                        "status": "error",
                        "message": "Error processing image. Please try again."
                    })

            elif data.get("type") == "ping":
                # Respond to ping
                await websocket.send_json({"type": "pong"})

            elif data.get("type") == "streaming_image" or "image" in data and data.get("streaming", False):
                # Handle streaming images - these need faster processing with less overhead
                # Check if client has too many pending tasks
                with client_pending_tasks_lock:
                    if client_pending_tasks[client_id] >= MAX_CONCURRENT_TASKS_PER_CLIENT:
                        await websocket.send_json({
                            "status": "queued",
                            "message": f"Processing queue full. Please wait.",
                            "timestamp": get_local_time().isoformat()
                        })
                        continue

                    # Increment the counter for pending tasks
                    client_pending_tasks[client_id] += 1

                try:
                    # Send confirmation that we received the image and are processing it
                    await websocket.send_json({
                        "status": "processing",
                        "message": "Processing image...",
                        "timestamp": get_local_time().isoformat(),
                        "is_streaming": True
                    })

                    # Get the base64 encoded image
                    image_data = data.get("image", "")
                    if "," in image_data:
                        image_data = image_data.split(",")[1]

                    entry_type = data.get("entry_type", "entry")

                    # Decode base64 image
                    img_bytes = base64.b64decode(image_data)
                    nparr = np.frombuffer(img_bytes, np.uint8)
                    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                    if img is None:
                        logger.error(
                            f"Failed to decode streaming image for client {client_id}")
                        await websocket.send_json({
                            "status": "error",
                            "message": "Failed to decode image"
                        })

                        # Decrement the counter for pending tasks
                        with client_pending_tasks_lock:
                            client_pending_tasks[client_id] -= 1

                        continue

                    # Get process pool executor
                    process_pool = get_process_pool()

                    # Check if process pool is usable
                    if process_pool is None or process_pool._broken:
                        logger.warning(
                            "Process pool is broken or None during streaming, creating a new one")
                        process_pool = create_new_process_pool()

                        # If we couldn't create a new pool, handle locally
                        if process_pool is None:
                            logger.error(
                                "Failed to create a new process pool for streaming, using local processing")
                            # Use the face recognition object directly
                            face_recognition = get_face_recognition()

                            # Get face embeddings
                            face_embeddings = face_recognition.get_embeddings(
                                img)
                            if not face_embeddings:
                                await websocket.send_json({
                                    "status": "no_face_detected"
                                })

                                # Decrement the counter for pending tasks
                                with client_pending_tasks_lock:
                                    client_pending_tasks[client_id] -= 1

                                continue

                            # Get employees
                            employees = get_cached_employees()

                            # Find matches
                            matches = face_recognition.find_matches_for_embeddings(
                                face_embeddings, employees)
                            if not matches:
                                await websocket.send_json({
                                    "status": "no_matching_users"
                                })

                                # Decrement the counter for pending tasks
                                with client_pending_tasks_lock:
                                    client_pending_tasks[client_id] -= 1

                                continue

                            # Process each match
                            processed_employees = []
                            for match in matches:
                                employee = match['employee']
                                similarity = match['similarity']

                                # Process attendance with auto-exit detection
                                try:
                                    result = process_attendance_for_employee(
                                        employee, similarity, 'entry')
                                    if result["processed_employee"]:
                                        processed_employees.append(
                                            result["processed_employee"])
                                except Exception as e:
                                    logger.error(
                                        f"Error processing attendance: {str(e)}")
                                    # Fallback to simple format for streaming
                                    similarity_percent = round(
                                        similarity * 100, 1)
                                    processed_employees.append({
                                        "name": employee.get("name"),
                                        "employee_id": employee.get("employee_id"),
                                        "similarity_percent": similarity_percent,
                                        "confidence_str": f"{similarity_percent}%",
                                        "detection_time": get_local_time().isoformat(),
                                        "is_streaming": True
                                    })

                            await websocket.send_json({
                                "multiple_users": True,
                                "users": processed_employees,
                                "is_streaming": True
                            })

                            # Decrement the counter for pending tasks
                            with client_pending_tasks_lock:
                                client_pending_tasks[client_id] -= 1

                            continue

                    # Submit the task to the process pool
                    try:
                        future = process_pool.submit(
                            process_image_in_process,
                            img,  # Pass numpy array directly
                            'entry',  # Always use 'entry' regardless of what client sends
                            client_id
                        )

                        # Store the future in pending futures
                        pending_futures = get_pending_futures()
                        pending_futures[future] = client_id

                        # Add a callback to handle the future's completion
                        future.add_done_callback(
                            lambda f: handle_future_completion(f, client_id))

                        logger.info(
                            f"Submitted streaming image processing task for client {client_id}")
                    except Exception as e:
                        # Handle broken process pool
                        logger.error(
                            f"Error submitting streaming image processing task: {str(e)}")

                        # Try to create a new process pool
                        if "process pool is not usable anymore" in str(e):
                            logger.warning(
                                "Attempting to create a new process pool for streaming")
                            process_pool = create_new_process_pool()

                            # If we successfully created a new pool, try again
                            if process_pool is not None:
                                try:
                                    future = process_pool.submit(
                                        process_image_in_process,
                                        img,
                                        'entry',  # Always use 'entry' regardless of what client sends
                                        client_id
                                    )

                                    # Store the future in pending futures
                                    pending_futures = get_pending_futures()
                                    pending_futures[future] = client_id

                                    # Add a callback to handle the future's completion
                                    future.add_done_callback(
                                        lambda f: handle_future_completion(f, client_id))

                                    logger.info(
                                        f"Resubmitted streaming image processing task for client {client_id} with new process pool")
                                    continue
                                except Exception as e2:
                                    logger.error(
                                        f"Error resubmitting streaming task with new process pool: {str(e2)}")

                        # Decrement the counter for pending tasks
                        with client_pending_tasks_lock:
                            client_pending_tasks[client_id] -= 1

                        await websocket.send_json({
                            "status": "error",
                            "message": "Error processing image. Please try again."
                        })
                except Exception as e:
                    logger.error(f"Error processing streaming image: {str(e)}")

                    # Decrement the counter for pending tasks
                    with client_pending_tasks_lock:
                        client_pending_tasks[client_id] -= 1

                    await websocket.send_json({
                        "status": "error",
                        "message": "Error processing image. Please try again."
                    })

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
        active_connections.pop(client_id, None)

        # Clean up pending tasks
        with client_pending_tasks_lock:
            if client_id in client_pending_tasks:
                logger.info(
                    f"Cleaning up {client_pending_tasks[client_id]} pending tasks for client {client_id}")
                del client_pending_tasks[client_id]

        # Clean up any pending futures for this client
        pending_futures = get_pending_futures()
        for future, future_client_id in list(pending_futures.items()):
            if future_client_id == client_id:
                del pending_futures[future]

        logger.info(
            f"WebSocket connection {client_id} closed. Total connections: {len(active_connections)}")
