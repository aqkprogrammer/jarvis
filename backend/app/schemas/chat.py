from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class MessageCreate(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system|tool)$")
    content: str = Field(..., min_length=1)
    metadata: Optional[Dict[str, Any]] = None


class MessageResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    conversation_id: int
    role: str
    content: str
    tokens_used: Optional[int] = None
    metadata_: Optional[Dict[str, Any]] = Field(None, alias="metadata_")
    created_at: datetime


class ConversationCreate(BaseModel):
    title: Optional[str] = None
    session_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ConversationResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    user_id: int
    title: Optional[str] = None
    session_id: Optional[str] = None
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    messages: List[MessageResponse] = []


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=32_000)
    conversation_id: Optional[int] = None
    model: Optional[str] = None          # overrides default
    provider: Optional[str] = None       # overrides default provider
    stream: bool = True
    system_prompt: Optional[str] = None  # override system prompt
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(None, ge=1, le=200_000)
    tools: Optional[List[Dict[str, Any]]] = None
    metadata: Optional[Dict[str, Any]] = None


class UsageInfo(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


class ChatResponse(BaseModel):
    message: MessageResponse
    usage: UsageInfo
    model: str
    provider: str
    conversation_id: int


class StreamChunk(BaseModel):
    type: str  # delta | done | error | tool_call
    content: Optional[str] = None
    delta: Optional[str] = None
    model: Optional[str] = None
    usage: Optional[UsageInfo] = None
    error: Optional[str] = None
    tool_call: Optional[Dict[str, Any]] = None
