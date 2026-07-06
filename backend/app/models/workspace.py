from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _default_invite_token() -> str:
    return f"inv_{secrets.token_urlsafe(24)}"


def _default_invite_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=7)


class Workspace(Base):
    """A shared space where multiple users collaborate.

    The owner has irrevocable admin rights; other users join through
    ``WorkspaceMember`` rows (role ``admin`` or ``member``). Conversations can
    be shared into a workspace via ``Conversation.workspace_id``.
    """

    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

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
    owner: Mapped["User"] = relationship("User")
    members: Mapped[list] = relationship(
        "WorkspaceMember",
        back_populates="workspace",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    invites: Mapped[list] = relationship(
        "WorkspaceInvite",
        back_populates="workspace",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Workspace id={self.id} name={self.name}>"


class WorkspaceMember(Base):
    """Membership of a user in a workspace with a role (``admin`` | ``member``)."""

    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_members_workspace_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    role: Mapped[str] = mapped_column(
        String(20), default="member", nullable=False
    )  # admin | member

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="members")
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<WorkspaceMember workspace_id={self.workspace_id} user_id={self.user_id} role={self.role}>"


class WorkspaceInvite(Base):
    """An email invitation to join a workspace.

    The unguessable ``token`` (``inv_`` + 24 url-safe random bytes) is the only
    credential: any authenticated user presenting it before ``expires_at``
    becomes a member with the invited ``role``.
    """

    __tablename__ = "workspace_invites"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    token: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False, default=_default_invite_token
    )
    role: Mapped[str] = mapped_column(
        String(20), default="member", nullable=False
    )  # admin | member
    invited_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_default_invite_expiry,
        nullable=False,
    )
    accepted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="invites")
    inviter: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<WorkspaceInvite id={self.id} workspace_id={self.workspace_id} email={self.email}>"
