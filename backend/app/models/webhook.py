from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def generate_webhook_token() -> str:
    """Opaque bearer token used as the public trigger URL path segment."""
    return f"whk_{secrets.token_urlsafe(24)}"


class WebhookTrigger(Base):
    """An incoming webhook that starts a workflow when its URL is POSTed.

    The ``token`` is the only secret: anyone who knows the full public URL
    (``{API_BASE_URL}/api/v1/hooks/{token}``) can trigger the workflow, so
    tokens are unguessable (``whk_`` + 24 url-safe random bytes).
    """

    __tablename__ = "webhook_triggers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    token: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True, default=generate_webhook_token
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workflows.id", ondelete="CASCADE"),
        index=True,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    trigger_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_triggered_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User")
    workflow: Mapped["Workflow"] = relationship("Workflow")

    def __repr__(self) -> str:
        return f"<WebhookTrigger id={self.id} workflow_id={self.workflow_id} active={self.is_active}>"


class OutgoingWebhook(Base):
    """A user-registered URL that JARVIS notifies when events occur.

    ``events`` is a JSONB list of subscribed event names (see
    ``webhook_service.SUPPORTED_EVENTS``): "workflow.completed",
    "workflow.failed", "schedule.completed", "task.completed".

    When ``secret`` is set, each delivery carries an ``X-Jarvis-Signature``
    header: the hex SHA-256 HMAC of the raw request body.
    """

    __tablename__ = "outgoing_webhooks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    events: Mapped[List[str]] = mapped_column(JSONB, default=list, nullable=False)
    secret: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_status: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<OutgoingWebhook id={self.id} url={self.url} active={self.is_active}>"
