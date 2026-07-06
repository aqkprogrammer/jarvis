from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Workflow(Base):
    """A user-defined visual pipeline of connected nodes.

    Node shape (stored in ``nodes`` JSONB list):
        {
            "id": str,
            "type": "trigger" | "agent" | "condition" | "output",
            "position": {"x": float, "y": float},
            "data": {
                "label": str,
                "agent_type": str,   # agent nodes only (optional)
                "prompt": str,       # agent nodes only (optional)
                "condition": {       # condition nodes only
                    "field": "output",
                    "op": "contains" | "not_contains" | "equals",
                    "value": str,
                },
            },
        }

    Edge shape (stored in ``edges`` JSONB list):
        {"id": str, "source": str, "target": str}
    """

    __tablename__ = "workflows"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    nodes: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=list, nullable=False)
    edges: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=list, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

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
    runs: Mapped[list] = relationship(
        "WorkflowRun",
        back_populates="workflow",
        lazy="selectin",
        order_by="WorkflowRun.started_at.desc()",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Workflow id={self.id} name={self.name}>"


class WorkflowRun(Base):
    """A single execution of a workflow.

    ``node_results`` maps node_id -> {
        "status": "completed" | "failed" | "skipped",
        "output": str | None,      # truncated to 4000 chars
        "error": str | None,
        "duration_ms": int,
    }
    """

    __tablename__ = "workflow_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workflows.id", ondelete="CASCADE"),
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(20), default="running", nullable=False, index=True
    )  # running | completed | failed
    node_results: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    workflow: Mapped["Workflow"] = relationship("Workflow", back_populates="runs")

    def __repr__(self) -> str:
        return f"<WorkflowRun id={self.id} workflow_id={self.workflow_id} status={self.status}>"
