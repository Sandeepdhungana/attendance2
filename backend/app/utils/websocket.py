import asyncio
import logging
from typing import Dict, Any
from fastapi import WebSocket
from ..dependencies import get_active_connections, get_queues, get_client_tasks, get_pending_futures

logger = logging.getLogger(__name__)

async def broadcast_attendance_update(attendance_data: Dict[str, Any]):
    """Broadcast attendance updates to all connected clients"""
    active_connections = get_active_connections()
    if not active_connections:
        logger.info("No active connections to broadcast to")
        return

    # Create a message with the attendance update
    message = {
        "type": "attendance_update",
        "data": attendance_data
    }

    # Log the broadcast
    logger.info(f"Broadcasting attendance update to {len(active_connections)} clients: {attendance_data}")

    # Send to all connected clients
    disconnected_clients = []
    for client_id, websocket in active_connections.items():
        try:
            await websocket.send_json(message)
            logger.debug(f"Successfully sent attendance update to client {client_id}")
        except Exception as e:
            logger.error(f"Error broadcasting to client {client_id}: {str(e)}")
            # Mark for removal
            disconnected_clients.append(client_id)

    # Remove any disconnected clients
    for client_id in disconnected_clients:
        if client_id in active_connections:
            del active_connections[client_id]
            logger.info(f"Removed disconnected client {client_id}. Total connections: {len(active_connections)}")

async def ping_client(websocket: WebSocket):
    """Send periodic ping messages to keep the connection alive"""
    try:
        while True:
            await asyncio.sleep(30)  # PING_INTERVAL
            try:
                # Send a ping message
                await websocket.send_json({"type": "ping"})
                logger.debug("Sent ping to client")
            except Exception as e:
                logger.error(f"Error sending ping: {str(e)}")
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

                # Check if this is an error response
                if "error" in item:
                    try:
                        await websocket.send_json({"status": "processing_error", "message": item["error"]})
                    except Exception as e:
                        logger.error(f"Error sending error response to client {client_id}: {str(e)}")
                        # Remove the client from active connections if it's causing errors
                        if client_id in active_connections:
                            del active_connections[client_id]
                    continue

                # Process the results
                processed_users = item["processed_users"]
                attendance_updates = item["attendance_updates"]

                if not processed_users:
                    if item["no_face_count"] > 0:
                        # No face detected
                        try:
                            await websocket.send_json({"status": "no_face_detected"})
                        except Exception as e:
                            logger.error(f"Error sending no_face_detected response to client {client_id}: {str(e)}")
                            if client_id in active_connections:
                                del active_connections[client_id]
                    else:
                        # No matching users found
                        try:
                            await websocket.send_json({"status": "no_matching_users"})
                        except Exception as e:
                            logger.error(f"Error sending no_matching_users response to client {client_id}: {str(e)}")
                            if client_id in active_connections:
                                del active_connections[client_id]
                else:
                    # Send response with all processed users to the current client
                    try:
                        await websocket.send_json({
                            "multiple_users": True,
                            "users": processed_users
                        })
                    except Exception as e:
                        logger.error(f"Error sending processed_users response to client {client_id}: {str(e)}")
                        if client_id in active_connections:
                            del active_connections[client_id]

                    # Add attendance updates to the queue for broadcasting
                    if attendance_updates:
                        await broadcast_attendance_update(attendance_updates)

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
    _, websocket_responses_queue = get_queues()
    
    try:
        processed_users, attendance_updates, last_recognized_users, no_face_count = future.result()

        # Decrement pending tasks counter
        with client_pending_tasks_lock:
            if client_id in client_pending_tasks:
                client_pending_tasks[client_id] = max(0, client_pending_tasks[client_id] - 1)

        # Put the results in the websocket responses queue
        websocket_responses_queue.put({
            "client_id": client_id,
            "processed_users": processed_users,
            "attendance_updates": attendance_updates,
            "last_recognized_users": last_recognized_users,
            "no_face_count": no_face_count
        })
    except Exception as e:
        logger.error(f"Error handling future completion: {str(e)}")
        # Decrement pending tasks counter even on error
        with client_pending_tasks_lock:
            if client_id in client_pending_tasks:
                client_pending_tasks[client_id] = max(0, client_pending_tasks[client_id] - 1)
        # Put error in the queue
        websocket_responses_queue.put({
            "client_id": client_id,
            "error": str(e)
        })
    finally:
        # Clean up the future from pending_futures
        for key, value in list(pending_futures.items()):
            if value == client_id:
                del pending_futures[key]
                break 