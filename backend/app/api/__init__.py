from fastapi import APIRouter
from app.api.routes import attendance, employees, office_timings, timezone, websocket
from .early_exit import router as early_exit_router

router = APIRouter()

router.include_router(attendance.router, prefix="/attendance", tags=["attendance"])
router.include_router(employees.router, prefix="/employees", tags=["employees"])
router.include_router(office_timings.router, prefix="/office-timings", tags=["office-timings"])
router.include_router(timezone.router, prefix="/timezone", tags=["timezone"])
router.include_router(websocket.router, prefix="/ws", tags=["websocket"])
router.include_router(early_exit_router, tags=["early-exit"]) 