from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Literal, Optional, Tuple
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceInvite, WorkspaceMember

router = APIRouter()

Role = Literal["admin", "member"]


# ── Schemas ────────────────────────────────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class WorkspaceUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class WorkspaceResponse(BaseModel):
    id: UUID
    name: str
    owner_id: int
    member_count: int
    my_role: str
    created_at: datetime
    updated_at: datetime


class MemberResponse(BaseModel):
    user_id: int
    username: str
    email: str
    role: str
    joined_at: datetime


class MemberRoleUpdate(BaseModel):
    role: Role


class InviteCreate(BaseModel):
    email: EmailStr
    role: Role = "member"


class InviteResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    email: str
    role: str
    token: str
    invite_url: str
    expires_at: datetime
    accepted: bool
    created_at: datetime


class InviteAccept(BaseModel):
    token: str = Field(..., min_length=1)


class ShareConversationRequest(BaseModel):
    conversation_id: int


class ShareConversationResponse(BaseModel):
    conversation_id: int
    workspace_id: Optional[UUID] = None
    shared: bool


class WorkspaceConversationResponse(BaseModel):
    id: int
    title: Optional[str] = None
    user_id: int
    updated_at: datetime
    message_count: int


# ── Helpers ────────────────────────────────────────────────────────────────────

async def get_membership(
    db: AsyncSession, workspace_id: UUID, user_id: int
) -> Tuple[Workspace, str]:
    """Return (workspace, role) for the user, 404 if the workspace does not
    exist, 403 if the user is neither the owner nor a member.

    The owner is always treated as an admin, even without a membership row.
    """
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    if workspace.owner_id == user_id:
        return workspace, "admin"
    member = next((m for m in workspace.members if m.user_id == user_id), None)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this workspace"
        )
    return workspace, member.role


async def _require_admin(db: AsyncSession, workspace_id: UUID, user_id: int) -> Workspace:
    workspace, role = await get_membership(db, workspace_id, user_id)
    if role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Workspace admin role required"
        )
    return workspace


def _to_response(workspace: Workspace, my_role: str, member_count: Optional[int] = None) -> WorkspaceResponse:
    return WorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        owner_id=workspace.owner_id,
        member_count=member_count if member_count is not None else len(workspace.members),
        my_role=my_role,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
    )


def _invite_to_response(invite: WorkspaceInvite) -> InviteResponse:
    return InviteResponse(
        id=invite.id,
        workspace_id=invite.workspace_id,
        email=invite.email,
        role=invite.role,
        token=invite.token,
        invite_url=f"{settings.API_BASE_URL}/invite/{invite.token}",
        expires_at=invite.expires_at,
        accepted=invite.accepted,
        created_at=invite.created_at,
    )


async def _get_owned_conversation(
    db: AsyncSession, conversation_id: int, user_id: int
) -> Conversation:
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


# ── Endpoints: workspaces ──────────────────────────────────────────────────────

@router.get("", response_model=List[WorkspaceResponse])
async def list_workspaces(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Workspaces the current user belongs to (via membership or ownership)."""
    member_ws_ids = (
        select(WorkspaceMember.workspace_id)
        .where(WorkspaceMember.user_id == current_user.id)
        .scalar_subquery()
    )
    result = await db.execute(
        select(Workspace)
        .where(or_(Workspace.owner_id == current_user.id, Workspace.id.in_(member_ws_ids)))
        .order_by(Workspace.created_at.desc())
    )
    workspaces = list(result.scalars().all())

    responses: List[WorkspaceResponse] = []
    for workspace in workspaces:
        if workspace.owner_id == current_user.id:
            my_role = "admin"
        else:
            member = next((m for m in workspace.members if m.user_id == current_user.id), None)
            my_role = member.role if member else "member"
        responses.append(_to_response(workspace, my_role))
    return responses


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    payload: WorkspaceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a workspace; the creator becomes owner and admin member."""
    workspace = Workspace(name=payload.name, owner_id=current_user.id)
    db.add(workspace)
    await db.flush()
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=current_user.id, role="admin"))
    await db.flush()
    return _to_response(workspace, my_role="admin", member_count=1)


@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: UUID,
    payload: WorkspaceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace = await _require_admin(db, workspace_id, current_user.id)
    workspace.name = payload.name
    await db.flush()
    my_role = "admin"
    return _to_response(workspace, my_role)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, _ = await get_membership(db, workspace_id, current_user.id)
    if workspace.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the workspace owner can delete it",
        )
    await db.delete(workspace)
    await db.flush()


# ── Endpoints: members ─────────────────────────────────────────────────────────

@router.get("/{workspace_id}/members", response_model=List[MemberResponse])
async def list_members(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, _ = await get_membership(db, workspace_id, current_user.id)
    result = await db.execute(
        select(WorkspaceMember, User)
        .join(User, WorkspaceMember.user_id == User.id)
        .where(WorkspaceMember.workspace_id == workspace.id)
        .order_by(WorkspaceMember.joined_at)
    )
    return [
        MemberResponse(
            user_id=member.user_id,
            username=user.username,
            email=user.email,
            role=member.role,
            joined_at=member.joined_at,
        )
        for member, user in result.all()
    ]


@router.delete("/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    workspace_id: UUID,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace = await _require_admin(db, workspace_id, current_user.id)
    if user_id == workspace.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The workspace owner cannot be removed",
        )
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace.id, WorkspaceMember.user_id == user_id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    await db.delete(member)
    await db.flush()


@router.put("/{workspace_id}/members/{user_id}", response_model=MemberResponse)
async def update_member_role(
    workspace_id: UUID,
    user_id: int,
    payload: MemberRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace = await _require_admin(db, workspace_id, current_user.id)
    if user_id == workspace.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The workspace owner's role cannot be changed",
        )
    result = await db.execute(
        select(WorkspaceMember, User)
        .join(User, WorkspaceMember.user_id == User.id)
        .where(
            WorkspaceMember.workspace_id == workspace.id, WorkspaceMember.user_id == user_id
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    member, user = row
    member.role = payload.role
    await db.flush()
    return MemberResponse(
        user_id=member.user_id,
        username=user.username,
        email=user.email,
        role=member.role,
        joined_at=member.joined_at,
    )


# ── Endpoints: invites ─────────────────────────────────────────────────────────

@router.post("/invites/accept", response_model=WorkspaceResponse)
async def accept_invite(
    payload: InviteAccept,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accept an invite as the current authenticated user.

    The unguessable token is the credential: whoever presents it joins with
    the invited role. Idempotent for users who are already members.
    """
    result = await db.execute(
        select(WorkspaceInvite).where(WorkspaceInvite.token == payload.token)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.accepted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invite has already been accepted"
        )
    if invite.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite has expired")

    ws_result = await db.execute(select(Workspace).where(Workspace.id == invite.workspace_id))
    workspace = ws_result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    member_count = len(workspace.members)
    existing = next((m for m in workspace.members if m.user_id == current_user.id), None)
    if workspace.owner_id == current_user.id:
        my_role = "admin"
    elif existing:
        my_role = existing.role
    else:
        db.add(
            WorkspaceMember(
                workspace_id=workspace.id, user_id=current_user.id, role=invite.role
            )
        )
        my_role = invite.role
        member_count += 1

    invite.accepted = True
    await db.flush()
    return _to_response(workspace, my_role, member_count=member_count)


@router.post(
    "/{workspace_id}/invites",
    response_model=InviteResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_invite(
    workspace_id: UUID,
    payload: InviteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace = await _require_admin(db, workspace_id, current_user.id)
    invite = WorkspaceInvite(
        workspace_id=workspace.id,
        email=payload.email,
        role=payload.role,
        invited_by=current_user.id,
    )
    db.add(invite)
    await db.flush()
    return _invite_to_response(invite)


@router.get("/{workspace_id}/invites", response_model=List[InviteResponse])
async def list_invites(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pending (unaccepted, unexpired) invites. Admin only: tokens are credentials."""
    workspace = await _require_admin(db, workspace_id, current_user.id)
    result = await db.execute(
        select(WorkspaceInvite)
        .where(
            WorkspaceInvite.workspace_id == workspace.id,
            WorkspaceInvite.accepted == False,  # noqa: E712
            WorkspaceInvite.expires_at > datetime.now(timezone.utc),
        )
        .order_by(WorkspaceInvite.created_at.desc())
    )
    return [_invite_to_response(i) for i in result.scalars().all()]


@router.delete("/{workspace_id}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invite(
    workspace_id: UUID,
    invite_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace = await _require_admin(db, workspace_id, current_user.id)
    result = await db.execute(
        select(WorkspaceInvite).where(
            WorkspaceInvite.id == invite_id, WorkspaceInvite.workspace_id == workspace.id
        )
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    await db.delete(invite)
    await db.flush()


# ── Endpoints: shared conversations ────────────────────────────────────────────

@router.post("/{workspace_id}/share-conversation", response_model=ShareConversationResponse)
async def share_conversation(
    workspace_id: UUID,
    payload: ShareConversationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Share a conversation you own into a workspace you are a member of."""
    workspace, _ = await get_membership(db, workspace_id, current_user.id)
    conversation = await _get_owned_conversation(db, payload.conversation_id, current_user.id)
    conversation.workspace_id = workspace.id
    await db.flush()
    return ShareConversationResponse(
        conversation_id=conversation.id, workspace_id=conversation.workspace_id, shared=True
    )


@router.post("/{workspace_id}/unshare-conversation", response_model=ShareConversationResponse)
async def unshare_conversation(
    workspace_id: UUID,
    payload: ShareConversationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, _ = await get_membership(db, workspace_id, current_user.id)
    conversation = await _get_owned_conversation(db, payload.conversation_id, current_user.id)
    if conversation.workspace_id != workspace.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Conversation is not shared to this workspace",
        )
    conversation.workspace_id = None
    await db.flush()
    return ShareConversationResponse(
        conversation_id=conversation.id, workspace_id=None, shared=False
    )


@router.get("/{workspace_id}/conversations", response_model=List[WorkspaceConversationResponse])
async def list_workspace_conversations(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Conversations shared to this workspace."""
    workspace, _ = await get_membership(db, workspace_id, current_user.id)
    result = await db.execute(
        select(
            Conversation.id,
            Conversation.title,
            Conversation.user_id,
            Conversation.updated_at,
            func.count(Message.id).label("message_count"),
        )
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.workspace_id == workspace.id)
        .group_by(
            Conversation.id, Conversation.title, Conversation.user_id, Conversation.updated_at
        )
        .order_by(Conversation.updated_at.desc())
    )
    return [
        WorkspaceConversationResponse(
            id=row.id,
            title=row.title,
            user_id=row.user_id,
            updated_at=row.updated_at,
            message_count=row.message_count,
        )
        for row in result.all()
    ]
