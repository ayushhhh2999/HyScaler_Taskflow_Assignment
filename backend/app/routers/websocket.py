from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import decode_token
from app.models.project_member import ProjectMember
from app.websocket.manager import manager

router = APIRouter(prefix="/ws", tags=["websocket"])


@router.websocket("/projects/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: UUID):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return

    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Invalid token type")
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("Missing subject")
        member_user_id = UUID(str(user_id))
    except Exception:
        await websocket.close(code=1008)
        return

    async for db in get_db():
        membership = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == member_user_id,
            )
        )
        if membership.scalar_one_or_none() is None:
            await websocket.close(code=1008)
            return
        break

    await manager.connect(websocket, project_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, project_id)
    except Exception:
        manager.disconnect(websocket, project_id)
