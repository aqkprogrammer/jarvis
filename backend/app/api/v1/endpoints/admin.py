from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.audit import serialize_log
from app.core.database import get_db
from app.core.security import get_admin_user
from app.models.audit_log import AuditLog
from app.models.conversation import Conversation
from app.models.document import Document
from app.models.message import Message
from app.models.schedule import Schedule
from app.models.usage_record import UsageRecord
from app.models.user import User
from app.models.workflow import Workflow
from app.services import usage_service

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class AdminUserUpdate(BaseModel):
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None
    monthly_token_quota: Optional[int] = Field(None, ge=0)


def _serialize_user(user: User) -> Dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "is_active": user.is_active,
        "is_admin": user.is_superuser,
        "monthly_token_quota": user.monthly_token_quota,
        "created_at": user.created_at,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/stats")
async def platform_stats(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    users_total, users_active = (
        await db.execute(
            select(
                func.count(User.id),
                func.count(User.id).filter(User.is_active == True),  # noqa: E712
            )
        )
    ).one()
    conversations = (await db.execute(select(func.count(Conversation.id)))).scalar_one()
    messages = (await db.execute(select(func.count(Message.id)))).scalar_one()
    documents = (await db.execute(select(func.count(Document.id)))).scalar_one()
    workflows = (await db.execute(select(func.count(Workflow.id)))).scalar_one()
    schedules_total, schedules_active = (
        await db.execute(
            select(
                func.count(Schedule.id),
                func.count(Schedule.id).filter(Schedule.is_active == True),  # noqa: E712
            )
        )
    ).one()

    since = datetime.now(timezone.utc) - timedelta(days=30)
    tokens_30d, cost_30d = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(UsageRecord.input_tokens + UsageRecord.output_tokens), 0
                ),
                func.coalesce(func.sum(UsageRecord.cost_usd), 0),
            ).where(UsageRecord.created_at >= since)
        )
    ).one()

    return {
        "users": {"total": users_total, "active": users_active},
        "conversations": conversations,
        "messages": messages,
        "documents": documents,
        "workflows": workflows,
        "schedules": {"total": schedules_total, "active": schedules_active},
        "tokens_30d": int(tokens_30d),
        "cost_30d": float(cost_30d),
    }


@router.get("/users")
async def list_users(
    q: Optional[str] = Query(None, description="Substring match over email and username"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    since = datetime.now(timezone.utc) - timedelta(days=30)

    conv_sq = (
        select(
            Conversation.user_id.label("user_id"),
            func.count(Conversation.id).label("conversation_count"),
        )
        .group_by(Conversation.user_id)
        .subquery()
    )
    usage_sq = (
        select(
            UsageRecord.user_id.label("user_id"),
            func.coalesce(
                func.sum(UsageRecord.input_tokens + UsageRecord.output_tokens), 0
            ).label("tokens_30d"),
            func.coalesce(func.sum(UsageRecord.cost_usd), 0).label("cost_30d"),
        )
        .where(UsageRecord.created_at >= since)
        .group_by(UsageRecord.user_id)
        .subquery()
    )

    stmt = (
        select(
            User,
            conv_sq.c.conversation_count,
            usage_sq.c.tokens_30d,
            usage_sq.c.cost_30d,
        )
        .outerjoin(conv_sq, conv_sq.c.user_id == User.id)
        .outerjoin(usage_sq, usage_sq.c.user_id == User.id)
    )
    count_stmt = select(func.count(User.id))
    if q:
        like = f"%{q}%"
        cond = or_(User.email.ilike(like), User.username.ilike(like))
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    total = (await db.execute(count_stmt)).scalar_one()
    rows = (
        await db.execute(
            stmt.order_by(User.created_at.desc()).offset(offset).limit(limit)
        )
    ).all()

    items = [
        {
            **_serialize_user(user),
            "conversation_count": int(conversation_count or 0),
            "tokens_30d": int(tokens_30d or 0),
            "cost_30d": float(cost_30d or 0),
        }
        for user, conversation_count, tokens_30d, cost_30d in rows
    ]
    return {"items": items, "total": total}


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.id == admin.id and (payload.is_active is False or payload.is_admin is False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot deactivate or demote themselves",
        )

    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.is_admin is not None:
        user.is_superuser = payload.is_admin
    # Explicit null clears the quota (back to unlimited); absent field is a no-op.
    if "monthly_token_quota" in payload.model_fields_set:
        user.monthly_token_quota = payload.monthly_token_quota

    await db.flush()
    return _serialize_user(user)


@router.get("/usage/daily")
async def platform_usage_daily(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    return {"items": await usage_service.platform_daily_usage(db, days=days)}


@router.get("/audit")
async def list_all_audit_logs(
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None, description="Action prefix, e.g. 'auth.'"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """Audit trail across all users (admin only), newest first."""
    filters = []
    if user_id is not None:
        filters.append(AuditLog.user_id == str(user_id))
    if action:
        filters.append(AuditLog.action.like(f"{action}%"))

    total = (
        await db.execute(select(func.count()).select_from(AuditLog).where(*filters))
    ).scalar_one()
    result = await db.execute(
        select(AuditLog)
        .where(*filters)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return {"items": [serialize_log(l) for l in result.scalars().all()], "total": total}
