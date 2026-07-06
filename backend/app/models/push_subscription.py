from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from sqlalchemy import DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PushSubscription(Base):
    """A browser Web Push subscription for a user.

    ``endpoint`` is the push-service URL handed out by the browser and
    ``keys`` holds the client key material, e.g.
    ``{"p256dh": "...", "auth": "..."}``.

    Only the subscription scaffolding lives here — actual delivery is out of
    scope for now. Workflow/schedule events can later use ``pywebpush`` with
    ``settings.VAPID_PUBLIC_KEY`` / ``settings.VAPID_PRIVATE_KEY`` to send
    notifications to every subscription of the target user.
    """

    __tablename__ = "push_subscriptions"
    __table_args__ = (
        UniqueConstraint("user_id", "endpoint", name="uq_push_subscriptions_user_endpoint"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    keys: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<PushSubscription id={self.id} user_id={self.user_id}>"
