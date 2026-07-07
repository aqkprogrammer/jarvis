from __future__ import annotations

from typing import Optional, Union

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.audit_log import AuditLog

logger = get_logger(__name__)

# Action naming convention: "resource.verb", e.g.
#   auth.login, auth.login_failed, document.upload, document.delete,
#   workflow.create, workflow.delete, workflow.run, schedule.create,
#   schedule.delete, apikey.create, apikey.revoke, integration.create,
#   integration.delete, workspace.create, workspace.delete,
#   workspace.member_remove, workspace.invite_create


async def audit(
    db: AsyncSession,
    user_id: Optional[Union[int, str]],
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    detail: Optional[dict] = None,
    ip: Optional[str] = None,
) -> None:
    """Write a best-effort audit trail entry. Never raises.

    Maps onto the existing AuditLog model: user_id/resource_id are stored as
    strings, `detail` goes into the JSON `metadata` column (attribute
    ``metadata_``).
    """
    try:
        entry = AuditLog(
            user_id=str(user_id) if user_id is not None else None,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            metadata_=detail or {},
            ip_address=ip,
        )
        db.add(entry)
        await db.flush()
    except Exception as exc:
        logger.warning("audit_write_failed", action=action, error=str(exc))
