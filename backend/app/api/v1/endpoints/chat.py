from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    ConversationCreate,
    ConversationResponse,
    MessageResponse,
    UsageInfo,
)
from app.services.chat_service import ChatService

router = APIRouter()


@router.post("")
async def send_message(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    current_user: User = Depends(get_current_user),
):
    svc = ChatService(db)
    return await svc.list_conversations(current_user.id, limit=limit, offset=offset)


@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = ChatService(db)
    conv = await svc.get_or_create_conversation(current_user.id, title=payload.title)
    return conv


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
):
    svc = ChatService(db)
    deleted = await svc.delete_conversation(conversation_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")


@router.post("/conversations/{conversation_id}/clear", status_code=status.HTTP_204_NO_CONTENT)
async def clear_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = ChatService(db)
    cleared = await svc.clear_messages(conversation_id, current_user.id)
    if not cleared:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
