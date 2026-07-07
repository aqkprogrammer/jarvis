from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from croniter import croniter
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.schedule import Schedule
from app.models.user import User
from app.models.workflow import Workflow
from app.services import scheduler_service
from app.services.audit_service import audit

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class ScheduleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    cron: str = Field(..., min_length=1, max_length=100)
    target_type: str = Field(..., pattern="^(workflow|prompt)$")
    workflow_id: Optional[UUID] = None
    prompt: Optional[str] = None
    is_active: bool = True


class ScheduleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    cron: Optional[str] = Field(None, min_length=1, max_length=100)
    target_type: Optional[str] = Field(None, pattern="^(workflow|prompt)$")
    workflow_id: Optional[UUID] = None
    prompt: Optional[str] = None
    is_active: Optional[bool] = None


class ScheduleResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    user_id: int
    name: str
    cron: str
    target_type: str
    workflow_id: Optional[UUID] = None
    prompt: Optional[str] = None
    is_active: bool
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    last_status: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ── Helpers ────────────────────────────────────────────────────────────────────

def _validate_cron_or_400(cron: str) -> None:
    if len(cron.split()) != 5 or not croniter.is_valid(cron):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid cron expression '{cron}' (expected 5 fields, e.g. '*/15 * * * *')",
        )


async def _validate_target_or_400(
    db: AsyncSession,
    user_id: int,
    target_type: str,
    workflow_id: Optional[UUID],
    prompt: Optional[str],
) -> None:
    if target_type == "workflow":
        if not workflow_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="workflow_id is required when target_type is 'workflow'",
            )
        result = await db.execute(
            select(Workflow).where(Workflow.id == workflow_id, Workflow.user_id == user_id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    elif target_type == "prompt":
        if not prompt or not prompt.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="prompt is required when target_type is 'prompt'",
            )


async def _get_owned_schedule(db: AsyncSession, schedule_id: UUID, user_id: int) -> Schedule:
    result = await db.execute(
        select(Schedule).where(Schedule.id == schedule_id, Schedule.user_id == user_id)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    return schedule


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ScheduleResponse])
async def list_schedules(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Schedule)
        .where(Schedule.user_id == current_user.id)
        .order_by(Schedule.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(result.scalars().all())


@router.post("", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    payload: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_cron_or_400(payload.cron)
    await _validate_target_or_400(
        db, current_user.id, payload.target_type, payload.workflow_id, payload.prompt
    )
    schedule = Schedule(
        user_id=current_user.id,
        name=payload.name,
        cron=payload.cron,
        target_type=payload.target_type,
        workflow_id=payload.workflow_id,
        prompt=payload.prompt,
        is_active=payload.is_active,
        next_run_at=scheduler_service.compute_next_run_at(payload.cron),
    )
    db.add(schedule)
    await db.flush()
    await audit(db, current_user.id, "schedule.create", "schedule", str(schedule.id),
                detail={"name": schedule.name, "cron": schedule.cron})
    return schedule


@router.put("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: UUID,
    payload: ScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    schedule = await _get_owned_schedule(db, schedule_id, current_user.id)

    new_cron = payload.cron if payload.cron is not None else schedule.cron
    new_target_type = (
        payload.target_type if payload.target_type is not None else schedule.target_type
    )
    new_workflow_id = (
        payload.workflow_id if payload.workflow_id is not None else schedule.workflow_id
    )
    new_prompt = payload.prompt if payload.prompt is not None else schedule.prompt

    _validate_cron_or_400(new_cron)
    await _validate_target_or_400(
        db, current_user.id, new_target_type, new_workflow_id, new_prompt
    )

    if payload.name is not None:
        schedule.name = payload.name
    if payload.is_active is not None:
        schedule.is_active = payload.is_active
    schedule.cron = new_cron
    schedule.target_type = new_target_type
    schedule.workflow_id = new_workflow_id
    schedule.prompt = new_prompt
    schedule.next_run_at = scheduler_service.compute_next_run_at(new_cron)
    await db.flush()
    return schedule


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    schedule = await _get_owned_schedule(db, schedule_id, current_user.id)
    name = schedule.name
    await db.delete(schedule)
    await db.flush()
    await audit(db, current_user.id, "schedule.delete", "schedule", str(schedule_id),
                detail={"name": name})


@router.post("/{schedule_id}/toggle", response_model=ScheduleResponse)
async def toggle_schedule(
    schedule_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    schedule = await _get_owned_schedule(db, schedule_id, current_user.id)
    schedule.is_active = not schedule.is_active
    if schedule.is_active:
        schedule.next_run_at = scheduler_service.compute_next_run_at(schedule.cron)
    await db.flush()
    return schedule


@router.post("/{schedule_id}/run-now", response_model=ScheduleResponse)
async def run_schedule_now(
    schedule_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    schedule = await _get_owned_schedule(db, schedule_id, current_user.id)
    await scheduler_service.execute_schedule(db, schedule)
    return schedule
