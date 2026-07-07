from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.conversation import Conversation
from app.models.usage_record import UsageRecord

logger = get_logger(__name__)

# ── Pricing ───────────────────────────────────────────────────────────────────
# USD per 1M tokens, keyed by model-name prefix (longest prefix wins).
# Prices are approximate as of mid-2025 and are meant for cost *estimates*,
# not billing-grade accounting.
MODEL_PRICING: Dict[str, Dict[str, float]] = {
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
    "claude-opus": {"input": 15.00, "output": 75.00},
    "claude-haiku": {"input": 0.80, "output": 4.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "llama": {"input": 0.59, "output": 0.79},
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "default": {"input": 1.00, "output": 2.00},
}


def _pricing_for(model: Optional[str]) -> Dict[str, float]:
    """Match by longest model-name prefix; fall back to 'default'."""
    name = (model or "").lower()
    matches = [k for k in MODEL_PRICING if k != "default" and name.startswith(k)]
    if not matches:
        return MODEL_PRICING["default"]
    return MODEL_PRICING[max(matches, key=len)]


def compute_cost(model: Optional[str], input_tokens: int, output_tokens: int) -> float:
    pricing = _pricing_for(model)
    cost = (
        (input_tokens or 0) / 1_000_000 * pricing["input"]
        + (output_tokens or 0) / 1_000_000 * pricing["output"]
    )
    return round(cost, 6)


# ── Recording ─────────────────────────────────────────────────────────────────

async def record_usage(
    db: AsyncSession,
    user_id: int,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    conversation_id: Optional[int] = None,
    estimated: bool = False,
) -> None:
    """Persist a usage record. Best-effort: failures are logged, never raised."""
    try:
        record = UsageRecord(
            user_id=user_id,
            conversation_id=conversation_id,
            provider=provider or "unknown",
            model=model or "unknown",
            input_tokens=int(input_tokens or 0),
            output_tokens=int(output_tokens or 0),
            cost_usd=Decimal(str(compute_cost(model, input_tokens, output_tokens))),
            estimated=estimated,
        )
        db.add(record)
        await db.flush()
    except Exception as exc:
        logger.warning("usage_record_failed", user_id=user_id, error=str(exc))


# ── Aggregations ──────────────────────────────────────────────────────────────

def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def month_usage(db: AsyncSession, user_id: int) -> Dict[str, Any]:
    """Aggregate usage for the current UTC calendar month (single query)."""
    result = await db.execute(
        select(
            func.coalesce(func.sum(UsageRecord.input_tokens), 0),
            func.coalesce(func.sum(UsageRecord.output_tokens), 0),
            func.coalesce(func.sum(UsageRecord.cost_usd), 0),
        ).where(
            UsageRecord.user_id == user_id,
            UsageRecord.created_at >= _month_start(),
        )
    )
    input_tokens, output_tokens, cost = result.one()
    return {
        "input_tokens": int(input_tokens),
        "output_tokens": int(output_tokens),
        "total_tokens": int(input_tokens) + int(output_tokens),
        "cost_usd": float(cost),
    }


async def quota_exceeded(db: AsyncSession, user_id: int, quota: int) -> bool:
    """True when the user's month-to-date tokens meet/exceed the quota.

    Guarded: any failure returns False so a broken quota check never blocks chat.
    """
    try:
        usage = await month_usage(db, user_id)
        return usage["total_tokens"] >= quota
    except Exception as exc:
        logger.warning("quota_check_failed", user_id=user_id, error=str(exc))
        return False


async def daily_usage(
    db: AsyncSession, user_id: int, days: int = 30
) -> List[Dict[str, Any]]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    day = func.date(UsageRecord.created_at)
    result = await db.execute(
        select(
            day.label("date"),
            func.coalesce(func.sum(UsageRecord.input_tokens), 0),
            func.coalesce(func.sum(UsageRecord.output_tokens), 0),
            func.coalesce(func.sum(UsageRecord.cost_usd), 0),
        )
        .where(UsageRecord.user_id == user_id, UsageRecord.created_at >= since)
        .group_by(day)
        .order_by(day)
    )
    return [
        {
            "date": str(date),
            "input_tokens": int(input_tokens),
            "output_tokens": int(output_tokens),
            "cost_usd": float(cost),
        }
        for date, input_tokens, output_tokens, cost in result.all()
    ]


async def usage_by_model(
    db: AsyncSession, user_id: int, days: int = 30
) -> List[Dict[str, Any]]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    total = func.coalesce(
        func.sum(UsageRecord.input_tokens + UsageRecord.output_tokens), 0
    )
    result = await db.execute(
        select(
            UsageRecord.model,
            UsageRecord.provider,
            total.label("total_tokens"),
            func.coalesce(func.sum(UsageRecord.cost_usd), 0).label("cost_usd"),
            func.count(UsageRecord.id).label("requests"),
        )
        .where(UsageRecord.user_id == user_id, UsageRecord.created_at >= since)
        .group_by(UsageRecord.model, UsageRecord.provider)
        .order_by(total.desc())
    )
    return [
        {
            "model": model,
            "provider": provider,
            "total_tokens": int(total_tokens),
            "cost_usd": float(cost),
            "requests": int(requests),
        }
        for model, provider, total_tokens, cost, requests in result.all()
    ]


async def top_conversations(
    db: AsyncSession, user_id: int, days: int = 30, limit: int = 10
) -> List[Dict[str, Any]]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    total = func.coalesce(
        func.sum(UsageRecord.input_tokens + UsageRecord.output_tokens), 0
    )
    cost = func.coalesce(func.sum(UsageRecord.cost_usd), 0)
    result = await db.execute(
        select(
            UsageRecord.conversation_id,
            Conversation.title,
            total.label("total_tokens"),
            cost.label("cost_usd"),
        )
        .outerjoin(Conversation, Conversation.id == UsageRecord.conversation_id)
        .where(
            UsageRecord.user_id == user_id,
            UsageRecord.created_at >= since,
            UsageRecord.conversation_id.is_not(None),
        )
        .group_by(UsageRecord.conversation_id, Conversation.title)
        .order_by(cost.desc())
        .limit(limit)
    )
    return [
        {
            "conversation_id": conversation_id,
            "title": title,
            "total_tokens": int(total_tokens),
            "cost_usd": float(cost_usd),
        }
        for conversation_id, title, total_tokens, cost_usd in result.all()
    ]


async def platform_daily_usage(db: AsyncSession, days: int = 30) -> List[Dict[str, Any]]:
    """Same shape as daily_usage, aggregated across all users (admin)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    day = func.date(UsageRecord.created_at)
    result = await db.execute(
        select(
            day.label("date"),
            func.coalesce(func.sum(UsageRecord.input_tokens), 0),
            func.coalesce(func.sum(UsageRecord.output_tokens), 0),
            func.coalesce(func.sum(UsageRecord.cost_usd), 0),
        )
        .where(UsageRecord.created_at >= since)
        .group_by(day)
        .order_by(day)
    )
    return [
        {
            "date": str(date),
            "input_tokens": int(input_tokens),
            "output_tokens": int(output_tokens),
            "cost_usd": float(cost),
        }
        for date, input_tokens, output_tokens, cost in result.all()
    ]
