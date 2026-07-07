from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.workflow import Workflow, WorkflowRun
from app.services import workflow_service
from app.services.audit_service import audit

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class WorkflowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)


class WorkflowUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    nodes: Optional[List[Dict[str, Any]]] = None
    edges: Optional[List[Dict[str, Any]]] = None
    is_active: Optional[bool] = None


class WorkflowResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    user_id: int
    name: str
    description: Optional[str] = None
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class WorkflowRunResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    workflow_id: UUID
    status: str
    node_results: Dict[str, Any]
    error: Optional[str] = None
    started_at: datetime
    finished_at: Optional[datetime] = None


class WorkflowRunRequest(BaseModel):
    input: str = ""


# ── Helpers ────────────────────────────────────────────────────────────────────

def _validate_or_400(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> None:
    try:
        workflow_service.validate_workflow(nodes, edges)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


async def _get_owned_workflow(
    db: AsyncSession, workflow_id: UUID, user_id: int
) -> Workflow:
    result = await db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.user_id == user_id)
    )
    workflow = result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=List[WorkflowResponse])
async def list_workflows(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Workflow)
        .where(Workflow.user_id == current_user.id)
        .order_by(Workflow.updated_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(result.scalars().all())


@router.post("", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    payload: WorkflowCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_or_400(payload.nodes, payload.edges)
    workflow = Workflow(
        user_id=current_user.id,
        name=payload.name,
        description=payload.description,
        nodes=payload.nodes,
        edges=payload.edges,
    )
    db.add(workflow)
    await db.flush()
    await audit(db, current_user.id, "workflow.create", "workflow", str(workflow.id),
                detail={"name": workflow.name})
    return workflow


@router.get("/runs/{run_id}", response_model=WorkflowRunResponse)
async def get_workflow_run(
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(WorkflowRun)
        .join(Workflow, WorkflowRun.workflow_id == Workflow.id)
        .where(WorkflowRun.id == run_id, Workflow.user_id == current_user.id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow run not found")
    return run


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_owned_workflow(db, workflow_id, current_user.id)


@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: UUID,
    payload: WorkflowUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workflow = await _get_owned_workflow(db, workflow_id, current_user.id)

    new_nodes = payload.nodes if payload.nodes is not None else workflow.nodes
    new_edges = payload.edges if payload.edges is not None else workflow.edges
    _validate_or_400(new_nodes, new_edges)

    if payload.name is not None:
        workflow.name = payload.name
    if payload.description is not None:
        workflow.description = payload.description
    if payload.is_active is not None:
        workflow.is_active = payload.is_active
    workflow.nodes = new_nodes
    workflow.edges = new_edges
    await db.flush()
    return workflow


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workflow = await _get_owned_workflow(db, workflow_id, current_user.id)
    name = workflow.name
    await db.delete(workflow)
    await db.flush()
    await audit(db, current_user.id, "workflow.delete", "workflow", str(workflow_id),
                detail={"name": name})


@router.post("/{workflow_id}/run", response_model=WorkflowRunResponse)
async def run_workflow(
    workflow_id: UUID,
    payload: WorkflowRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workflow = await _get_owned_workflow(db, workflow_id, current_user.id)
    _validate_or_400(workflow.nodes, workflow.edges)
    run = await workflow_service.execute_workflow(db, workflow, input_text=payload.input)
    await audit(db, current_user.id, "workflow.run", "workflow", str(workflow_id),
                detail={"run_id": str(run.id), "status": run.status})
    return run


@router.get("/{workflow_id}/runs", response_model=List[WorkflowRunResponse])
async def list_workflow_runs(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workflow = await _get_owned_workflow(db, workflow_id, current_user.id)
    result = await db.execute(
        select(WorkflowRun)
        .where(WorkflowRun.workflow_id == workflow.id)
        .order_by(WorkflowRun.started_at.desc())
        .limit(20)
    )
    return list(result.scalars().all())
