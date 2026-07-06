from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.logging import get_logger
from app.core.security import get_current_user
from app.models.user import User
from app.services.ai_provider import AIProviderFactory

router = APIRouter()
logger = get_logger(__name__)


# ── Agent registry ─────────────────────────────────────────────────────────────

AGENT_REGISTRY: Dict[str, Dict[str, Any]] = {
    "chat": {
        "name": "chat",
        "description": "General-purpose conversational assistant",
        "capabilities": ["conversation", "reasoning", "summarisation"],
        "available": True,
    },
    "web_search": {
        "name": "web_search",
        "description": "Search the web and synthesize results",
        "capabilities": ["search", "summarisation"],
        "available": settings.FEATURE_WEB_SEARCH_ENABLED,
    },
    "code": {
        "name": "code",
        "description": "Write, review, and explain code",
        "capabilities": ["code_generation", "code_review", "debugging"],
        "available": True,
    },
    "document": {
        "name": "document",
        "description": "Read and analyse documents (PDF, DOCX, XLSX)",
        "capabilities": ["document_parsing", "summarisation", "qa"],
        "available": True,
    },
    "computer_use": {
        "name": "computer_use",
        "description": "Control desktop applications",
        "capabilities": ["screen_control", "automation"],
        "available": settings.FEATURE_COMPUTER_USE_ENABLED,
    },
}


# ── Schemas ────────────────────────────────────────────────────────────────────

class AgentExecuteRequest(BaseModel):
    agent_name: str
    task: str = Field(..., min_length=1)
    context: Optional[Dict[str, Any]] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    max_tokens: int = Field(4096, ge=1)


class AgentExecuteResponse(BaseModel):
    agent: str
    result: str
    model: str
    provider: str
    tokens_used: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("")
async def list_agents(current_user: User = Depends(get_current_user)):
    return list(AGENT_REGISTRY.values())


@router.get("/{name}/status")
async def agent_status(name: str, current_user: User = Depends(get_current_user)):
    agent = AGENT_REGISTRY.get(name)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Agent '{name}' not found")
    return agent


@router.post("/execute", response_model=AgentExecuteResponse)
async def execute_agent(
    payload: AgentExecuteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    agent = AGENT_REGISTRY.get(payload.agent_name)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Agent '{payload.agent_name}' not found")
    if not agent["available"]:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Agent '{payload.agent_name}' is disabled")

    provider = AIProviderFactory.get(payload.provider)

    system_prompt = (
        f"You are the {payload.agent_name} agent of JARVIS. "
        f"Your specialization: {agent['description']}. "
        "Be precise, structured, and helpful."
    )

    messages = [{"role": "user", "content": payload.task}]
    if payload.context:
        context_text = "\n".join(f"{k}: {v}" for k, v in payload.context.items())
        messages.insert(0, {"role": "user", "content": f"Context:\n{context_text}"})

    result = await provider.complete(
        messages=messages,
        model=payload.model,
        max_tokens=payload.max_tokens,
        system=system_prompt,
    )

    return AgentExecuteResponse(
        agent=payload.agent_name,
        result=result.content,
        model=result.model,
        provider=provider.name,
        tokens_used=result.total_tokens,
    )
