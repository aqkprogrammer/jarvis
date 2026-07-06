from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Memory(Base):
    __tablename__ = "memories"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    memory_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # fact | preference | event | skill

    content: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    importance_score: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    embedding_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    tags: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list, nullable=True)
    extra: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=dict, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    last_accessed: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    access_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="memories")

    def __repr__(self) -> str:
        return f"<Memory id={self.id} type={self.memory_type}>"
