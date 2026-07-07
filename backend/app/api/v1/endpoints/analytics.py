"""Legacy analytics endpoints consumed by the dashboard's Analytics page.

Shapes intentionally match the frontend's `api.analytics` contract
(usage overview, daily series, model distribution). Newer, richer cost
data lives under /usage — these aggregate the same usage_records table.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.conversation import Conversation
from app.models.memory import Memory
from app.models.message import Message
from app.models.task import Task
from app.models.usage_record import UsageRecord
from app.models.user import User

router = APIRouter()


@router.get("/usage")
async def usage_overview(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid = current_user.id

    conv_count = (
        await db.execute(
            select(func.count()).select_from(Conversation).where(Conversation.user_id == uid)
        )
    ).scalar() or 0
    msg_count = (
        await db.execute(
            select(func.count())
            .select_from(Message)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(Conversation.user_id == uid)
        )
    ).scalar() or 0
    task_total = (
        await db.execute(select(func.count()).select_from(Task).where(Task.user_id == uid))
    ).scalar() or 0
    task_done = (
        await db.execute(
            select(func.count())
            .select_from(Task)
            .where(Task.user_id == uid, Task.status == "completed")
        )
    ).scalar() or 0
    memory_count = (
        await db.execute(select(func.count()).select_from(Memory).where(Memory.user_id == uid))
    ).scalar() or 0

    tokens, cost = (
        await db.execute(
            select(
                func.coalesce(func.sum(UsageRecord.input_tokens + UsageRecord.output_tokens), 0),
                func.coalesce(func.sum(UsageRecord.cost_usd), 0),
            ).where(UsageRecord.user_id == uid)
        )
    ).one()

    return {
        "total_tokens": int(tokens),
        "total_messages": int(msg_count),
        "total_conversations": int(conv_count),
        "avg_response_time_ms": 0,  # not tracked yet
        "total_tasks": int(task_total),
        "tasks_completed": int(task_done),
        "memory_count": int(memory_count),
        "api_cost_usd": round(float(cost), 4),
    }


@router.get("/daily")
async def daily_series(
    days: int = Query(30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    day = func.date(UsageRecord.created_at)
    rows = (
        await db.execute(
            select(
                day.label("date"),
                func.count().label("requests"),
                func.coalesce(
                    func.sum(UsageRecord.input_tokens + UsageRecord.output_tokens), 0
                ).label("tokens"),
                func.coalesce(func.sum(UsageRecord.cost_usd), 0).label("cost"),
            )
            .where(UsageRecord.user_id == current_user.id, UsageRecord.created_at >= since)
            .group_by(day)
            .order_by(day)
        )
    ).all()
    return {
        "items": [
            {
                "date": str(r.date),
                "messages": int(r.requests),
                "tokens": int(r.tokens),
                "cost": round(float(r.cost), 4),
            }
            for r in rows
        ]
    }


@router.get("/models")
async def model_distribution(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        await db.execute(
            select(
                UsageRecord.model,
                func.coalesce(
                    func.sum(UsageRecord.input_tokens + UsageRecord.output_tokens), 0
                ).label("tokens"),
            )
            .where(UsageRecord.user_id == current_user.id)
            .group_by(UsageRecord.model)
            .order_by(func.sum(UsageRecord.input_tokens + UsageRecord.output_tokens).desc())
        )
    ).all()
    total = sum(int(r.tokens) for r in rows) or 1
    return {
        "items": [
            {
                "model": r.model,
                "tokens": int(r.tokens),
                "percentage": round(100.0 * int(r.tokens) / total, 1),
            }
            for r in rows
        ]
    }
