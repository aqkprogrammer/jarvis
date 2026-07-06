from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Integration(Base):
    """A connection to an external service (GitHub, Slack, Discord, Notion).

    ``credentials`` holds provider secrets as plaintext JSONB — API tokens
    and webhook URLs, e.g. ``{"token": "ghp_..."}`` for GitHub or
    ``{"webhook_url": "https://hooks.slack.com/..."}`` for Slack.
    NOTE: production deployments should encrypt this column at rest
    (pgcrypto or application-level envelope encryption); the API layer must
    never return it to clients.

    ``config`` holds non-secret defaults such as a default repo, channel,
    or Notion parent page id.
    """

    __tablename__ = "integrations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    provider: Mapped[str] = mapped_column(
        String(20), nullable=False, index=True
    )  # github | slack | discord | notion
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    credentials: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    config: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)

    status: Mapped[str] = mapped_column(
        String(20), default="connected", nullable=False
    )  # connected | error
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<Integration id={self.id} provider={self.provider} status={self.status}>"
