from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.integration import Integration
from app.models.user import User
from app.services import integration_service
from app.services.audit_service import audit
from app.services.integration_service import IntegrationError

router = APIRouter()

Provider = Literal["github", "slack", "discord", "notion"]


# ── Schemas ────────────────────────────────────────────────────────────────────

class IntegrationCreate(BaseModel):
    provider: Provider
    name: str = Field(..., min_length=1, max_length=255)
    credentials: Dict[str, Any] = Field(default_factory=dict)
    config: Dict[str, Any] = Field(default_factory=dict)


class IntegrationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    credentials: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None


class IntegrationResponse(BaseModel):
    """Safe shape: credentials are NEVER returned, only has_credentials."""

    id: UUID
    provider: str
    name: str
    has_credentials: bool
    config: Dict[str, Any]
    status: str
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class IntegrationActionRequest(BaseModel):
    action: str = Field(..., min_length=1)
    params: Dict[str, Any] = Field(default_factory=dict)


class IntegrationTestResponse(BaseModel):
    status: str
    error: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _to_response(integration: Integration) -> IntegrationResponse:
    return IntegrationResponse(
        id=integration.id,
        provider=integration.provider,
        name=integration.name,
        has_credentials=bool(integration.credentials),
        config=integration.config or {},
        status=integration.status,
        last_error=integration.last_error,
        created_at=integration.created_at,
        updated_at=integration.updated_at,
    )


async def _get_owned_integration(
    db: AsyncSession, integration_id: UUID, user_id: int
) -> Integration:
    result = await db.execute(
        select(Integration).where(
            Integration.id == integration_id, Integration.user_id == user_id
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found")
    return integration


async def _apply_test(integration: Integration) -> None:
    """Run the provider test and record status/last_error on the integration."""
    try:
        await integration_service.test_integration(integration)
        integration.status = "connected"
        integration.last_error = None
    except (IntegrationError, ValueError) as exc:
        integration.status = "error"
        integration.last_error = str(exc)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=List[IntegrationResponse])
async def list_integrations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Integration)
        .where(Integration.user_id == current_user.id)
        .order_by(Integration.created_at.desc())
    )
    return [_to_response(i) for i in result.scalars().all()]


@router.post("", response_model=IntegrationResponse, status_code=status.HTTP_201_CREATED)
async def create_integration(
    payload: IntegrationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = Integration(
        user_id=current_user.id,
        provider=payload.provider,
        name=payload.name,
        credentials=payload.credentials,
        config=payload.config,
    )
    await _apply_test(integration)
    db.add(integration)
    await db.flush()
    await audit(db, current_user.id, "integration.create", "integration", str(integration.id),
                detail={"provider": integration.provider, "name": integration.name})
    return _to_response(integration)


@router.put("/{integration_id}", response_model=IntegrationResponse)
async def update_integration(
    integration_id: UUID,
    payload: IntegrationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = await _get_owned_integration(db, integration_id, current_user.id)
    if payload.name is not None:
        integration.name = payload.name
    if payload.credentials is not None:
        integration.credentials = payload.credentials
    if payload.config is not None:
        integration.config = payload.config
    await _apply_test(integration)
    await db.flush()
    return _to_response(integration)


@router.delete("/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(
    integration_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = await _get_owned_integration(db, integration_id, current_user.id)
    provider, name = integration.provider, integration.name
    await db.delete(integration)
    await db.flush()
    await audit(db, current_user.id, "integration.delete", "integration", str(integration_id),
                detail={"provider": provider, "name": name})


@router.post("/{integration_id}/test", response_model=IntegrationTestResponse)
async def test_integration(
    integration_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = await _get_owned_integration(db, integration_id, current_user.id)
    await _apply_test(integration)
    await db.flush()
    return IntegrationTestResponse(status=integration.status, error=integration.last_error)


@router.post("/{integration_id}/action")
async def run_integration_action(
    integration_id: UUID,
    payload: IntegrationActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = await _get_owned_integration(db, integration_id, current_user.id)
    try:
        result = await integration_service.run_action(
            integration, payload.action, payload.params
        )
    except (IntegrationError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return {"result": result}
