"""Outgoing webhook delivery: notify user-registered URLs when events occur.

``fire_event`` opens its own database session so callers can fire-and-forget
via ``asyncio.create_task`` (or the ``fire_event_background`` helper) without
tying the delivery to the request's session/transaction. It never raises —
delivery problems are recorded on each webhook's ``last_status`` and logged.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any, Dict, Set

import httpx
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.models.webhook import OutgoingWebhook

logger = get_logger(__name__)

SUPPORTED_EVENTS = {
    "workflow.completed",
    "workflow.failed",
    "schedule.completed",
    "task.completed",
}

DELIVERY_TIMEOUT_SECONDS = 5.0

# Strong references so fire-and-forget tasks are not garbage-collected mid-flight.
_background_tasks: Set["asyncio.Task[None]"] = set()


def fire_event_background(user_id: int, event: str, payload: Dict[str, Any]) -> None:
    """Schedule fire_event on the running loop without awaiting it."""
    task = asyncio.create_task(fire_event(user_id, event, payload))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _deliver(webhook: OutgoingWebhook, event: str, payload: Dict[str, Any]) -> str:
    """POST one event to one webhook URL. Returns the last_status string."""
    body = json.dumps(
        {
            "event": event,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": payload,
        },
        default=str,
    ).encode("utf-8")

    headers = {"Content-Type": "application/json", "X-Jarvis-Event": event}
    if webhook.secret:
        headers["X-Jarvis-Signature"] = hmac.new(
            webhook.secret.encode("utf-8"), body, hashlib.sha256
        ).hexdigest()

    try:
        async with httpx.AsyncClient(timeout=DELIVERY_TIMEOUT_SECONDS) as client:
            response = await client.post(webhook.url, content=body, headers=headers)
        return f"{response.status_code} {response.reason_phrase}".strip()[:255]
    except Exception as exc:
        return f"failed: {exc}"[:255]


async def send_test(webhook: OutgoingWebhook) -> str:
    """Deliver a synthetic test event to a single webhook; return the status."""
    return await _deliver(
        webhook,
        "webhook.test",
        {"message": "JARVIS outgoing webhook test", "webhook_id": str(webhook.id)},
    )


async def fire_event(user_id: int, event: str, payload: Dict[str, Any]) -> None:
    """Notify every active outgoing webhook of ``user_id`` subscribed to ``event``.

    Opens its own AsyncSessionLocal, updates each webhook's ``last_status``,
    and NEVER raises (failures are logged only).
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(OutgoingWebhook).where(
                    OutgoingWebhook.user_id == user_id,
                    OutgoingWebhook.is_active == True,  # noqa: E712
                )
            )
            webhooks = [w for w in result.scalars().all() if event in (w.events or [])]
            for webhook in webhooks:
                webhook.last_status = await _deliver(webhook, event, payload)
                logger.info(
                    "outgoing_webhook_delivered",
                    webhook_id=str(webhook.id),
                    event=event,
                    status=webhook.last_status,
                )
            if webhooks:
                await session.commit()
    except Exception as exc:
        logger.error("webhook_fire_event_failed", event=event, error=str(exc))
