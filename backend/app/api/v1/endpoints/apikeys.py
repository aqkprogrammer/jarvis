from __future__ import annotations

import hashlib
import secrets
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.api_key import ApiKey
from app.models.user import User
from app.services.audit_service import audit

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class ApiKeyResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    name: str
    key_prefix: str
    last_used_at: Optional[datetime] = None
    revoked: bool
    created_at: datetime


class ApiKeyCreatedResponse(BaseModel):
    id: UUID
    name: str
    key_prefix: str
    created_at: datetime
    key: str  # full key — returned only once, at creation


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", response_model=ApiKeyCreatedResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    payload: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    key = f"jrv_{secrets.token_urlsafe(32)}"
    api_key = ApiKey(
        user_id=current_user.id,
        name=payload.name,
        key_prefix=key[:12],
        key_hash=hashlib.sha256(key.encode()).hexdigest(),
    )
    db.add(api_key)
    await db.flush()
    await audit(db, current_user.id, "apikey.create", "apikey", str(api_key.id),
                detail={"name": api_key.name, "key_prefix": api_key.key_prefix})
    return ApiKeyCreatedResponse(
        id=api_key.id,
        name=api_key.name,
        key_prefix=api_key.key_prefix,
        created_at=api_key.created_at,
        key=key,
    )


@router.get("", response_model=List[ApiKeyResponse])
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.user_id == current_user.id)
        .order_by(ApiKey.created_at.desc())
    )
    return list(result.scalars().all())


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    api_key.revoked = True
    await db.flush()
    await audit(db, current_user.id, "apikey.revoke", "apikey", str(key_id),
                detail={"name": api_key.name, "key_prefix": api_key.key_prefix})
