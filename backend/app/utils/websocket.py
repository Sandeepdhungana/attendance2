import asyncio
import logging
import concurrent.futures
from typing import Dict, Any
from fastapi import WebSocket
from ..dependencies import get_active_connections, get_queues, get_client_tasks, get_pending_futures
from ..utils.time_utils import get_local_time

logger = logging.getLogger(__name__)

# Create a thread pool executor for I/O operations
thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=10)

async def _send_message_to_client(websocket: WebSocket, message: Dict[str, Any], client_id: str = None) -> bool:
    """Send message to a client and return success status"""
    try:
        # Use the event loop to run the send operation directly
        await websocket.send_json(message)
        if client_id:
            logger.debug(f"Successfully sent message to client {client_id}: {message.get('type', 'unknown')}")
        return True
    except Exception as e:
        if client_id:
            logger.error(f"Error sending message to client {client_id}: {str(e)}")
        return False

async def broadcast_attendance_update(attendance_data: Dict[str, Any]):
    """Broadcast attendance updates to all connected clients"""
    active_connections = get_active_connections()
    if not active_connections:
        logger.info("No active connections to broadcast to")
        return

    # Check if this is a list or a single item
    if isinstance(attendance_data, list):
        data_list = attendance_data
    else:
        data_list = [attendance_data]
    
    # Don't broadcast streaming detections or non-actionable updates
    non_streaming_updates = []
    for data in data_list:
        # Skip updates with is_streaming flag
        if data.get("is_streaming", False):
            continue
            
        # Skip updates with action "update" or "info" - these don't represent actual changes
        if data.get("action") in ["update", "info"]:
            continue
            
        # Ensure objectId is included if this is a deletion
        if data.get("action") == "delete" and "objectId" not in data:
            logger.warning("Missing objectId in delete attendance update")
            if "attendance_id" in data:
                data["objectId"] = data["attendance_id"]
                
        # Add to broadcast list
        non_streaming_updates.append(data)
    
    if not non_streaming_updates:
        return
    
    # Create a message with the attendance update
    message = {
        "type": "attendance_update",
        "data": non_streaming_updates if len(non_streaming_updates) > 1 else non_streaming_updates[0]
    }

    # Log the broadcast
    logger.info(f"Broadcasting attendance update to {len(active_connections)} clients: {non_streaming_updates}")

    # Send to all connected clients using gather to process in parallel
    send_tasks = []
    for client_id, websocket in active_connections.items():
        send_tasks.append(_send_message_to_client(websocket, message, client_id))
    
    # Wait for all tasks to complete and get results
    results = await asyncio.gather(*send_tasks, return_exceptions=True)
    
    # Remove any disconnected clients
    disconnected_clients = [client_id for i, client_id in enumerate(active_connections.keys()) 
                           if isinstance(results[i], Exception) or results[i] is False]
    
    for client_id in disconnected_clients:
        if client_id in active_connections:
            del active_connections[client_id]
            logger.info(f"Removed disconnected client {client_id}. Total connections: {len(active_connections)}")

async def send_notification(websocket: WebSocket, message: str, notification_type: str = "info", client_id: str = None) -> bool:
    """Send a notification message to the client"""
    notification = {
        "type": "notification",
        "notification_type": notification_type,
        "message": message
    }
    return await _send_message_to_client(websocket, notification, client_id)

async def ping_client(websocket: WebSocket):
    """Send periodic ping messages to keep the connection alive"""
    try:
        while True:
            await asyncio.sleep(30)  # PING_INTERVAL
            success = await _send_message_to_client(websocket, {"type": "ping"})
            if not success:
                break
    except asyncio.CancelledError:
        logger.info("Ping task cancelled")
    except Exception as e:
        logger.error(f"Ping task error: {str(e)}")

async def process_queue():
    """Process the queue and broadcast updates to all connected clients"""
    processing_results_queue, _ = get_queues()
    while True:
        try:
            # Check if there are any items in the queue
            if not processing_results_queue.empty():
                # Get the next item from the queue
                item = processing_results_queue.get()

                # Process the item based on its type
                if item.get("type") == "attendance_update":
                    # Broadcast the attendance update
                    await broadcast_attendance_update(item.get("data", []))

                # Mark the task as done
                processing_results_queue.task_done()

            # Sleep for a short time to avoid busy waiting
            await asyncio.sleep(0.1)
        except Exception as e:
            logger.error(f"Error processing queue: {str(e)}")
            # Sleep for a longer time if there was an error
            await asyncio.sleep(1)

async def process_websocket_responses():
    """Process the websocket responses queue and send responses to clients"""
    _, websocket_responses_queue = get_queues()
    active_connections = get_active_connections()
    
    while True:
        try:
            # Check if there are any items in the queue
            if not websocket_responses_queue.empty():
                # Get the next item from the queue
                item = websocket_responses_queue.get()
                client_id = item["client_id"]

                # Check if the client is still connected
                if client_id not in active_connections:
                    logger.info(f"Skipping response to disconnected client {client_id}")
                    websocket_responses_queue.task_done()
                    continue

                websocket = active_connections[client_id]
                
                # Handle real-time detection messages
                if item.get("type") == "real_time_detection" or (item.get("processed_users") and any(user.get("is_streaming", False) for user in item.get("processed_users", []))):
                    # This is a streaming response
                    is_streaming = True
                    
                    # Extract processed users for streaming format
                    processed_users = item.get("processed_users", [])
                    streaming_users = []
                    
                    for user in processed_users:
                        # Format for streaming
                        similarity_percent = user.get("similarity_percent", user.get("similarity", 0) * 100)
                        streaming_users.append({
                            "name": user.get("name"),
                            "employee_id": user.get("employee_id", user.get("user_id")),
                            "similarity_percent": similarity_percent,
                            "confidence_str": f"{similarity_percent}%",
                            "detection_time": user.get("detection_time", get_local_time().isoformat()),
                            "is_streaming": True
                        })
                    
                    if streaming_users:
                        logger.info(f"Sending streaming response to client {client_id}: {len(streaming_users)} users detected")
                        await _send_message_to_client(
                            websocket, 
                            {
                                "multiple_users": True,
                                "users": streaming_users,
                                "is_streaming": True
                            },
                            client_id
                        )
                    else:
                        if item.get("no_face_count", 0) > 0:
                            await _send_message_to_client(
                                websocket,
                                {"status": "no_face_detected", "is_streaming": True},
                                client_id
                            )
                        else:
                            await _send_message_to_client(
                                websocket,
                                {"status": "no_matching_users", "is_streaming": True},
                                client_id
                            )
                    
                    websocket_responses_queue.task_done()
                    continue
                
                # Handle notification messages
                if item.get("type") == "notification":
                    await _send_message_to_client(
                        websocket,
                        {
                            "type": "notification",
                            "notification_type": item.get("notification_type", "info"),
                            "message": item.get("message", "")
                        },
                        client_id
                    )
                    websocket_responses_queue.task_done()
                    continue

                # Check if this is an error response
                if "error" in item:
                    success = await _send_message_to_client(
                        websocket, 
                        {"status": "processing_error", "message": item["error"]},
                        client_id
                    )
                    # Send notification for error
                    await send_notification(websocket, f"Error processing: {item['error']}", "error", client_id)
                    if not success and client_id in active_connections:
                        del active_connections[client_id]
                    websocket_responses_queue.task_done()
                    continue

                # Process the results
                processed_users = item["processed_users"]
                attendance_updates = item["attendance_updates"]
                last_recognized_users = item.get("last_recognized_users", {})

                if not processed_users:
                    if item["no_face_count"] > 0:
                        # No face detected
                        success = await _send_message_to_client(
                            websocket,
                            {"status": "no_face_detected"},
                            client_id
                        )
                        # Send notification for no face detected
                        await send_notification(websocket, "No face detected in the image", "warning", client_id)
                        if not success and client_id in active_connections:
                            del active_connections[client_id]
                    else:
                        # No matching users found
                        success = await _send_message_to_client(
                            websocket,
                            {"status": "no_matching_users"},
                            client_id
                        )
                        # Send notification for no matching users
                        await send_notification(websocket, "No matching users found", "warning", client_id)
                        if not success and client_id in active_connections:
                            del active_connections[client_id]
                else:
                    # Send response with all processed users to the current client
                    success = await _send_message_to_client(
                        websocket,
                        {
                            "multiple_users": True,
                            "users": processed_users
                        },
                        client_id
                    )
                    if not success and client_id in active_connections:
                        del active_connections[client_id]

                # Mark the task as done
                websocket_responses_queue.task_done()

            # Sleep for a short time to avoid busy waiting
            await asyncio.sleep(0.1)
        except Exception as e:
            logger.error(f"Error processing websocket responses: {str(e)}")
            # Sleep for a longer time if there was an error
            await asyncio.sleep(1)

def handle_future_completion(future, client_id):
    """Handle the completion of a future from the process pool"""
    client_pending_tasks, client_pending_tasks_lock = get_client_tasks()
    pending_futures = get_pending_futures()
    processing_results_queue, websocket_responses_queue = get_queues()
    active_connections = get_active_connections()
    
    try:
        processed_users, attendance_updates, last_recognized_users, no_face_count = future.result()
        
        # Create real-time detection notifications to send via the response queue
        real_time_notifications = []
        
        # For face detections with confidence
        if processed_users and client_id in active_connections:
            for user in processed_users:
                # Get formatted confidence value
                confidence = user.get('similarity', 0)
                confidence_percent = user.get('similarity_percent', None)
                
                if confidence_percent is None:
                    # Calculate percentage if not already present
                    confidence_percent = round(confidence * 100, 1) if isinstance(confidence, float) else confidence
                
                confidence_str = f"{confidence_percent}%"
                
                # Improved name extraction from user data
                employee_id = user.get('employee_id', '')
                employee_name = user.get('name', '')
                
                # If name is still empty, try other possible fields
                if not employee_name:
                    if user.get('employee_name'):
                        employee_name = user.get('employee_name')
                    elif 'message' in user and 'detected' in user['message'].lower():
                        # Try to extract name from message if it contains "detected"
                        parts = user['message'].split(':')
                        if len(parts) > 1:
                            employee_name = parts[1].strip()
                
                # If we still don't have a name but have an ID, fetch from last_recognized_users
                if not employee_name and employee_id and employee_id in last_recognized_users:
                    employee_data = last_recognized_users[employee_id].get('employee', {})
                    if employee_data.get('name'):
                        employee_name = employee_data.get('name')
                
                # Finally, if all else fails, use "Unknown"
                if not employee_name:
                    logger.warning(f"Could not determine name for employee ID {employee_id}. User data: {user}")
                    employee_name = "Unknown"
                
                # Create real-time detection notification
                real_time_detection = {
                    "type": "real_time_detection",
                    "name": employee_name,
                    "employee_id": employee_id,
                    "confidence": confidence,
                    "confidence_percent": confidence_percent,
                    "confidence_str": confidence_str,
                    "message": user.get('message', ''),
                    "timestamp": get_local_time().isoformat()
                }
                
                # Add to notifications to be queued
                real_time_notifications.append(real_time_detection)
                
                logger.info(f"Created real-time detection for {employee_name} ({employee_id}) - Confidence: {confidence_str}")
                
                # Also add user-friendly notification
                notification_msg = f"Detected: {employee_name} (ID: {employee_id}) - Confidence: {confidence_str}"
                status_type = "success" if confidence >= 0.7 else "warning"  # Warning for lower confidence
                
                # Queue notification message
                websocket_responses_queue.put({
                    "client_id": client_id,
                    "type": "notification",
                    "notification_type": status_type,
                    "message": notification_msg
                })
        
        # Add no face/no matching users notifications if needed
        elif client_id in active_connections:
            if no_face_count > 0:
                # No face detected notification
                websocket_responses_queue.put({
                    "client_id": client_id,
                    "type": "notification",
                    "notification_type": "warning",
                    "message": "No face detected in image"
                })
            else:
                # No matching users found notification
                websocket_responses_queue.put({
                    "client_id": client_id,
                    "type": "notification",
                    "notification_type": "warning",
                    "message": "No matching users found"
                })
        
        # Add objectId and id to attendance updates if missing
        if attendance_updates:
            for update in attendance_updates:
                if "objectId" not in update and "attendance_id" in update:
                    update["objectId"] = update["attendance_id"]
                if "id" not in update and "employee_id" in update:
                    update["id"] = update["employee_id"]

        # Put the results in the websocket responses queue
        websocket_responses_queue.put({
            "client_id": client_id,
            "processed_users": processed_users,
            "attendance_updates": attendance_updates,
            "last_recognized_users": last_recognized_users,
            "no_face_count": no_face_count
        })
        
        # Queue each real-time detection separately
        for detection in real_time_notifications:
            logger.info(f"Queuing real-time detection for client {client_id}: {detection.get('name')} - {detection.get('confidence_str')}")
            websocket_responses_queue.put({
                "client_id": client_id,
                **detection
            })
        
        # Also put attendance updates in the processing results queue for broadcasting
        # Filter out non-actionable updates to avoid duplicates
        if attendance_updates:
            # Only broadcast attendance updates that represent actual changes
            # Specifically, filter out updates with action "update" or "info"
            actionable_updates = [
                update for update in attendance_updates 
                if update.get("action") not in ["update", "info"]
                and not update.get("is_streaming", False)
            ]
            
            if actionable_updates:
                processing_results_queue.put({
                    "type": "attendance_update",
                    "data": actionable_updates
                })
                logger.info(f"Queued {len(actionable_updates)} actionable attendance updates for broadcasting")
            else:
                logger.info(f"No actionable attendance updates to broadcast")
            
    except Exception as e:
        logger.error(f"Error handling future completion for client {client_id}: {str(e)}")
        # Put error message in the websocket responses queue
        websocket_responses_queue.put({
            "client_id": client_id,
            "error": str(e),
            "processed_users": [],
            "attendance_updates": [],
            "no_face_count": 0
        })
        
        # Also send immediate error notification via queue
        if client_id in active_connections:
            websocket_responses_queue.put({
                "client_id": client_id,
                "type": "notification",
                "notification_type": "error",
                "message": f"Error processing image: {str(e)}"
            })
            
    finally:
        # Always decrement pending tasks counter, regardless of success or failure
        with client_pending_tasks_lock:
            if client_id in client_pending_tasks:
                client_pending_tasks[client_id] = max(0, client_pending_tasks[client_id] - 1)
                logger.info(f"Decreased pending tasks for client {client_id} to {client_pending_tasks[client_id]}")
        
        # Remove future from pending futures
        if future in pending_futures:
            del pending_futures[future]

# Function to gracefully shutdown the thread pool
async def shutdown_thread_pool():
    """Shutdown the thread pool gracefully"""
    logger.info("Shutting down WebSocket thread pool")
    thread_pool.shutdown(wait=True)
    logger.info("WebSocket thread pool shutdown complete") 