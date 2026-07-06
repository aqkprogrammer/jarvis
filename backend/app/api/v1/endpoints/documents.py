from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.document import Document
from app.models.user import User
from app.services import document_service

router = APIRouter()

MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


# ── Schemas ────────────────────────────────────────────────────────────────────

class DocumentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    user_id: int
    filename: str
    content_type: Optional[str] = None
    size_bytes: int
    status: str
    error: Optional[str] = None
    chunk_count: int
    created_at: datetime
    updated_at: datetime


class DocumentSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    document_ids: Optional[List[str]] = None
    limit: int = Field(5, ge=1, le=20)


class DocumentSearchResult(BaseModel):
    content: str
    document_id: Optional[str] = None
    filename: Optional[str] = None
    score: float


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large (max 20MB)",
        )

    filename = file.filename or "untitled"
    suffix = Path(filename).suffix.lower()
    if suffix not in document_service.SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file type '{suffix or 'unknown'}'. "
                f"Supported types: {', '.join(sorted(document_service.SUPPORTED_EXTENSIONS))}"
            ),
        )

    document = Document(
        user_id=current_user.id,
        filename=filename,
        content_type=file.content_type,
        size_bytes=len(content),
        status="processing",
    )
    db.add(document)
    await db.flush()

    document = await document_service.process_document(db, document, content)
    return document


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await document_service.list_documents(
        db, user_id=current_user.id, limit=limit, offset=offset
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = await document_service.get_document(db, document_id, current_user.id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = await document_service.get_document(db, document_id, current_user.id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await document_service.delete_document(db, document)


@router.post("/search", response_model=List[DocumentSearchResult])
async def search_documents(
    payload: DocumentSearchRequest,
    current_user: User = Depends(get_current_user),
):
    results = await document_service.search_documents(
        query=payload.query,
        user_id=current_user.id,
        document_ids=payload.document_ids,
        limit=payload.limit,
    )
    return results
