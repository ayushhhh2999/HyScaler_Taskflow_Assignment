from __future__ import annotations

from uuid import UUID

from fastapi import WebSocket


class ProjectConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[str, set[WebSocket]] = {}
        self.user_connections: dict[str, set[WebSocket]] = {}
        self.connection_users: dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, project_id: UUID, user_id: UUID) -> None:
        await websocket.accept()
        project_key = str(project_id)
        self.active_connections.setdefault(project_key, set())
        self.active_connections[project_key].add(websocket)
        self.connection_users[websocket] = str(user_id)

    async def connect_user(self, websocket: WebSocket, user_id: UUID) -> None:
        await websocket.accept()
        self.user_connections.setdefault(str(user_id), set()).add(websocket)

    def disconnect(self, websocket: WebSocket, project_id: UUID) -> None:
        project_key = str(project_id)
        self.connection_users.pop(websocket, None)
        if project_key in self.active_connections:
            self.active_connections[project_key].discard(websocket)
            if not self.active_connections[project_key]:
                del self.active_connections[project_key]

    def disconnect_user(self, websocket: WebSocket, user_id: UUID) -> None:
        user_key = str(user_id)
        if user_key in self.user_connections:
            self.user_connections[user_key].discard(websocket)
            if not self.user_connections[user_key]:
                del self.user_connections[user_key]

    async def disconnect_project_user(self, project_id: UUID, user_id: UUID) -> None:
        for connection in list(self.active_connections.get(str(project_id), set())):
            if self.connection_users.get(connection) != str(user_id):
                continue
            self.disconnect(connection, project_id)
            try:
                await connection.close(code=1008)
            except Exception:
                pass

    async def disconnect_project(self, project_id: UUID) -> None:
        for connection in list(self.active_connections.get(str(project_id), set())):
            self.disconnect(connection, project_id)
            try:
                await connection.close(code=1008)
            except Exception:
                pass

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

    async def broadcast_to_user(self, user_id: UUID, message: dict) -> None:
        user_key = str(user_id)
        stale: list[WebSocket] = []
        for connection in list(self.user_connections.get(user_key, set())):
            try:
                await connection.send_json(message)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect_user(connection, user_id)


manager = ProjectConnectionManager()


async def broadcast_project_event(
    project_id: UUID,
    event_type: str,
    payload: dict,
    user_ids: set[UUID] | None = None,
) -> None:
    message = {"type": event_type, "project_id": str(project_id), "payload": payload}
    await manager.broadcast_to_project(project_id, message)
    for user_id in user_ids or set():
        await manager.broadcast_to_user(user_id, message)


async def broadcast_user_event(user_id: UUID, event_type: str, project_id: UUID, payload: dict) -> None:
    await manager.broadcast_to_user(
        user_id,
        {"type": event_type, "project_id": str(project_id), "payload": payload},
    )
