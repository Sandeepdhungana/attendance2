import cv2
import numpy as np
import time
import os
import sys
import json
from datetime import datetime
import logging
from face_utils import FaceRecognition

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def main():
    # Initialize face recognition
    face_recognition = FaceRecognition()
    
    # Initialize webcam
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        logger.error("Could not open webcam")
        return
    
    # Set webcam properties
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    # Initialize variables
    last_recognized_users = {}  # Track multiple users by user_id
    no_face_count = 0
    frame_count = 0
    start_time = time.time()
    fps = 0
    
    logger.info("Starting webcam test. Press 'q' to quit.")
    
    try:
        while True:
            # Capture frame
            ret, frame = cap.read()
            if not ret:
                logger.error("Failed to capture frame")
                break
            
            # Calculate FPS
            frame_count += 1
            elapsed_time = time.time() - start_time
            if elapsed_time >= 1.0:
                fps = frame_count / elapsed_time
                frame_count = 0
                start_time = time.time()
            
            # Process frame for face detection
            try:
                # Convert frame to RGB (OpenCV uses BGR)
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                
                # Get face embeddings for all detected faces
                face_embeddings = face_recognition.get_embeddings(rgb_frame)
                
                # Display face count on frame
                face_count = len(face_embeddings)
                cv2.putText(frame, f"Faces: {face_count}", (10, 30), 
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                
                # Display FPS
                cv2.putText(frame, f"FPS: {fps:.1f}", (10, 70), 
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                
                # If no faces detected, increment counter
                if face_count == 0:
                    no_face_count += 1
                    logger.debug(f"No face detected. Count: {no_face_count}")
                    
                    # If no face for 3 consecutive frames, assume user has left
                    if no_face_count >= 3 and last_recognized_users:
                        logger.info("No face detected for 3 consecutive frames. Users may have left.")
                        # Clear recognized users
                        last_recognized_users = {}
                else:
                    # Reset no face counter when faces are detected
                    no_face_count = 0
                    
                    # Find matches for all face embeddings
                    matches = face_recognition.find_matches_for_embeddings(face_embeddings)
                    
                    # Process each matched user
                    current_users = {}
                    for match in matches:
                        user_id = match['user_id']
                        name = match['name']
                        similarity = match['similarity']
                        
                        # Add to current users
                        current_users[user_id] = {
                            'name': name,
                            'similarity': similarity,
                            'timestamp': datetime.now().isoformat()
                        }
                        
                        # Log recognition
                        logger.info(f"Recognized user: {name} (ID: {user_id}) with similarity: {similarity:.2f}")
                        
                        # Draw bounding box and label on frame
                        # Note: This is a simplified version since we don't have face locations
                        # In a real implementation, you would use the face locations from face_recognition
                        cv2.putText(frame, f"{name} ({similarity:.2f})", (10, 110 + len(current_users) * 30), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                    
                    # Update last recognized users
                    last_recognized_users = current_users
                
                # Display frame
                cv2.imshow('Face Recognition Test', frame)
                
                # Break loop on 'q' key press
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
                
            except Exception as e:
                logger.error(f"Error processing frame: {str(e)}")
                continue
    
    except KeyboardInterrupt:
        logger.info("Test interrupted by user")
    finally:
        # Release resources
        cap.release()
        cv2.destroyAllWindows()
        logger.info("Test completed")

if __name__ == "__main__":
    main() 