from __future__ import annotations

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.core.security import decode_token

router = APIRouter()
logger = get_logger(__name__)

HEARTBEAT_INTERVAL = 30  # seconds


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


@router.websocket("/ws/chat/{conversation_id}")
async def ws_chat(websocket: WebSocket, conversation_id: int):
    user_id = await _authenticate_ws(websocket)
    if not user_id:
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    logger.info("ws_connected", user_id=user_id, conversation_id=conversation_id)

    # Send connection acknowledgment
    await websocket.send_json({"type": "connected", "conversation_id": conversation_id})

    heartbeat_task: Optional[asyncio.Task] = None

    async def heartbeat():
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            try:
                await websocket.send_json({"type": "ping"})
            except Exception:
                break

    heartbeat_task = asyncio.create_task(heartbeat())

    try:
        while True:
            raw = await websocket.receive_text()

            # Handle pong
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "error": "Invalid JSON"})
                continue

            if data.get("type") == "pong":
                continue

            if data.get("type") == "message":
                user_message = data.get("content", "").strip()
                if not user_message:
                    await websocket.send_json({"type": "error", "error": "Empty message"})
                    continue

                # Optional RAG document scoping
                document_ids = data.get("document_ids")
                if not (
                    isinstance(document_ids, list)
                    and all(isinstance(d, str) for d in document_ids)
                ):
                    document_ids = None

                # Stream AI response
                async with AsyncSessionLocal() as db:
                    from app.services.chat_service import ChatService

                    # Monthly token quota (check failures never block chat)
                    try:
                        from app.models.user import User
                        from app.services import usage_service

                        user = await db.get(User, user_id)
                        quota = user.monthly_token_quota if user else None
                    except Exception:
                        quota = None
                    if quota is not None and await usage_service.quota_exceeded(
                        db, user_id, quota
                    ):
                        await websocket.send_json(
                            {"type": "error", "error": "Monthly token quota exceeded"}
                        )
                        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                        return

                    svc = ChatService(db)
                    try:
                        gen = await svc.stream_chat(
                            user_id=user_id,
                            user_message=user_message,
                            conversation_id=conversation_id,
                            provider_name=data.get("provider"),
                            model=data.get("model"),
                            document_ids=document_ids,
                        )
                        async for chunk in gen:
                            await websocket.send_json(chunk)
                        await db.commit()
                    except Exception as exc:
                        await db.rollback()
                        logger.error("ws_chat_error", error=str(exc))
                        await websocket.send_json({"type": "error", "error": str(exc)})

    except WebSocketDisconnect:
        logger.info("ws_disconnected", user_id=user_id, conversation_id=conversation_id)
    except Exception as exc:
        logger.error("ws_error", error=str(exc))
        await websocket.send_json({"type": "error", "error": "Internal server error"})
    finally:
        if heartbeat_task:
            heartbeat_task.cancel()
