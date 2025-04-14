from fastapi import APIRouter
from app.api.routes import attendance, users, office_timings, timezone, websocket
from .early_exit import router as early_exit_router

router = APIRouter()

router.include_router(attendance.router, tags=["attendance"])
router.include_router(users.router, tags=["users"])
router.include_router(office_timings.router, tags=["office-timings"])
router.include_router(timezone.router, tags=["timezone"])
router.include_router(websocket.router, tags=["websocket"])
router.include_router(early_exit_router, tags=["early-exit"]) 