from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False, index=True
    )  # pending | running | completed | failed | cancelled
    priority: Mapped[int] = mapped_column(Integer, default=5, nullable=False)  # 1 (high) – 10 (low)
    agent_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    input_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=dict, nullable=True)
    output_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=dict, nullable=True)

    retries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)

    parent_task_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )

    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="tasks")
    subtasks: Mapped[list] = relationship(
        "Task",
        backref="parent",
        foreign_keys=[parent_task_id],
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Task id={self.id} status={self.status}>"
