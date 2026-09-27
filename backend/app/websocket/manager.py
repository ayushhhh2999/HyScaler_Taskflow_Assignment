from __future__ import annotations

from uuid import UUID

from fastapi import WebSocket


class ProjectConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[str, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, project_id: UUID) -> None:
        await websocket.accept()
        project_key = str(project_id)
        self.active_connections.setdefault(project_key, set())
        self.active_connections[project_key].add(websocket)

    def disconnect(self, websocket: WebSocket, project_id: UUID) -> None:
        project_key = str(project_id)
        if project_key in self.active_connections:
            self.active_connections[project_key].discard(websocket)
            if not self.active_connections[project_key]:
                del self.active_connections[project_key]

    async def broadcast_to_project(self, project_id: UUID, message: dict) -> None:
        project_key = str(project_id)
        stale: list[WebSocket] = []
        for connection in list(self.active_connections.get(project_key, set())):
            try:
                await connection.send_json(message)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection, project_id)


manager = ProjectConnectionManager()


async def broadcast_project_event(project_id: UUID, event_type: str, payload: dict) -> None:
    await manager.broadcast_to_project(
        project_id,
        {
            "type": event_type,
            "project_id": str(project_id),
            "payload": payload,
        },
    )
