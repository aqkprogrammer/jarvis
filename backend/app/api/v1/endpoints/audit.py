from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.audit_log import AuditLog
from app.models.user import User

router = APIRouter()


def serialize_log(log: AuditLog) -> Dict[str, Any]:
    return {
        "id": log.id,
        "user_id": log.user_id,
        "action": log.action,
        "resource_type": log.resource_type,
        "resource_id": log.resource_id,
        "metadata": log.metadata_ or {},
        "ip_address": log.ip_address,
        "created_at": log.created_at,
    }


@router.get("")
async def list_audit_logs(
    action: Optional[str] = Query(None, description="Action prefix, e.g. 'workflow.'"),
    resource_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Substring match over action and resource_id"),
    from_: Optional[datetime] = Query(None, alias="from"),
    to: Optional[datetime] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The current user's audit trail, newest first."""
    filters = [AuditLog.user_id == str(current_user.id)]
    if action:
        filters.append(AuditLog.action.like(f"{action}%"))
    if resource_type:
        filters.append(AuditLog.resource_type == resource_type)
    if q:
        like = f"%{q}%"
        filters.append(or_(AuditLog.action.ilike(like), AuditLog.resource_id.ilike(like)))
    if from_:
        filters.append(AuditLog.created_at >= from_)
    if to:
        filters.append(AuditLog.created_at <= to)

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
