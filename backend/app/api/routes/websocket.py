from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import uuid
import logging
import base64
import numpy as np
import cv2
import os
import gc
import psutil
from datetime import datetime
import concurrent.futures
from app.database import query, create, delete
from app.dependencies import (
    get_process_pool,
    get_thread_pool,
    get_pending_futures,
    get_client_tasks,
    get_active_connections,
    get_face_recognition,
    get_cached_employees,
    handle_process_error,
    recreate_process_pool
)
from app.utils.websocket import (
    broadcast_attendance_update,
    handle_future_completion
)
from app.utils.processing import process_image_in_process, process_attendance_for_employee, check_memory_usage, cleanup_resources
from app.utils.time_utils import get_local_time
from app.config import IMAGES_DIR, MAX_CONCURRENT_TASKS_PER_CLIENT

logger = logging.getLogger(__name__)

router = APIRouter()

# Memory thresholds for streaming operations
MAX_MEMORY_FOR_STREAMING = 90  # percent
MAX_MEMORY_FOR_REGULAR = 95    # percent

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

            # Log initial memory stats for every message received
            memory_status = check_memory_usage()
            if memory_status["percent_used"] > 80:
                logger.warning(f"High memory usage on client {client_id} request: {memory_status['percent_used']}% used")

            if data.get("type") == "get_attendance":
                # Check memory before heavy operation
                if check_memory_usage()["is_critical"]:
                    await websocket.send_json({
                        "status": "error",
                        "message": "Server is under high load. Please try again later.",
                        "details": "memory_critical"
                    })
                    continue

                # Rest of the fetch_attendance code...
                def fetch_attendance():
                    try:
                        attendance_records = query("Attendance")
                        return [{
                            "name": query("Employee", where={"employee_id": att["employee_id"]}, limit=1)[0].get("name") if query("Employee", where={"employee_id": att["employee_id"]}, limit=1) else "Unknown",
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
                    except Exception as e:
                        logger.error(f"Error fetching attendance: {str(e)}")
                        return []
                    finally:
                        # Clean up after heavy database operation
                        cleanup_resources()

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

            elif data.get("type") == "image" and not data.get("streaming", False):
                # Check memory before processing
                memory_status = check_memory_usage()
                if memory_status["percent_used"] > MAX_MEMORY_FOR_REGULAR:
                    await websocket.send_json({
                        "status": "error",
                        "message": "Server is under high load. Please try again later.",
                        "details": "memory_critical"
                    })
                    continue

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
                        "timestamp": get_local_time().isoformat()
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
                        logger.error(f"Failed to decode image for client {client_id}")
                        await websocket.send_json({
                            "status": "error",
                            "message": "Failed to decode image"
                        })

                        # Decrement the counter for pending tasks
                        with client_pending_tasks_lock:
                            client_pending_tasks[client_id] -= 1

                        continue

                    # Save the image for debugging (optional)
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    image_path = os.path.join(
                        IMAGES_DIR, f"{client_id}_{timestamp}.jpg")
                    cv2.imwrite(image_path, img)

                    # Get process pool executor
                    process_pool = get_process_pool()

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

                        logger.info(f"Submitted image processing task for client {client_id}")
                    except Exception as e:
                        # Handle broken process pool
                        logger.error(f"Error submitting image processing task: {str(e)}")

                        # Try to recreate the process pool
                        try:
                            recreate_process_pool(reason=f"Submission error: {str(e)}")
                            process_pool = get_process_pool()
                            
                            # Check if memory is still available for processing
                            if check_memory_usage()["is_critical"]:
                                logger.error("Memory critical after process pool recreation")
                                raise Exception("Memory critical, cannot process request")
                            
                            # Try resubmitting the task
                            future = process_pool.submit(
                                process_image_in_process,
                                img,
                                'entry', 
                                client_id
                            )

                            # Store the future in pending futures
                            pending_futures = get_pending_futures()
                            pending_futures[future] = client_id

                            # Add a callback to handle the future's completion
                            future.add_done_callback(
                                lambda f: handle_future_completion(f, client_id))

                            logger.info(f"Resubmitted image processing task for client {client_id}")
                            continue
                        except Exception as e2:
                            logger.error(f"Failed to recover after error: {str(e2)}")
                            
                            # Handle the error and generate a response
                            error_response = handle_process_error(client_id, e2)
                            
                            # Decrement the counter for pending tasks
                            with client_pending_tasks_lock:
                                client_pending_tasks[client_id] -= 1

                            await websocket.send_json({
                                "status": "error",
                                "message": "Server processing error. Please try again later.",
                                "details": str(e2)
                            })
                except Exception as e:
                    logger.error(f"Error processing image: {str(e)}")

                    # Clean up resources
                    cleanup_resources()
                    
                    # Decrement the counter for pending tasks
                    with client_pending_tasks_lock:
                        client_pending_tasks[client_id] -= 1

                    await websocket.send_json({
                        "status": "error",
                        "message": "Error processing image. Please try again.",
                        "details": str(e)
                    })

            elif data.get("type") == "ping":
                # Respond to ping
                await websocket.send_json({"type": "pong"})

            elif data.get("type") == "streaming_image" or "image" in data and data.get("streaming", False):
                # Check memory before streaming operation
                memory_status = check_memory_usage()
                if memory_status["percent_used"] > MAX_MEMORY_FOR_STREAMING:
                    await websocket.send_json({
                        "status": "error",
                        "message": "Server is under high load. Streaming paused.",
                        "details": "memory_critical",
                        "should_pause": True
                    })
                    # Force cleanup
                    cleanup_resources()
                    continue

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
                        "message": "Processing streaming image...",
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
                        logger.error(f"Failed to decode streaming image for client {client_id}")
                        await websocket.send_json({
                            "status": "error",
                            "message": "Failed to decode image"
                        })

                        # Decrement the counter for pending tasks
                        with client_pending_tasks_lock:
                            client_pending_tasks[client_id] -= 1
                        
                        # Clean up resources
                        cleanup_resources()
                        continue

                    # Get process pool executor
                    process_pool = get_process_pool()

                    # Submit the task to the process pool
                    try:
                        future = process_pool.submit(
                            process_image_in_process,
                            img,  # Pass numpy array directly
                            'entry',  # We always use 'entry' type now, backend handles exit detection
                            client_id
                        )

                        # Store the future in pending futures
                        pending_futures = get_pending_futures()
                        pending_futures[future] = client_id

                        # Add a callback to handle the future's completion
                        future.add_done_callback(lambda f: handle_future_completion(
                            f, client_id, is_streaming=True))

                    except Exception as e:
                        logger.error(f"Error submitting streaming task: {str(e)}")
                        
                        try:
                            # Try recreating the process pool
                            recreate_process_pool(reason=f"Streaming error: {str(e)}")
                            process_pool = get_process_pool()
                            
                            future = process_pool.submit(
                                process_image_in_process,
                                img,
                                'entry',
                                client_id
                            )
                            
                            # Store the future in pending futures
                            pending_futures = get_pending_futures()
                            pending_futures[future] = client_id
                            
                            # Add a callback to handle the future's completion
                            future.add_done_callback(lambda f: handle_future_completion(
                                f, client_id, is_streaming=True))
                                
                        except Exception as e2:
                            logger.error(f"Error resubmitting streaming task: {str(e2)}")
                            
                            # Clean up resources
                            cleanup_resources()
                            
                            # Decrement the counter for pending tasks
                            with client_pending_tasks_lock:
                                client_pending_tasks[client_id] -= 1
                                
                            await websocket.send_json({
                                "status": "error",
                                "message": "Server processing error",
                                "details": str(e2),
                                "is_streaming": True
                            })
                            
                except Exception as e:
                    logger.error(f"Error in streaming image processing: {str(e)}")
                    
                    # Clean up resources
                    cleanup_resources()
                    
                    # Decrement the counter for pending tasks
                    with client_pending_tasks_lock:
                        client_pending_tasks[client_id] -= 1
                        
                    await websocket.send_json({
                        "status": "error",
                        "message": "Image processing error",
                        "details": str(e),
                        "is_streaming": True
                    })
                    
            else:
                logger.warning(f"Unknown message type from client {client_id}: {data.get('type', 'unknown')}")
                await websocket.send_json({
                    "status": "error",
                    "message": "Unknown message type"
                })

    except WebSocketDisconnect:
        logger.info(f"WebSocket client {client_id} disconnected")
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {str(e)}")
    finally:
        # Clean up when client disconnects
        logger.info(f"Cleaning up resources for client {client_id}")
        
        # Remove client from active connections
        if client_id in active_connections:
            del active_connections[client_id]
            
        # Remove client from pending tasks counter
        with client_pending_tasks_lock:
            if client_id in client_pending_tasks:
                del client_pending_tasks[client_id]
                
        # Perform garbage collection
        cleanup_resources()
        
        logger.info(f"Client {client_id} cleanup complete. Remaining connections: {len(active_connections)}")
