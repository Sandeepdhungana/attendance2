#!/usr/bin/env python3
"""
Installation script for anti-spoofing dependencies
This script will install DeepFace and TensorFlow for the attendance system
"""

import subprocess
import sys
import os

def run_command(command):
    """Run a command and return True if successful"""
    try:
        print(f"Running: {command}")
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✓ Success: {command}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ Error running {command}: {e}")
        print(f"stdout: {e.stdout}")
        print(f"stderr: {e.stderr}")
        return False

def install_dependencies():
    """Install the required dependencies for anti-spoofing"""
    print("Installing anti-spoofing dependencies...")
    print("This may take a few minutes as TensorFlow and DeepFace are large packages.\n")
    
    # Change to backend directory
    if os.path.exists("backend"):
        os.chdir("backend")
        print("Changed to backend directory")
    
    # Install pip requirements
    success = run_command("pip install deepface==0.0.79 tensorflow==2.13.0")
    
    if success:
        print("\n✓ Anti-spoofing dependencies installed successfully!")
        print("\nNext steps:")
        print("1. Restart your FastAPI server")
        print("2. The anti-spoofing feature is now enabled by default")
        print("3. You can configure anti-spoofing settings via the API endpoints:")
        print("   - GET /api/anti-spoofing/config")
        print("   - POST /api/anti-spoofing/config")
        print("\nFeatures added:")
        print("- Liveness detection during face registration")
        print("- Anti-spoofing during attendance marking")
        print("- Real-time spoofing detection in WebSocket streaming")
        print("- Configurable liveness threshold")
        print("- Detailed security logs")
    else:
        print("\n✗ Installation failed. Please try installing manually:")
        print("pip install deepface==0.0.79 tensorflow==2.13.0")
        return False
    
    return True

if __name__ == "__main__":
    print("=== Anti-Spoofing Installation Script ===")
    print("This script will install DeepFace and TensorFlow for anti-spoofing functionality.\n")
    
    # Check if we're in the right directory
    if not os.path.exists("backend") and not os.path.exists("requirements.txt"):
        print("Please run this script from the project root directory.")
        sys.exit(1)
    
    install_dependencies() 