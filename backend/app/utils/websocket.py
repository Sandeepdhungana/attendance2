import asyncio
import logging
import concurrent.futures
import gc
import weakref
import time
from typing import Dict, Any, Optional, Set
from fastapi import WebSocket
from ..dependencies import get_active_connections, get_queues, get_client_tasks, get_pending_futures
from ..utils.time_utils import get_local_time

logger = logging.getLogger(__name__)

# Memory optimization constants
MAX_QUEUE_SIZE = 50  # Reduced from 100 to prevent memory accumulation
MAX_FUTURES_PER_CLIENT = 3  # Limit concurrent futures per client
CLEANUP_INTERVAL = 30  # Cleanup every 30 seconds (increased frequency)
MEMORY_CHECK_INTERVAL = 30  # Check memory every 15 seconds (increased frequency)
MAX_INACTIVE_CONNECTIONS = 100  # Max inactive connections to track
PING_INTERVAL = 30  # Ping interval in seconds
MAX_FAILED_PINGS = 3  # Max failed pings before cleanup

# Create a thread pool executor for I/O operations with limited workers
thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=5, thread_name_prefix="ws_io")

# Store the main event loop for use in threads
_main_loop = None
_shutdown_event = asyncio.Event()

# Memory monitoring
_last_cleanup = time.time()
_last_memory_check = time.time()

# Connection health tracking
_connection_health: Dict[str, Dict] = {}

def set_main_loop(loop):
    """Set the main event loop for use in thread pool functions"""
    global _main_loop, _shutdown_event
    _main_loop = loop
    _shutdown_event = asyncio.Event()
    logger.info(f"Main event loop set: {loop} (running: {loop.is_running()})")

def get_main_loop():
    """Get the main event loop"""
    global _main_loop
    if _main_loop is None:
        raise RuntimeError("Main event loop not set. Call set_main_loop() during application startup.")
    return _main_loop

def signal_shutdown():
    """Signal all background tasks to shutdown"""
    global _shutdown_event
    if _shutdown_event and not _shutdown_event.is_set():
        _shutdown_event.set()
        logger.info("Shutdown signal sent to all background tasks")

def _clear_queue_sliding_window_sync(queue, queue_name, max_size=50, clear_percentage=0.3):
    """Clear queue using sliding window approach when full (synchronous version)"""
    try:
        current_size = queue.qsize()
        if current_size >= max_size:
            # Calculate how many items to remove (30% by default)
            items_to_remove = max(1, int(current_size * clear_percentage))
            
            # Remove old items (FIFO)
            removed_count = 0
            for _ in range(items_to_remove):
                try:
                    queue.get_nowait()
                    removed_count += 1
                except:
                    break
            
            logger.warning(f"{queue_name} queue full ({current_size} items), cleared {removed_count} old items (sliding window)")
            return True
        return False
    except Exception as e:
        logger.error(f"Error clearing {queue_name} queue: {str(e)}")
        return False

async def _clear_queue_sliding_window(queue, queue_name, max_size=50, clear_percentage=0.3):
    """Clear queue using sliding window approach when full (async version)"""
    return _clear_queue_sliding_window_sync(queue, queue_name, max_size, clear_percentage)

async def _cleanup_resources():
    """Perform periodic cleanup of resources to prevent memory leaks"""
    global _last_cleanup, _connection_health
    current_time = time.time()
    
    if current_time - _last_cleanup < CLEANUP_INTERVAL:
        return
        
    _last_cleanup = current_time
    logger.debug("Performing periodic resource cleanup")
    
    try:
        # Clean up queues if they're getting full
        processing_results_queue, websocket_responses_queue = get_queues()
        await _clear_queue_sliding_window(processing_results_queue, "processing_results", MAX_QUEUE_SIZE)
        await _clear_queue_sliding_window(websocket_responses_queue, "websocket_responses", MAX_QUEUE_SIZE)
        
        # Cleanup expired futures
        pending_futures = get_pending_futures()
        expired_futures = []
        for future in list(pending_futures.keys()):
            if future.done() or future.cancelled():
                expired_futures.append(future)
        
        for future in expired_futures:
            pending_futures.pop(future, None)
            
        if expired_futures:
            logger.info(f"Cleaned up {len(expired_futures)} expired futures")
        
        # Cleanup inactive connections from health tracking
        active_connections = get_active_connections()
        inactive_clients = []
        for client_id in list(_connection_health.keys()):
            if client_id not in active_connections:
                inactive_clients.append(client_id)
        
        for client_id in inactive_clients:
            _connection_health.pop(client_id, None)
            
        if inactive_clients:
            logger.info(f"Cleaned up {len(inactive_clients)} inactive connection health records")
        
        # Cleanup client tasks for disconnected clients
        client_pending_tasks, client_pending_tasks_lock = get_client_tasks()
        with client_pending_tasks_lock:
            disconnected_clients = []
            for client_id in list(client_pending_tasks.keys()):
                if client_id not in active_connections:
                    disconnected_clients.append(client_id)
            
            for client_id in disconnected_clients:
                client_pending_tasks.pop(client_id, None)
                
        if disconnected_clients:
            logger.info(f"Cleaned up {len(disconnected_clients)} disconnected client task records")
        
        # Force garbage collection periodically
        collected = gc.collect()
        if collected > 0:
            logger.debug(f"Garbage collector freed {collected} objects")
            
    except Exception as e:
        logger.error(f"Error during resource cleanup: {str(e)}")

async def _monitor_memory():
    """Monitor memory usage and trigger cleanup if needed"""
    global _last_memory_check
    current_time = time.time()
    
    if current_time - _last_memory_check < MEMORY_CHECK_INTERVAL:
        return
        
    _last_memory_check = current_time
    
    try:
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        memory_info = process.memory_info()
        memory_mb = memory_info.rss / 1024 / 1024
        
        # Log memory usage every few checks
        if int(current_time) % (MEMORY_CHECK_INTERVAL * 5) == 0:
            logger.info(f"Memory usage: {memory_mb:.1f} MB")
        
        # If memory usage is high, trigger aggressive cleanup
        if memory_mb > 800:  # 800MB threshold (reduced for more aggressive cleanup)
            logger.warning(f"High memory usage detected: {memory_mb:.1f} MB, triggering aggressive cleanup")
            # Clear queues more aggressively when memory is high
            processing_results_queue, websocket_responses_queue = get_queues()
            await _clear_queue_sliding_window(processing_results_queue, "processing_results", MAX_QUEUE_SIZE // 2, 0.5)
            await _clear_queue_sliding_window(websocket_responses_queue, "websocket_responses", MAX_QUEUE_SIZE // 2, 0.5)
            await _cleanup_resources()
            gc.collect()
            
    except ImportError:
        # psutil not available, skip memory monitoring
        pass
    except Exception as e:
        logger.error(f"Error monitoring memory: {str(e)}")

async def _send_message_to_client(websocket: WebSocket, message: Dict[str, Any], client_id: str = None) -> bool:
    """Send message to a client and return success status with connection health tracking"""
    try:
        # Update connection health
        if client_id:
            if client_id not in _connection_health:
                _connection_health[client_id] = {"last_success": time.time(), "failed_pings": 0}
            _connection_health[client_id]["last_success"] = time.time()
            _connection_health[client_id]["failed_pings"] = 0
        
        await websocket.send_json(message)
        if client_id:
            logger.debug(f"Successfully sent message to client {client_id}: {message.get('type', 'unknown')}")
        return True
    except Exception as e:
        if client_id:
            logger.error(f"Error sending message to client {client_id}: {str(e)}")
            # Update connection health
            if client_id in _connection_health:
                _connection_health[client_id]["failed_pings"] = _connection_health[client_id].get("failed_pings", 0) + 1
        return False

async def _cleanup_unhealthy_connections():
    """Remove connections that have failed too many health checks"""
    global _connection_health
    active_connections = get_active_connections()
    
    unhealthy_clients = []
    for client_id, health in _connection_health.items():
        if health.get("failed_pings", 0) >= MAX_FAILED_PINGS:
            unhealthy_clients.append(client_id)
    
    for client_id in unhealthy_clients:
        if client_id in active_connections:
            logger.warning(f"Removing unhealthy connection {client_id}")
            try:
                websocket = active_connections[client_id]
                await websocket.close()
            except:
                pass
            finally:
                active_connections.pop(client_id, None)
                _connection_health.pop(client_id, None)

async def broadcast_attendance_update(attendance_data: Dict[str, Any]):
    """Broadcast attendance updates to all connected clients with memory optimization"""
    active_connections = get_active_connections()
    if not active_connections:
        logger.debug("No active connections to broadcast to")
        return

    # Perform cleanup before broadcasting
    await _cleanup_resources()
    await _monitor_memory()

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
        # But allow "exit_update" as it represents a real exit time change
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
    logger.info(f"Broadcasting attendance update to {len(active_connections)} clients: {len(non_streaming_updates)} updates")

    # Send to all connected clients using gather to process in parallel
    send_tasks = []
    for client_id, websocket in list(active_connections.items()):  # Use list() to avoid dict change during iteration
        send_tasks.append(_send_message_to_client(websocket, message, client_id))
    
    # Wait for all tasks to complete and get results
    if send_tasks:
        try:
            results = await asyncio.gather(*send_tasks, return_exceptions=True)
            
            # Remove any disconnected clients
            disconnected_clients = []
            for i, (client_id, _) in enumerate(list(active_connections.items())):
                if i < len(results) and (isinstance(results[i], Exception) or results[i] is False):
                    disconnected_clients.append(client_id)
            
            for client_id in disconnected_clients:
                if client_id in active_connections:
                    del active_connections[client_id]
                    _connection_health.pop(client_id, None)
                    logger.info(f"Removed disconnected client {client_id}. Total connections: {len(active_connections)}")
                    
        except Exception as e:
            logger.error(f"Error in broadcast gather: {str(e)}")

async def send_notification(websocket: WebSocket, message: str, notification_type: str = "info", client_id: str = None) -> bool:
    """Send a notification message to the client"""
    notification = {
        "type": "notification",
        "notification_type": notification_type,
        "message": message
    }
    return await _send_message_to_client(websocket, notification, client_id)

async def ping_client(websocket: WebSocket, client_id: str = None):
    """Send periodic ping messages to keep the connection alive with health tracking"""
    try:
        while not _shutdown_event.is_set():
            await asyncio.sleep(PING_INTERVAL)
            
            if _shutdown_event.is_set():
                break
                
            success = await _send_message_to_client(websocket, {"type": "ping"}, client_id)
            if not success:
                logger.warning(f"Ping failed for client {client_id}")
                break
                
    except asyncio.CancelledError:
        logger.info(f"Ping task cancelled for client {client_id}")
    except Exception as e:
        logger.error(f"Ping task error for client {client_id}: {str(e)}")

async def process_queue():
    """Process the queue and broadcast updates to all connected clients with proper shutdown handling"""
    logger.info("Starting queue processing task")
    processing_results_queue, _ = get_queues()
    
    while not _shutdown_event.is_set():
        try:
            # Perform periodic cleanup
            await _cleanup_resources()
            await _monitor_memory()
            
            items_processed = 0
            max_items_per_batch = 10  # Process up to 10 items per batch
            
            # Process multiple items per iteration for better throughput
            while not processing_results_queue.empty() and items_processed < max_items_per_batch:
                try:
                    # Get the next item from the queue with timeout
                    item = processing_results_queue.get(timeout=0.1)

                    # Process the item based on its type
                    if item.get("type") == "attendance_update":
                        # Broadcast the attendance update
                        await broadcast_attendance_update(item.get("data", []))

                    # Mark the task as done
                    processing_results_queue.task_done()
                    items_processed += 1
                    
                except Exception as e:
                    if "Empty" not in str(e):  # Ignore timeout/empty queue errors
                        logger.error(f"Error processing queue item: {str(e)}")
                    break

            # Adaptive sleep: shorter if we processed items, longer if queue was empty
            if items_processed > 0:
                await asyncio.sleep(0.05)  # Shorter sleep when processing items
                logger.debug(f"Processed {items_processed} queue items")
            else:
                await asyncio.sleep(0.2)  # Longer sleep when queue is empty
            
        except Exception as e:
            logger.error(f"Error in queue processing loop: {str(e)}")
            # Sleep for a longer time if there was an error
            await asyncio.sleep(1)
    
    logger.info("Queue processing task shutting down")

async def process_websocket_responses():
    """Process the websocket responses queue and send responses to clients with proper shutdown handling"""
    logger.info("Starting websocket response processing task")
    _, websocket_responses_queue = get_queues()
    
    while not _shutdown_event.is_set():
        try:
            # Perform periodic cleanup
            await _cleanup_resources()
            await _monitor_memory()
            await _cleanup_unhealthy_connections()
            
            active_connections = get_active_connections()
            
            items_processed = 0
            max_items_per_batch = 15  # Process up to 15 items per batch
            
            # Process multiple items per iteration for better throughput
            while not websocket_responses_queue.empty() and items_processed < max_items_per_batch:
                try:
                    # Get the next item from the queue with timeout
                    item = websocket_responses_queue.get(timeout=0.1)
                    client_id = item.get("client_id")

                    # Check if the client is still connected
                    if client_id not in active_connections:
                        logger.debug(f"Skipping response to disconnected client {client_id}")
                        websocket_responses_queue.task_done()
                        items_processed += 1
                        continue

                    websocket = active_connections[client_id]
                    
                    # Handle real-time detection messages
                    if item.get("type") == "real_time_detection" or (item.get("processed_users") and any(user.get("is_streaming", False) for user in item.get("processed_users", []))):
                        # This is a streaming response
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
                            logger.debug(f"Sending streaming response to client {client_id}: {len(streaming_users)} users detected")
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

                    # Handle error responses
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
                            _connection_health.pop(client_id, None)
                        websocket_responses_queue.task_done()
                        continue

                    # Handle anti-spoofing failure
                    if item.get("status") == "anti_spoofing_failed":
                        success = await _send_message_to_client(
                            websocket,
                            {
                                "status": "anti_spoofing_failed",
                                "message": item.get("message", "Potential spoofing attempt detected"),
                                "liveness_info": item.get("liveness_info", {}),
                                "is_streaming": item.get("is_streaming", False)
                            },
                            client_id
                        )
                        if not success and client_id in active_connections:
                            del active_connections[client_id]
                            _connection_health.pop(client_id, None)
                        websocket_responses_queue.task_done()
                        continue

                    # Process the results
                    processed_users = item.get("processed_users", [])
                    attendance_updates = item.get("attendance_updates", [])

                    if not processed_users:
                        if item.get("no_face_count", 0) > 0:
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
                                _connection_health.pop(client_id, None)
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
                                _connection_health.pop(client_id, None)
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
                            _connection_health.pop(client_id, None)

                    # Mark the task as done
                    websocket_responses_queue.task_done()
                    items_processed += 1
                    
                except Exception as e:
                    if "Empty" not in str(e):  # Ignore timeout/empty queue errors
                        logger.error(f"Error processing websocket response item: {str(e)}")
                    break

            # Adaptive sleep: shorter if we processed items, longer if queue was empty
            if items_processed > 0:
                await asyncio.sleep(0.03)  # Very short sleep when processing items
                logger.debug(f"Processed {items_processed} websocket response items")
            else:
                await asyncio.sleep(0.15)  # Longer sleep when queue is empty
            
        except Exception as e:
            logger.error(f"Error in websocket response processing loop: {str(e)}")
            # Sleep for a longer time if there was an error
            await asyncio.sleep(1)
    
    logger.info("Websocket response processing task shutting down")

def handle_future_completion(future, client_id):
    """Handle the completion of a future from the process pool with memory optimization"""
    client_pending_tasks, client_pending_tasks_lock = get_client_tasks()
    pending_futures = get_pending_futures()
    processing_results_queue, websocket_responses_queue = get_queues()
    active_connections = get_active_connections()
    
    try:
        # Check if client is still connected before processing
        if client_id not in active_connections:
            logger.debug(f"Client {client_id} disconnected before future completion")
            return
            
        # Limit the number of pending futures per client to prevent memory bloat
        current_futures = sum(1 for f, c_id in pending_futures.items() if c_id == client_id and not f.done())
        if current_futures > MAX_FUTURES_PER_CLIENT:
            logger.warning(f"Client {client_id} has too many pending futures ({current_futures}), skipping")
            return
            
        processed_users, attendance_updates, last_recognized_users, no_face_count = future.result()
        
        # Handle anti-spoofing failure (error code 3)
        if no_face_count == 3:
            # Anti-spoofing failed
            error_message = last_recognized_users.get("message", "Potential spoofing attempt detected")
            liveness_info = last_recognized_users.get("liveness_info", {})
            
            logger.warning(f"Anti-spoofing failed for client {client_id}: {error_message}")
            
            # Send anti-spoofing failure notification directly with connection health check
            if client_id in active_connections:
                websocket = active_connections[client_id]
                try:
                    loop = get_main_loop()
                    # Send anti-spoofing status
                    asyncio.run_coroutine_threadsafe(_send_message_to_client(websocket, {
                        "client_id": client_id,
                        "status": "anti_spoofing_failed",
                        "message": error_message,
                        "liveness_info": liveness_info,
                        "processed_users": [],
                        "attendance_updates": [],
                        "no_face_count": 3
                    }, client_id), loop)
                    
                    # Also send notification
                    asyncio.run_coroutine_threadsafe(_send_message_to_client(websocket, {
                        "client_id": client_id,
                        "type": "notification",
                        "notification_type": "error",
                        "message": f"Security Alert: {error_message}"
                    }, client_id), loop)
                    
                    logger.info(f"✅ Sent anti-spoofing failure directly to {client_id}")
                except Exception as e:
                    logger.error(f"Failed to send anti-spoofing failure to {client_id}: {str(e)}")
                    # Mark connection as unhealthy
                    if client_id in _connection_health:
                        _connection_health[client_id]["failed_pings"] = _connection_health[client_id].get("failed_pings", 0) + 1
            else:
                logger.debug(f"Client {client_id} not in active connections, cannot send anti-spoofing failure")
            
            return
        
        # Create real-time detection notifications with memory optimization
        real_time_notifications = []
        
        # For face detections with confidence - limit processing to prevent memory overload
        if processed_users and client_id in active_connections and len(processed_users) <= 10:  # Limit to 10 users max
            for user in processed_users[:10]:  # Further ensure max 10 users
                # Get formatted confidence value
                confidence = user.get('similarity', 0)
                confidence_percent = user.get('similarity_percent', None)
                
                if confidence_percent is None:
                    # Calculate percentage if not already present
                    confidence_percent = round(confidence * 100, 1) if isinstance(confidence, float) else confidence
                
                confidence_str = f"{confidence_percent}%"
                
                # Simplified name extraction to reduce memory usage
                employee_id = user.get('employee_id', '')
                employee_name = user.get('name', '')
                
                # Basic fallback name resolution (simplified to reduce memory usage)
                if not employee_name:
                    if user.get('employee_name'):
                        employee_name = user.get('employee_name')
                    elif not employee_name and employee_id and employee_id in last_recognized_users:
                        employee_data = last_recognized_users[employee_id].get('employee', {})
                        if employee_data.get('name'):
                            employee_name = employee_data.get('name')
                
                # Finally, if all else fails, use "Unknown"
                if not employee_name:
                    logger.debug(f"Could not determine name for employee ID {employee_id}")
                    employee_name = "Unknown"
                
                # Create optimized real-time detection notification
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
                
                # Add to notifications (limited list)
                real_time_notifications.append(real_time_detection)
                
                # Simplified logging
                if user.get('already_marked', False):
                    logger.debug(f"Real-time detection for already-marked user: {employee_name} ({employee_id})")
                else:
                    logger.debug(f"Real-time detection for {employee_name} ({employee_id}) - {confidence_str}")
                
                # Check if this is an "already marked" case and create specific notification
                if user.get('already_marked', False):
                    # Use the specific streaming message for already marked cases
                    notification_msg = user.get('streaming_message', f"Attendance already marked for {employee_name}")
                    status_type = "info"  # Use info type for already marked cases
                else:
                    # Regular detection notification
                    notification_msg = f"Detected: {employee_name} (ID: {employee_id}) - Confidence: {confidence_str}"
                    status_type = "success" if confidence >= 0.7 else "warning"  # Warning for lower confidence
                
                # Send notification message directly to client with error handling
                if client_id in active_connections:
                    websocket = active_connections[client_id]
                    try:
                        loop = get_main_loop()
                        # Use run_coroutine_threadsafe but don't wait for result to prevent blocking
                        asyncio.run_coroutine_threadsafe(_send_message_to_client(websocket, {
                            "client_id": client_id,
                            "type": "notification",
                            "notification_type": status_type,
                            "message": notification_msg
                        }, client_id), loop)
                        logger.debug(f"✅ Queued notification for {client_id}: {notification_msg[:50]}...")
                    except Exception as e:
                        logger.error(f"Failed to send notification to {client_id}: {str(e)}")
                        # Mark connection as unhealthy
                        if client_id in _connection_health:
                            _connection_health[client_id]["failed_pings"] = _connection_health[client_id].get("failed_pings", 0) + 1
                else:
                    logger.debug(f"Client {client_id} not in active connections, cannot send notification")
        
        # Add no face/no matching users notifications if needed (optimized)
        elif client_id in active_connections:
            websocket = active_connections[client_id]
            if no_face_count > 0:
                # No face detected notification - send directly
                try:
                    loop = get_main_loop()
                    asyncio.run_coroutine_threadsafe(_send_message_to_client(websocket, {
                        "client_id": client_id,
                        "type": "notification",
                        "notification_type": "warning",
                        "message": "No face detected in image"
                    }, client_id), loop)
                    logger.debug(f"✅ Queued no face notification for {client_id}")
                except Exception as e:
                    logger.error(f"Failed to send no face notification to {client_id}: {str(e)}")
                    # Mark connection as unhealthy
                    if client_id in _connection_health:
                        _connection_health[client_id]["failed_pings"] = _connection_health[client_id].get("failed_pings", 0) + 1
            elif not processed_users:
                # Only send "no matching users" if there were no processed users at all
                try:
                    loop = get_main_loop()
                    asyncio.run_coroutine_threadsafe(_send_message_to_client(websocket, {
                        "client_id": client_id,
                        "type": "notification",
                        "notification_type": "warning", 
                        "message": "No matching users found"
                    }, client_id), loop)
                    logger.debug(f"✅ Queued no matching users notification for {client_id}")
                except Exception as e:
                    logger.error(f"Failed to send no matching users notification to {client_id}: {str(e)}")
                    # Mark connection as unhealthy
                    if client_id in _connection_health:
                        _connection_health[client_id]["failed_pings"] = _connection_health[client_id].get("failed_pings", 0) + 1
        
        # Add objectId and id to attendance updates if missing (memory optimized)
        if attendance_updates and len(attendance_updates) <= 20:  # Limit updates to prevent memory overload
            for update in attendance_updates[:20]:  # Ensure max 20 updates
                if "objectId" not in update and "attendance_id" in update:
                    update["objectId"] = update["attendance_id"]
                if "id" not in update and "employee_id" in update:
                    update["id"] = update["employee_id"]

        # Put the results in the websocket responses queue (with sliding window clearing if full)
        try:
            # Clear queue if full using sliding window approach
            if websocket_responses_queue.qsize() >= MAX_QUEUE_SIZE:
                _clear_queue_sliding_window_sync(websocket_responses_queue, "websocket_responses", MAX_QUEUE_SIZE)
            
            # Now add the new item
            websocket_responses_queue.put({
                "client_id": client_id,
                "processed_users": processed_users[:10] if processed_users else [],  # Limit to 10 users
                "attendance_updates": attendance_updates[:20] if attendance_updates else [],  # Limit to 20 updates
                "last_recognized_users": {},  # Don't pass large data structures
                "no_face_count": no_face_count
            })
        except Exception as e:
            logger.error(f"Failed to queue response for client {client_id}: {str(e)}")
        
        # Send each real-time detection directly to client (optimized)
        for detection in real_time_notifications[:5]:  # Limit to 5 detections max
            logger.debug(f"Sending real-time detection to client {client_id}: {detection.get('name')} - {detection.get('confidence_str')}")
            if client_id in active_connections:
                websocket = active_connections[client_id]
                try:
                    # Send directly to client using run_coroutine_threadsafe
                    loop = get_main_loop()
                    asyncio.run_coroutine_threadsafe(_send_message_to_client(websocket, {
                        "client_id": client_id,
                        **detection
                    }, client_id), loop)
                    logger.debug(f"✅ Queued real-time detection for {client_id}: {detection.get('name')}")
                except Exception as e:
                    logger.error(f"Failed to send real-time detection to {client_id}: {str(e)}")
                    # Mark connection as unhealthy
                    if client_id in _connection_health:
                        _connection_health[client_id]["failed_pings"] = _connection_health[client_id].get("failed_pings", 0) + 1
            else:
                logger.debug(f"Client {client_id} not in active connections, cannot send real-time detection")
        
        # Optimized attendance update broadcasting
        if attendance_updates and len(attendance_updates) <= 10:  # Limit to 10 updates
            # Only broadcast attendance updates that represent actual changes
            actionable_updates = [
                update for update in attendance_updates[:10]  # Limit to 10 updates max
                if update.get("action") not in ["update", "info"]
                and not update.get("is_streaming", False)
            ]
            
            if actionable_updates:
                # Queue for broadcasting instead of running immediately to prevent blocking
                try:
                    # Clear queue if full using sliding window approach
                    if processing_results_queue.qsize() >= MAX_QUEUE_SIZE:
                        _clear_queue_sliding_window_sync(processing_results_queue, "processing_results", MAX_QUEUE_SIZE)
                    
                    # Now add the new item
                    processing_results_queue.put({
                        "type": "attendance_update",
                        "data": actionable_updates
                    })
                    logger.debug(f"Queued {len(actionable_updates)} attendance updates for broadcasting")
                except Exception as e:
                    logger.error(f"Failed to queue attendance updates: {str(e)}")
            
    except Exception as e:
        logger.error(f"Error handling future completion for client {client_id}: {str(e)}")
        # Put error message in the websocket responses queue with sliding window clearing if full
        try:
            # Clear queue if full using sliding window approach
            if websocket_responses_queue.qsize() >= MAX_QUEUE_SIZE:
                _clear_queue_sliding_window_sync(websocket_responses_queue, "websocket_responses", MAX_QUEUE_SIZE)
            
            # Add error response
            websocket_responses_queue.put({
                "client_id": client_id,
                "error": str(e)[:500],  # Limit error message length
                "processed_users": [],
                "attendance_updates": [],
                "no_face_count": 0
            })
            
            # Also send immediate error notification via queue
            if client_id in active_connections:
                # Check again and clear if needed for notification
                if websocket_responses_queue.qsize() >= MAX_QUEUE_SIZE:
                    _clear_queue_sliding_window_sync(websocket_responses_queue, "websocket_responses", MAX_QUEUE_SIZE)
                
                websocket_responses_queue.put({
                    "client_id": client_id,
                    "type": "notification",
                    "notification_type": "error",
                    "message": f"Error processing image: {str(e)[:100]}"  # Limit error message
                })
        except Exception as queue_error:
            logger.error(f"Failed to queue error response: {str(queue_error)}")
            
    finally:
        # Always decrement pending tasks counter, regardless of success or failure
        try:
            with client_pending_tasks_lock:
                if client_id in client_pending_tasks:
                    client_pending_tasks[client_id] = max(0, client_pending_tasks[client_id] - 1)
                    logger.debug(f"Decreased pending tasks for client {client_id} to {client_pending_tasks[client_id]}")
        except Exception as task_error:
            logger.error(f"Error updating client pending tasks: {str(task_error)}")
        
        # Remove future from pending futures
        try:
            if future in pending_futures:
                del pending_futures[future]
                logger.debug(f"Removed future from pending futures for client {client_id}")
        except Exception as future_error:
            logger.error(f"Error removing future from pending futures: {str(future_error)}")

# Memory-optimized shutdown functions
async def shutdown_websocket_tasks():
    """Gracefully shutdown all WebSocket background tasks"""
    logger.info("Shutting down WebSocket background tasks")
    
    # Signal shutdown to all background tasks
    signal_shutdown()
    
    # Wait a moment for tasks to receive shutdown signal
    await asyncio.sleep(2)
    
    # Cancel any remaining tasks
    current_task = asyncio.current_task()
    tasks = [task for task in asyncio.all_tasks() if task != current_task and not task.done()]
    
    if tasks:
        logger.info(f"Cancelling {len(tasks)} remaining background tasks")
        for task in tasks:
            if not task.done():
                task.cancel()
        
        # Wait for cancellation to complete
        await asyncio.gather(*tasks, return_exceptions=True)
    
    logger.info("WebSocket background tasks shutdown complete")

async def shutdown_thread_pool():
    """Shutdown the thread pool gracefully with memory cleanup"""
    logger.info("Shutting down WebSocket thread pool")
    
    try:
        # Shutdown thread pool with timeout
        thread_pool.shutdown(wait=False)
        
        # Wait for threads to finish with timeout
        import time
        timeout = 10  # 10 seconds timeout
        start_time = time.time()
        
        while thread_pool._threads and time.time() - start_time < timeout:
            await asyncio.sleep(0.1)
        
        if thread_pool._threads:
            logger.warning(f"Thread pool shutdown timeout, {len(thread_pool._threads)} threads still running")
        else:
            logger.info("Thread pool shutdown complete")
            
    except Exception as e:
        logger.error(f"Error during thread pool shutdown: {str(e)}")
    
    # Force garbage collection
    gc.collect()

async def cleanup_all_resources():
    """Perform comprehensive cleanup of all WebSocket resources"""
    logger.info("Starting comprehensive WebSocket resource cleanup")
    
    try:
        # Clear connection health tracking
        global _connection_health
        _connection_health.clear()
        
        # Clear active connections
        active_connections = get_active_connections()
        for client_id, websocket in list(active_connections.items()):
            try:
                await websocket.close()
            except:
                pass
        active_connections.clear()
        
        # Clear pending futures
        pending_futures = get_pending_futures()
        for future in list(pending_futures.keys()):
            if not future.done():
                future.cancel()
        pending_futures.clear()
        
        # Clear client tasks
        client_pending_tasks, client_pending_tasks_lock = get_client_tasks()
        with client_pending_tasks_lock:
            client_pending_tasks.clear()
        
        # Clear queues
        processing_results_queue, websocket_responses_queue = get_queues()
        
        # Drain queues safely
        try:
            while not processing_results_queue.empty():
                processing_results_queue.get_nowait()
        except:
            pass
            
        try:
            while not websocket_responses_queue.empty():
                websocket_responses_queue.get_nowait()
        except:
            pass
        
        # Force garbage collection
        gc.collect()
        
        logger.info("WebSocket resource cleanup complete")
        
    except Exception as e:
        logger.error(f"Error during resource cleanup: {str(e)}")

# Function to gracefully shutdown everything
async def shutdown_all():
    """Shutdown all WebSocket components gracefully"""
    logger.info("Starting complete WebSocket shutdown")
    
    try:
        # Shutdown in order
        await shutdown_websocket_tasks()
        await shutdown_thread_pool()
        await cleanup_all_resources()
        
        logger.info("Complete WebSocket shutdown finished")
        
    except Exception as e:
        logger.error(f"Error during complete shutdown: {str(e)}")
        # Force cleanup anyway
        try:
            await cleanup_all_resources()
        except:
            pass 