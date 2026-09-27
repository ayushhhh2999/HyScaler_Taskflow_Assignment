from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers.auth import router as auth_router
from app.routers.comments import router as comments_router
from app.routers.dashboard import router as dashboard_router
from app.routers.members import router as members_router
from app.routers.projects import router as projects_router
from app.routers.tasks import router as tasks_router
from app.routers.websocket import router as websocket_router

settings = get_settings()

app = FastAPI(title="TaskFlow API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(members_router)
app.include_router(tasks_router)
app.include_router(comments_router)
app.include_router(dashboard_router)
app.include_router(websocket_router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


@app.get("/api/v1/health")
async def api_health_check() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}
