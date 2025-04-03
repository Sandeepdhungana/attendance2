# Face Recognition Attendance System

A face recognition-based attendance system using InsightFace for face detection and recognition.

## Features

- User registration with face image
- Face-based attendance marking
- Attendance history tracking
- User management
- RESTful API endpoints

## Backend Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

3. Run the backend server:
```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

## API Endpoints

### POST /register
Register a new user with face image
- Parameters:
  - user_id (string)
  - name (string)
  - image (file)

### POST /attendance
Mark attendance using face image
- Parameters:
  - image (file)

### GET /attendance
Get all attendance records

### GET /users
Get all registered users

## Frontend Setup

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Run the development server:
```bash
npm start
```

The frontend will be available at `http://localhost:3000`

## Technologies Used

- Backend:
  - FastAPI
  - SQLAlchemy
  - InsightFace
  - OpenCV
  - SQLite

- Frontend:
  - React
  - TypeScript
  - Material-UI

## Security Considerations

- In production, configure CORS with specific origins
- Implement proper authentication and authorization
- Secure storage of face embeddings
- Use environment variables for sensitive configuration

## License

MIT 