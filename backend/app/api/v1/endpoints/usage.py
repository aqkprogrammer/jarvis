from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services import usage_service

router = APIRouter()


@router.get("/summary")
async def usage_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Current UTC month usage plus quota status for the current user."""
    usage = await usage_service.month_usage(db, current_user.id)
    quota = current_user.monthly_token_quota
    quota_used_pct = (
        round(usage["total_tokens"] / quota * 100, 2) if quota else None
    )
    return {**usage, "quota": quota, "quota_used_pct": quota_used_pct}


@router.get("/daily")
async def usage_daily(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"items": await usage_service.daily_usage(db, current_user.id, days=days)}


@router.get("/by-model")
async def usage_by_model(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"items": await usage_service.usage_by_model(db, current_user.id, days=days)}


@router.get("/top-conversations")
async def usage_top_conversations(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {
        "items": await usage_service.top_conversations(db, current_user.id, days=days)
    }
