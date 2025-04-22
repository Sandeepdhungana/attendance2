from fastapi import APIRouter
from app.api.routes import attendance, employees, timezone, websocket, early_exit

router = APIRouter()

router.include_router(attendance.router, prefix="/attendance", tags=["attendance"])
router.include_router(employees.router, prefix="/employees", tags=["employees"])
router.include_router(timezone.router, prefix="/timezone", tags=["timezone"])
router.include_router(websocket.router, prefix="/ws", tags=["websocket"])
router.include_router(early_exit.router, prefix="/early-exit", tags=["early-exit"]) 