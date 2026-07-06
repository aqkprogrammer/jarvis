from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.webhook import OutgoingWebhook, WebhookTrigger
from app.models.workflow import Workflow
from app.services import webhook_service, workflow_service

# Authenticated management router (mounted at /api/v1/webhooks)
router = APIRouter()

# Public router (mounted at /api/v1/hooks) — no auth: the token IS the secret.
public_router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class TriggerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    workflow_id: UUID


class TriggerResponse(BaseModel):
    id: UUID
    name: str
    workflow_id: UUID
    url: str
    is_active: bool
    trigger_count: int
    last_triggered_at: Optional[datetime] = None
    created_at: datetime


class OutgoingWebhookCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    url: str = Field(..., min_length=1, max_length=1000)
    events: List[str] = Field(..., min_length=1)
    secret: Optional[str] = Field(None, max_length=255)


class OutgoingWebhookUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    url: Optional[str] = Field(None, min_length=1, max_length=1000)
    events: Optional[List[str]] = Field(None, min_length=1)
    secret: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None


class OutgoingWebhookResponse(BaseModel):
    """Safe shape: the signing secret is never returned."""

    model_config = {"from_attributes": True}

    id: UUID
    name: str
    url: str
    events: List[str]
    is_active: bool
    last_status: Optional[str] = None
    created_at: datetime


# ── Helpers ────────────────────────────────────────────────────────────────────

def _trigger_response(trigger: WebhookTrigger) -> TriggerResponse:
    base_url = settings.API_BASE_URL.rstrip("/")
    return TriggerResponse(
        id=trigger.id,
        name=trigger.name,
        workflow_id=trigger.workflow_id,
        url=f"{base_url}/api/v1/hooks/{trigger.token}",
        is_active=trigger.is_active,
        trigger_count=trigger.trigger_count,
        last_triggered_at=trigger.last_triggered_at,
        created_at=trigger.created_at,
    )


async def _get_owned_trigger(
    db: AsyncSession, trigger_id: UUID, user_id: int
) -> WebhookTrigger:
    result = await db.execute(
        select(WebhookTrigger).where(
            WebhookTrigger.id == trigger_id, WebhookTrigger.user_id == user_id
        )
    )
    trigger = result.scalar_one_or_none()
    if not trigger:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook trigger not found")
    return trigger


async def _get_owned_outgoing(
    db: AsyncSession, webhook_id: UUID, user_id: int
) -> OutgoingWebhook:
    result = await db.execute(
        select(OutgoingWebhook).where(
            OutgoingWebhook.id == webhook_id, OutgoingWebhook.user_id == user_id
        )
    )
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Outgoing webhook not found")
    return webhook


def _validate_events_or_400(events: List[str]) -> None:
    unknown = [e for e in events if e not in webhook_service.SUPPORTED_EVENTS]
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported events: {', '.join(unknown)}. "
                f"Supported: {', '.join(sorted(webhook_service.SUPPORTED_EVENTS))}"
            ),
        )


# ── Incoming trigger endpoints (authenticated) ─────────────────────────────────

@router.get("/triggers", response_model=List[TriggerResponse])
async def list_webhook_triggers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(WebhookTrigger)
        .where(WebhookTrigger.user_id == current_user.id)
        .order_by(WebhookTrigger.created_at.desc())
    )
    return [_trigger_response(t) for t in result.scalars().all()]


@router.post("/triggers", response_model=TriggerResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook_trigger(
    payload: TriggerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Workflow).where(
            Workflow.id == payload.workflow_id, Workflow.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    trigger = WebhookTrigger(
        user_id=current_user.id,
        name=payload.name,
        workflow_id=payload.workflow_id,
    )
    db.add(trigger)
    await db.flush()
    return _trigger_response(trigger)


@router.delete("/triggers/{trigger_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook_trigger(
    trigger_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trigger = await _get_owned_trigger(db, trigger_id, current_user.id)
    await db.delete(trigger)
    await db.flush()


@router.post("/triggers/{trigger_id}/toggle", response_model=TriggerResponse)
async def toggle_webhook_trigger(
    trigger_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trigger = await _get_owned_trigger(db, trigger_id, current_user.id)
    trigger.is_active = not trigger.is_active
    await db.flush()
    return _trigger_response(trigger)


# ── Outgoing webhook endpoints (authenticated) ─────────────────────────────────

@router.get("/outgoing", response_model=List[OutgoingWebhookResponse])
async def list_outgoing_webhooks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OutgoingWebhook)
        .where(OutgoingWebhook.user_id == current_user.id)
        .order_by(OutgoingWebhook.created_at.desc())
    )
    return list(result.scalars().all())


@router.post(
    "/outgoing", response_model=OutgoingWebhookResponse, status_code=status.HTTP_201_CREATED
)
async def create_outgoing_webhook(
    payload: OutgoingWebhookCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_events_or_400(payload.events)
    webhook = OutgoingWebhook(
        user_id=current_user.id,
        name=payload.name,
        url=payload.url,
        events=payload.events,
        secret=payload.secret,
    )
    db.add(webhook)
    await db.flush()
    return webhook


@router.put("/outgoing/{webhook_id}", response_model=OutgoingWebhookResponse)
async def update_outgoing_webhook(
    webhook_id: UUID,
    payload: OutgoingWebhookUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    webhook = await _get_owned_outgoing(db, webhook_id, current_user.id)
    if payload.events is not None:
        _validate_events_or_400(payload.events)
        webhook.events = payload.events
    if payload.name is not None:
        webhook.name = payload.name
    if payload.url is not None:
        webhook.url = payload.url
    if payload.secret is not None:
        webhook.secret = payload.secret
    if payload.is_active is not None:
        webhook.is_active = payload.is_active
    await db.flush()
    return webhook


@router.delete("/outgoing/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_outgoing_webhook(
    webhook_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    webhook = await _get_owned_outgoing(db, webhook_id, current_user.id)
    await db.delete(webhook)
    await db.flush()


@router.post("/outgoing/{webhook_id}/test")
async def test_outgoing_webhook(
    webhook_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    webhook = await _get_owned_outgoing(db, webhook_id, current_user.id)
    webhook.last_status = await webhook_service.send_test(webhook)
    await db.flush()
    return {"last_status": webhook.last_status}


# ── Public receiver (no auth — the token is the secret) ────────────────────────

@public_router.post("/{token}")
async def receive_webhook(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Trigger the linked workflow. The JSON body (or raw text) becomes the input."""
    result = await db.execute(select(WebhookTrigger).where(WebhookTrigger.token == token))
    trigger = result.scalar_one_or_none()
    if not trigger or not trigger.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown webhook")

    wf_result = await db.execute(select(Workflow).where(Workflow.id == trigger.workflow_id))
    workflow = wf_result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    try:
        body = await request.json()
        input_text = body if isinstance(body, str) else json.dumps(body)
    except Exception:
        raw = await request.body()
        input_text = raw.decode("utf-8", errors="replace")

    run = await workflow_service.execute_workflow(db, workflow, input_text=input_text)

    trigger.trigger_count = (trigger.trigger_count or 0) + 1
    trigger.last_triggered_at = datetime.now(timezone.utc)
    await db.flush()

    return {"run_id": str(run.id), "status": run.status}
