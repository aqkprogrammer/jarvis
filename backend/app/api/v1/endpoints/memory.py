from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.memory_service import MemoryService

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class MemoryCreate(BaseModel):
    content: str = Field(..., min_length=1)
    memory_type: str = Field("fact", pattern="^(fact|preference|event|skill)$")
    importance_score: float = Field(0.5, ge=0.0, le=1.0)
    tags: Optional[List[str]] = None
    summary: Optional[str] = None


class MemoryUpdate(BaseModel):
    content: Optional[str] = None
    memory_type: Optional[str] = None
    importance_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    tags: Optional[List[str]] = None
    summary: Optional[str] = None


class MemoryResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    user_id: int
    memory_type: str
    content: str
    summary: Optional[str]
    importance_score: float
    embedding_id: Optional[str]
    tags: Optional[List[str]]
    access_count: int


class MemorySearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = Field(10, ge=1, le=50)
    score_threshold: float = Field(0.5, ge=0.0, le=1.0)
    memory_type: Optional[str] = None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=List[MemoryResponse])
async def list_memories(
    memory_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = MemoryService(db)
    return await svc.list_memories(
        user_id=current_user.id, memory_type=memory_type, limit=limit, offset=offset
    )


@router.post("", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
async def create_memory(
    payload: MemoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = MemoryService(db)
    return await svc.create(
        user_id=current_user.id,
        content=payload.content,
        memory_type=payload.memory_type,
        importance_score=payload.importance_score,
        tags=payload.tags,
        summary=payload.summary,
    )


@router.put("/{memory_id}", response_model=MemoryResponse)
async def update_memory(
    memory_id: int,
    payload: MemoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = MemoryService(db)
    updated = await svc.update(
        memory_id,
        current_user.id,
        **{k: v for k, v in payload.model_dump().items() if v is not None},
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")
    return updated


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(
    memory_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = MemoryService(db)
    deleted = await svc.delete(memory_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")


@router.post("/search")
async def search_memories(
    payload: MemorySearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = MemoryService(db)
    results = await svc.search(
        user_id=current_user.id,
        query=payload.query,
        limit=payload.limit,
        score_threshold=payload.score_threshold,
    )
    return [{"memory": MemoryResponse.model_validate(r["memory"]), "score": r["score"]} for r in results]


@router.get("/stats")
async def memory_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = MemoryService(db)
    return await svc.get_stats(current_user.id)
