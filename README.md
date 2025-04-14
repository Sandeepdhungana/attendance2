# 🎯 Face Recognition Attendance System

[![Python](https://img.shields.io/badge/Python-3.8%2B-blue)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.68.0-green)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-17.0.2-blue)](https://reactjs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](https://opensource.org/licenses/MIT)

A modern face recognition-based attendance system using InsightFace for accurate face detection and recognition. This system provides a seamless way to manage attendance through facial recognition technology.

## ✨ Features

- 📸 User registration with face image capture
- ✅ Real-time face-based attendance marking
- 📊 Comprehensive attendance history tracking
- 👥 User management dashboard
- 🔄 RESTful API endpoints
- 📱 Responsive web interface

## 🚀 Getting Started

### Prerequisites

- Python 3.10
- Node.js 14.x or higher
- npm or yarn

### Backend Setup

1. Create and activate a virtual environment:
```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Unix or MacOS:
source venv/bin/activate
```

2. Install backend dependencies:
```bash
cd backend
pip install -r requirements.txt
```

3. Run the backend server:
```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

### Frontend Setup

1. Install frontend dependencies:
```bash
cd frontend
npm install
```

2. Run the development server:
```bash
npm start
```

The frontend will be available at `http://localhost:3000`

## 📡 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/register` | Register a new user with face image |
| POST   | `/attendance` | Mark attendance using face image |
| GET    | `/attendance` | Get all attendance records |
| GET    | `/users` | Get all registered users |

### Request Parameters

#### Register User
```json
{
  "user_id": "string",
  "name": "string",
  "image": "file"
}
```

#### Mark Attendance
```json
{
  "image": "file"
}
```

## 🛠️ Technologies Used

### Backend
- FastAPI - Modern, fast web framework
- SQLAlchemy - SQL toolkit and ORM
- InsightFace - State-of-the-art face recognition
- OpenCV - Computer vision library
- SQLite - Lightweight database

### Frontend
- React - JavaScript library for building user interfaces
- TypeScript - Typed JavaScript
- Material-UI - React UI framework
- Axios - HTTP client

