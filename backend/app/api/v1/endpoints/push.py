"""Web Push subscription scaffolding.

Stores browser push subscriptions per user. Actual push delivery is out of
scope for now — workflow/schedule events can later use ``pywebpush`` with
``settings.VAPID_PRIVATE_KEY`` to notify every subscription of a user.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.push_subscription import PushSubscription
from app.models.user import User

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class PushSubscribeRequest(BaseModel):
    endpoint: str = Field(..., min_length=1, max_length=2000)
    keys: Dict[str, Any] = Field(default_factory=dict)  # {"p256dh": ..., "auth": ...}


class PushUnsubscribeRequest(BaseModel):
    endpoint: str = Field(..., min_length=1, max_length=2000)


class PushSubscriptionResponse(BaseModel):
    id: UUID
    endpoint: str
    created_at: datetime


class VapidPublicKeyResponse(BaseModel):
    key: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post(
    "/subscribe", response_model=PushSubscriptionResponse, status_code=status.HTTP_201_CREATED
)
async def subscribe(
    payload: PushSubscribeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Register (or refresh) a Web Push subscription. Upserts by endpoint."""
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == current_user.id,
            PushSubscription.endpoint == payload.endpoint,
        )
    )
    subscription = result.scalar_one_or_none()
    if subscription:
        subscription.keys = payload.keys
    else:
        subscription = PushSubscription(
            user_id=current_user.id, endpoint=payload.endpoint, keys=payload.keys
        )
        db.add(subscription)
    await db.flush()
    return PushSubscriptionResponse(
        id=subscription.id, endpoint=subscription.endpoint, created_at=subscription.created_at
    )


@router.delete("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    payload: PushUnsubscribeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == current_user.id,
            PushSubscription.endpoint == payload.endpoint,
        )
    )
    subscription = result.scalar_one_or_none()
    if not subscription:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    await db.delete(subscription)
    await db.flush()


@router.get("/vapid-public-key", response_model=VapidPublicKeyResponse)
async def vapid_public_key(
    current_user: User = Depends(get_current_user),
):
    """The VAPID public key browsers need for ``pushManager.subscribe``."""
    return VapidPublicKeyResponse(key=settings.VAPID_PUBLIC_KEY or "")
