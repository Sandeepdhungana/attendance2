import numpy as np
from insightface.app import FaceAnalysis
import json
import logging
import concurrent.futures
from typing import List, Dict, Any, Tuple
import cv2
from deepface import DeepFace
import tempfile
import os

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FaceRecognition:
    def __init__(self):
        try:
            logger.info("Initializing FaceRecognition with buffalo_l model")
            self.app = FaceAnalysis(name='buffalo_l')
            self.app.prepare(ctx_id=0, det_size=(640, 640))
            self.threshold = 0.5 
            self.thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)
            
            # Anti-spoofing configuration
            self.anti_spoofing_enabled = True
            self.liveness_threshold = 0.7  # Threshold for liveness detection
            
            logger.info("FaceRecognition initialized successfully with anti-spoofing")
        except Exception as e:
            logger.error(f"Error initializing FaceRecognition: {str(e)}")
            raise

    def check_liveness(self, image):
        """
        Check if the face in the image is real (liveness detection) using DeepFace
        Returns: (is_real: bool, confidence: float, details: dict)
        """
        if not self.anti_spoofing_enabled:
            return True, 1.0, {"message": "Anti-spoofing disabled"}
            
        try:
            # Validate input image
            if image is None or image.size == 0:
                logger.warning("Invalid or empty image provided, falling back to basic check")
                return self._basic_liveness_check(image) if image is not None else (False, 0.0, {"message": "Invalid image"})
            
            # Create a temporary file to save the image for DeepFace processing
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
                temp_path = temp_file.name
                
            # Save image to temporary file with error handling
            try:
                success = cv2.imwrite(temp_path, image)
                if not success:
                    logger.warning("Failed to save image to temporary file, falling back to basic check")
                    return self._basic_liveness_check(image)
            except Exception as img_save_error:
                logger.warning(f"Error saving image: {str(img_save_error)}, falling back to basic check")
                return self._basic_liveness_check(image)
            
            try:
                # Use DeepFace's anti-spoofing functionality
                result = DeepFace.extract_faces(
                    img_path=temp_path,
                    anti_spoofing=True,
                    detector_backend='opencv',
                    enforce_detection=False
                )

                

                # logger.info(f"Liveness check result: {result}")
                
                if result and len(result) > 0:
                    # Get the first face result
                    face_result = result[0]
                    
                    # Check if anti-spoofing information is available (face_result is a dictionary)
                    if 'is_real' in face_result and 'antispoof_score' in face_result:
                        is_real = face_result['is_real']
                        # Use the actual antispoof_score from DeepFace as confidence
                        antispoof_score = float(face_result['antispoof_score'])
                        
                        logger.info(f"Liveness check completed - is_real: {is_real}, antispoof_score: {antispoof_score:.3f}")
                        
                        return is_real, antispoof_score, {
                            "message": "Liveness check completed",
                            "faces_detected": len(result),
                            "antispoof_score": antispoof_score,
                            "face_confidence": float(face_result.get('confidence', 0))
                        }
                    elif 'is_real' in face_result:
                        # Fallback if only is_real is available
                        is_real = face_result['is_real']
                        confidence = 0.8 if is_real else 0.2
                        
                        logger.info(f"Liveness check completed (no antispoof_score) - is_real: {is_real}, confidence: {confidence}")
                        
                        return is_real, confidence, {
                            "message": "Liveness check completed (basic)",
                            "faces_detected": len(result),
                            "face_confidence": float(face_result.get('confidence', 0))
                        }
                    else:
                        # If no anti-spoofing information available, fall back to basic check
                        logger.info("No anti-spoofing information available in DeepFace result, falling back to basic check")
                        return self._basic_liveness_check(image)
                else:
                    # No faces detected in DeepFace result, fall back to basic check
                    logger.info("No faces detected in DeepFace result, falling back to basic check")
                    return self._basic_liveness_check(image)
                    
            finally:
                # Clean up temporary file
                if os.path.exists(temp_path):
                    try:
                        os.unlink(temp_path)
                    except Exception as cleanup_error:
                        logger.warning(f"Failed to clean up temporary file {temp_path}: {str(cleanup_error)}")
                    
        except Exception as e:
            logger.error(f"Error in liveness detection: {str(e)}")
            # Fall back to basic image quality checks
            return self._basic_liveness_check(image)

    def _basic_liveness_check(self, image):
        """
        Basic liveness checks using image analysis
        This is a fallback when DeepFace anti-spoofing is not available
        """
        try:
            # Convert to grayscale for analysis
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Check image quality metrics
            # 1. Variance of Laplacian (blur detection)
            laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
            
            # 2. Image brightness and contrast
            mean_brightness = np.mean(gray)
            brightness_std = np.std(gray)
            
            # 3. Image size check
            height, width = gray.shape
            
            # Basic quality thresholds
            blur_threshold = 100  # Higher values indicate less blur
            brightness_min = 30   # Too dark
            brightness_max = 220  # Too bright
            contrast_min = 15     # Too low contrast
            size_min = 100        # Too small image
            
            issues = []
            confidence = 1.0
            
            if laplacian_var < blur_threshold:
                issues.append("Image appears blurry")
                confidence -= 0.3
                
            if mean_brightness < brightness_min:
                issues.append("Image too dark")
                confidence -= 0.2
                
            if mean_brightness > brightness_max:
                issues.append("Image too bright")
                confidence -= 0.2
                
            if brightness_std < contrast_min:
                issues.append("Low contrast")
                confidence -= 0.2
                
            if min(height, width) < size_min:
                issues.append("Image too small")
                confidence -= 0.3
                
            confidence = max(confidence, 0.0)
            is_real = confidence >= 0.5
            
            details = {
                "method": "basic_quality_check",
                "laplacian_variance": float(laplacian_var),
                "brightness": float(mean_brightness),
                "contrast": float(brightness_std),
                "image_size": f"{width}x{height}",
                "issues": issues
            }
            
            logger.info(f"Basic liveness check: is_real={is_real}, confidence={confidence:.2f}")
            return is_real, confidence, details
            
        except Exception as e:
            logger.error(f"Error in basic liveness check: {str(e)}")
            return True, 0.5, {"message": "Liveness check failed, defaulting to real"}

    def get_embeddings_with_liveness(self, image):
        """Extract face embeddings with liveness detection"""
        try:
            # First check liveness
            liveness_result = self.check_liveness(image)
            
            # Ensure we got a valid tuple result from check_liveness
            if liveness_result is None or len(liveness_result) != 3:
                logger.error("check_liveness returned invalid result, falling back to basic check")
                liveness_result = self._basic_liveness_check(image)
            
            is_real, liveness_confidence, liveness_details = liveness_result
            
            if not is_real or liveness_confidence < self.liveness_threshold:
                logger.warning(f"Liveness check failed: confidence={liveness_confidence:.2f}, details={liveness_details}")
                return [], {
                    "liveness_passed": False,
                    "liveness_confidence": liveness_confidence,
                    "liveness_details": liveness_details,
                    "message": "Potential spoofing attempt detected"
                }
            
            # If liveness check passes, proceed with face detection
            logger.info("Detecting faces in image after liveness check")
            faces = self.app.get(image)
            if not faces:
                logger.warning("No faces detected in image")
                return [], {
                    "liveness_passed": True,
                    "liveness_confidence": liveness_confidence,
                    "liveness_details": liveness_details,
                    "message": "No faces detected"
                }
            
            logger.info(f"Found {len(faces)} faces with liveness check passed")
            # Return face embeddings with liveness info
            return [face.embedding for face in faces], {
                "liveness_passed": True,
                "liveness_confidence": liveness_confidence,
                "liveness_details": liveness_details,
                "faces_detected": len(faces)
            }
            
        except Exception as e:
            logger.error(f"Error extracting face embeddings with liveness: {str(e)}")
            return [], {
                "liveness_passed": False,
                "error": str(e),
                "message": "Error in face detection with liveness check"
            }

    def get_embeddings(self, image):
        """Extract face embeddings from image for all detected faces"""
        try:
            logger.info("Detecting faces in image")
            faces = self.app.get(image)
            if not faces:
                logger.warning("No faces detected in image")
                return []
            
            logger.info(f"Found {len(faces)} faces")
            # Return only face embeddings
            return [face.embedding for face in faces]
        except Exception as e:
            logger.error(f"Error extracting face embeddings: {str(e)}")
            return []

    def get_embedding(self, image):
        """Extract face embedding from image (legacy method for backward compatibility)"""
        embeddings = self.get_embeddings(image)
        if not embeddings:
            return None
        logger.info(f"Found {len(embeddings)} faces, using the first one")
        return embeddings[0]  # Return just the embedding of the first face

    def get_embedding_with_liveness(self, image):
        """Extract single face embedding with liveness detection (legacy compatibility)"""
        embeddings, liveness_info = self.get_embeddings_with_liveness(image)
        if not embeddings:
            return None, liveness_info
        logger.info(f"Found {len(embeddings)} faces with liveness check, using the first one")
        return embeddings[0], liveness_info

    def compare_faces(self, embedding1, embedding2):
        """Compare two face embeddings using cosine similarity"""
        if embedding1 is None or embedding2 is None:
            return 0.0  # Return 0 similarity for invalid embeddings
        
        try:
            # Normalize the embeddings
            embedding1_norm = embedding1 / np.linalg.norm(embedding1)
            embedding2_norm = embedding2 / np.linalg.norm(embedding2)
            
            # Calculate cosine similarity
            similarity = np.dot(embedding1_norm, embedding2_norm)
            
            # logger.info(f"Face comparison similarity: {similarity}")
            return similarity
        except Exception as e:
            logger.error(f"Error comparing faces: {str(e)}")
            return 0.0

    def embedding_to_str(self, embedding):
        """Convert numpy array to string for storage"""
        logger.info(f"Embedding: {embedding}")
        try:
            return json.dumps(embedding.tolist())
        except Exception as e:
            logger.error(f"Error converting embedding to string: {str(e)}")
            raise

    def str_to_embedding(self, embedding_str):
        """Convert stored string back to numpy array"""
        try:
            return np.array(json.loads(embedding_str))
        except Exception as e:
            logger.error(f"Error converting string to embedding: {str(e)}")
            raise

    def find_match_for_user(self, query_embedding: np.ndarray, user: Any, threshold: float) -> Tuple[Any, float]:
        """Find match for a single user (to be used in parallel)"""
        try:
            # Use dictionary access for user records from the database
            stored_embedding = self.str_to_embedding(user.get("embedding"))
            similarity = self.compare_faces(query_embedding, stored_embedding)
            return user, similarity
        except Exception as e:
            logger.error(f"Error matching user: {str(e)}")
            return user, 0.0

    def find_matches_for_embeddings(self, query_embeddings: List[np.ndarray], users: List[Any], threshold: float = None) -> List[Dict[str, Any]]:
        """Find matches for multiple face embeddings using parallel processing"""
        if threshold is None:
            threshold = self.threshold
            
        matches = []
        
        for query_embedding in query_embeddings:
            # Submit all user comparisons to thread pool
            futures = []
            for user in users:
                future = self.thread_pool.submit(
                    self.find_match_for_user,
                    query_embedding,
                    user,
                    threshold
                )
                futures.append(future)
            
            # Get results and find best match
            best_match = None
            best_similarity = 0.0
            
            for future in concurrent.futures.as_completed(futures):
                user, similarity = future.result()
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_match = user
            
            if best_similarity >= threshold and best_match:
                matches.append({
                    'employee': best_match,
                    'similarity': best_similarity
                })
                
        return matches

    def find_matches_for_embeddings_with_liveness(self, query_embeddings: List[np.ndarray], users: List[Any], liveness_info: Dict, threshold: float = None) -> Tuple[List[Dict[str, Any]], Dict]:
        """Find matches for multiple face embeddings with liveness information"""
        if not liveness_info.get("liveness_passed", False):
            return [], liveness_info
            
        matches = self.find_matches_for_embeddings(query_embeddings, users, threshold)
        
        # Add liveness information to matches
        for match in matches:
            match["liveness_info"] = liveness_info
            
        return matches, liveness_info

    def set_anti_spoofing_enabled(self, enabled: bool):
        """Enable or disable anti-spoofing"""
        self.anti_spoofing_enabled = enabled
        logger.info(f"Anti-spoofing {'enabled' if enabled else 'disabled'}")

    def set_liveness_threshold(self, threshold: float):
        """Set the liveness detection threshold"""
        self.liveness_threshold = max(0.0, min(1.0, threshold))
        logger.info(f"Liveness threshold set to {self.liveness_threshold}")

    def __del__(self):
        """Clean up thread pool when object is destroyed"""
        self.thread_pool.shutdown(wait=True) 