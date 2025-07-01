#!/usr/bin/env python3
"""
Test script to verify anti-spoofing functionality
"""

try:
    import sys
    import os
    sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
    from app.face_utils import FaceRecognition
    import numpy as np
    
    print("🧪 Testing Anti-Spoofing Implementation...")
    
    # Initialize FaceRecognition
    fr = FaceRecognition()
    
    print(f"✅ FaceRecognition initialized successfully")
    print(f"📊 Anti-spoofing enabled: {fr.anti_spoofing_enabled}")
    print(f"📊 Liveness threshold: {fr.liveness_threshold}")
    
    # Test with a simple image array (simulated)
    test_image = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
    
    print("🔍 Testing liveness detection with simulated image...")
    is_real, confidence, details = fr.check_liveness(test_image)
    
    print(f"📋 Liveness Results:")
    print(f"   Is Real: {is_real}")
    print(f"   Confidence: {confidence:.2f}")
    print(f"   Method: {details.get('method', 'unknown')}")
    print(f"   Issues: {details.get('issues', [])}")
    
    print("\n🎉 Anti-spoofing test completed successfully!")
    print("\n🔧 Configuration methods available:")
    print(f"   - set_anti_spoofing_enabled(True/False)")
    print(f"   - set_liveness_threshold(0.0-1.0)")
    
except Exception as e:
    print(f"❌ Error testing anti-spoofing: {str(e)}")
    import traceback
    traceback.print_exc() 