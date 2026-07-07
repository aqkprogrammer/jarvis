from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user_flexible
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    ConversationCreate,
    ConversationResponse,
    ConversationUpdate,
    MessageResponse,
    UsageInfo,
)
from app.services import usage_service
from app.services.chat_service import ChatService

router = APIRouter()


@router.post("")
async def send_message(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible),
):
    # Monthly token quota (check failures never block chat)
    if current_user.monthly_token_quota is not None and await usage_service.quota_exceeded(
        db, current_user.id, current_user.monthly_token_quota
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Monthly token quota exceeded",
        )

    svc = ChatService(db)

    if payload.stream:
        async def event_stream():
            gen = await svc.stream_chat(
                user_id=current_user.id,
                user_message=payload.message,
                conversation_id=payload.conversation_id,
                provider_name=payload.provider,
                model=payload.model,
                max_tokens=payload.max_tokens or 4096,
                temperature=payload.temperature or 0.7,
                system_prompt=payload.system_prompt,
                tools=payload.tools,
                document_ids=payload.document_ids,
            )
            async for chunk in gen:
                yield f"data: {json.dumps(chunk)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    # Non-streaming
    result = await svc.chat(
        user_id=current_user.id,
        user_message=payload.message,
        conversation_id=payload.conversation_id,
        provider_name=payload.provider,
        model=payload.model,
        max_tokens=payload.max_tokens or 4096,
        temperature=payload.temperature or 0.7,
        system_prompt=payload.system_prompt,
        tools=payload.tools,
        document_ids=payload.document_ids,
    )

    msg = result["message"]
    return ChatResponse(
        message=MessageResponse.model_validate(msg),
        usage=UsageInfo(**result["usage"]),
        model=result["model"],
        provider=result["provider"],
        conversation_id=result["conversation_id"],
    )


@router.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible),
):
    svc = ChatService(db)
    return await svc.list_conversations(current_user.id, limit=limit, offset=offset)


@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible),
):
    svc = ChatService(db)
    conv = await svc.get_or_create_conversation(current_user.id, title=payload.title)
    return conv


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible),
):
    svc = ChatService(db)
    conv = await svc.get_conversation_with_messages(conversation_id, current_user.id)
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conv


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible),
):
    svc = ChatService(db)
    deleted = await svc.delete_conversation(conversation_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")


@router.post("/conversations/{conversation_id}/clear", status_code=status.HTTP_204_NO_CONTENT)
async def clear_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible),
):
    svc = ChatService(db)
    cleared = await svc.clear_messages(conversation_id, current_user.id)
    if not cleared:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")


@router.patch("/conversations/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: int,
    payload: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if payload.title is not None:
        conv.title = payload.title
    if payload.archived is not None:
        conv.is_archived = payload.archived
    await db.flush()
    return conv


@router.get("/conversations/{conversation_id}/messages")
async def list_messages(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible),
):
    svc = ChatService(db)
    conv = await svc.get_conversation_with_messages(conversation_id, current_user.id)
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    items = [MessageResponse.model_validate(m) for m in conv.messages]
    return {"items": items, "total": len(items)}


@router.delete(
    "/conversations/{conversation_id}/messages/{message_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_message(
    conversation_id: int,
    message_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible),
):
    result = await db.execute(
        select(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
            Conversation.user_id == current_user.id,
        )
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    await db.delete(msg)
    await db.flush()
