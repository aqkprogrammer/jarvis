"""Real-time workspace presence over WebSocket.

Protocol (all JSON):
    server -> client on connect:      {"type": "connected", "workspace_id": "..."}
    server -> workspace on join/leave: {"type": "presence_update", "workspace_id": "...",
                                        "users": [{"user_id", "username", "connected_at"}]}
    client -> server keep-alive:       {"type": "ping"}   -> server replies {"type": "pong"}
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.core.security import decode_token

router = APIRouter()
logger = get_logger(__name__)


async def _authenticate_ws(websocket: WebSocket) -> Optional[int]:
    """Authenticate via ?token= query param. Returns user_id or None."""
    token = websocket.query_params.get("token")
    if not token:
        return None
    try:
        payload = decode_token(token)
        if payload.type != "access":
            return None
        return int(payload.sub)
    except Exception:
        return None


class PresenceManager:
    """In-memory registry of who is online per workspace.

    A user may hold several connections (tabs); they disappear from the
    snapshot only when the last one closes. State is process-local — a
    multi-worker deployment would need a Redis-backed registry instead.
    """

    def __init__(self) -> None:
        # workspace_id -> user_id -> {username, connected_at, connections}
        self._users: Dict[str, Dict[int, Dict[str, Any]]] = {}
        # workspace_id -> live sockets
        self._sockets: Dict[str, Set[WebSocket]] = {}

    def connect(self, workspace_id: str, user_id: int, username: str, websocket: WebSocket) -> None:
        users = self._users.setdefault(workspace_id, {})
        entry = users.get(user_id)
        if entry:
            entry["connections"] += 1
        else:
            users[user_id] = {
                "username": username,
                "connected_at": datetime.now(timezone.utc).isoformat(),
                "connections": 1,
            }
        self._sockets.setdefault(workspace_id, set()).add(websocket)

    def disconnect(self, workspace_id: str, user_id: int, websocket: WebSocket) -> None:
        self._sockets.get(workspace_id, set()).discard(websocket)
        users = self._users.get(workspace_id, {})
        entry = users.get(user_id)
        if entry:
            entry["connections"] -= 1
            if entry["connections"] <= 0:
                users.pop(user_id, None)
        if not users:
            self._users.pop(workspace_id, None)
        if not self._sockets.get(workspace_id):
            self._sockets.pop(workspace_id, None)

    def snapshot(self, workspace_id: str) -> List[Dict[str, Any]]:
        return [
            {
                "user_id": user_id,
                "username": entry["username"],
                "connected_at": entry["connected_at"],
            }
            for user_id, entry in self._users.get(workspace_id, {}).items()
        ]

    async def broadcast(self, workspace_id: str, message: Dict[str, Any]) -> None:
        """Send to every socket in the workspace; drop the ones that are dead."""
        dead: List[WebSocket] = []
        for socket in list(self._sockets.get(workspace_id, set())):
            try:
                await socket.send_json(message)
            except Exception:
                dead.append(socket)
        for socket in dead:
            self._sockets.get(workspace_id, set()).discard(socket)


manager = PresenceManager()


async def _resolve_member(workspace_id: uuid.UUID, user_id: int) -> Optional[str]:
    """Return the user's username if they belong to the workspace, else None."""
    from app.models.user import User
    from app.models.workspace import Workspace, WorkspaceMember

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        workspace = result.scalar_one_or_none()
        if not workspace:
            return None
        if workspace.owner_id != user_id:
            member_result = await db.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace.id,
                    WorkspaceMember.user_id == user_id,
                )
            )
            if not member_result.scalar_one_or_none():
                return None
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        return user.username if user else None


async def _broadcast_presence(workspace_id: str) -> None:
    await manager.broadcast(
        workspace_id,
        {
            "type": "presence_update",
            "workspace_id": workspace_id,
            "users": manager.snapshot(workspace_id),
        },
    )


@router.websocket("/ws/presence")
async def ws_presence(websocket: WebSocket):
    user_id = await _authenticate_ws(websocket)
    if not user_id:
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    raw_workspace_id = websocket.query_params.get("workspace_id")
    try:
        workspace_uuid = uuid.UUID(raw_workspace_id) if raw_workspace_id else None
    except ValueError:
        workspace_uuid = None
    if not workspace_uuid:
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    workspace_id = str(workspace_uuid)

    try:
        username = await _resolve_member(workspace_uuid, user_id)
    except Exception as exc:
        logger.error("ws_presence_lookup_failed", error=str(exc))
        username = None
    if not username:
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    manager.connect(workspace_id, user_id, username, websocket)
    logger.info("ws_presence_connected", user_id=user_id, workspace_id=workspace_id)

    try:
        await websocket.send_json({"type": "connected", "workspace_id": workspace_id})
    except Exception:
        manager.disconnect(workspace_id, user_id, websocket)
        return
    await _broadcast_presence(workspace_id)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                try:
                    await websocket.send_json({"type": "error", "error": "Invalid JSON"})
                except Exception:
                    break
                continue

            if data.get("type") == "ping":
                try:
                    await websocket.send_json({"type": "pong"})
                except Exception:
                    break
    except WebSocketDisconnect:
        logger.info("ws_presence_disconnected", user_id=user_id, workspace_id=workspace_id)
    except Exception as exc:
        logger.error("ws_presence_error", error=str(exc))
    finally:
        manager.disconnect(workspace_id, user_id, websocket)
        await _broadcast_presence(workspace_id)
