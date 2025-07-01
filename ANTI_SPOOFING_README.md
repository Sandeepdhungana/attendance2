# Anti-Spoofing Implementation Using DeepFace

This document describes the anti-spoofing (liveness detection) implementation added to the face attendance system using DeepFace.

## Overview

The anti-spoofing feature helps prevent unauthorized access by detecting when someone tries to use a photo, video, or other fake representation instead of their actual face. This adds an extra layer of security to your attendance system.

## Features

### 1. Liveness Detection
- **Real-time detection**: Analyzes faces in real-time during WebSocket streaming
- **Registration security**: Validates faces during employee registration
- **Attendance marking**: Prevents spoofing during manual attendance marking
- **Fallback detection**: Uses image quality analysis when DeepFace anti-spoofing isn't available

### 2. Configurable Settings
- **Enable/Disable**: Toggle anti-spoofing on/off
- **Liveness Threshold**: Adjust sensitivity (0.0 - 1.0)
- **API Configuration**: Manage settings via REST API

### 3. Comprehensive Logging
- **Security alerts**: Logs all spoofing attempts
- **Confidence scores**: Records liveness detection confidence
- **Performance metrics**: Tracks detection performance

## Installation

### Method 1: Using the Installation Script
```bash
python install_antispoofing.py
```

### Method 2: Manual Installation
```bash
cd backend
pip install deepface==0.0.79 tensorflow==2.13.0
```

## Configuration

### API Endpoints

#### Get Current Configuration
```http
GET /api/anti-spoofing/config
```

#### Update Configuration
```http
POST /api/anti-spoofing/config
Content-Type: application/x-www-form-urlencoded

enabled=true&liveness_threshold=0.8
```

### Default Settings
- **Enabled**: `true` (anti-spoofing is enabled by default)
- **Liveness Threshold**: `0.7` (70% confidence required)

## How It Works

The system uses DeepFace's built-in anti-spoofing functionality with fallback to image quality analysis.

## Security Features

- **Photo/Video Attack Detection**
- **Security Logging**
- **Configurable Confidence Thresholds**
- **Real-time WebSocket Integration**

## Usage

After installation and server restart, anti-spoofing will be automatically enabled. Users attempting to use photos or videos will receive security alerts and be unable to register or mark attendance.

For configuration and troubleshooting, see the full documentation above. 