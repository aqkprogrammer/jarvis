from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Optional

from croniter import croniter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.models.schedule import Schedule
from app.models.workflow import Workflow
from app.services import workflow_service
from app.services.ai_provider import AIProviderFactory, CompletionResult

logger = get_logger(__name__)

POLL_INTERVAL_SECONDS = 30
_SCHEDULED_AGENT_SYSTEM = (
    "You are the scheduled agent in JARVIS. "
    "Execute the user's scheduled prompt and return the result."
)

_task: Optional[asyncio.Task] = None
_stop_event: Optional[asyncio.Event] = None


# ── Cron helpers ──────────────────────────────────────────────────────────────

def compute_next_run_at(cron: str, base: Optional[datetime] = None) -> datetime:
    """Next fire time (UTC) for a 5-field cron expression."""
    base = base or datetime.now(timezone.utc)
    return croniter(cron, base).get_next(datetime)


# ── Schedule execution ────────────────────────────────────────────────────────

async def execute_schedule(db: AsyncSession, schedule: Schedule) -> str:
    """Run one schedule immediately and update its bookkeeping fields.

    Returns the resulting last_status string ("success" or "failed: ...").
    Never raises: failures are captured into last_status.
    """
    now = datetime.now(timezone.utc)
    try:
        if schedule.target_type == "workflow":
            if not schedule.workflow_id:
                raise ValueError("Schedule has no workflow_id")
            result = await db.execute(
                select(Workflow).where(Workflow.id == schedule.workflow_id)
            )
            workflow = result.scalar_one_or_none()
            if not workflow:
                raise ValueError(f"Workflow {schedule.workflow_id} not found")
            run = await workflow_service.execute_workflow(
                db, workflow, input_text=schedule.prompt or ""
            )
            if run.status == "completed":
                status = "success"
            else:
                status = f"failed: {run.error or 'workflow run failed'}"
        elif schedule.target_type == "prompt":
            provider = AIProviderFactory.get()
            result_completion: CompletionResult = await provider.complete(
                messages=[{"role": "user", "content": schedule.prompt or "(no prompt)"}],
                system=_SCHEDULED_AGENT_SYSTEM,
            )
            logger.info(
                "schedule_prompt_completed",
                schedule_id=str(schedule.id),
                output_chars=len(result_completion.content),
            )
            status = "success"
        else:
            raise ValueError(f"Unknown target_type: {schedule.target_type}")
    except Exception as exc:
        status = f"failed: {exc}"
        logger.warning("schedule_run_failed", schedule_id=str(schedule.id), error=str(exc))

    schedule.last_run_at = now
    schedule.last_status = status[:255]
    try:
        schedule.next_run_at = compute_next_run_at(schedule.cron)
    except Exception as exc:
        logger.warning("schedule_cron_invalid", schedule_id=str(schedule.id), error=str(exc))
        schedule.next_run_at = None
    await db.flush()
    return schedule.last_status


# ── Background loop ───────────────────────────────────────────────────────────

async def _run_due_schedules() -> None:
    """Find due schedules and run each in its own session."""
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Schedule.id).where(
                Schedule.is_active == True,  # noqa: E712
                Schedule.next_run_at != None,  # noqa: E711
                Schedule.next_run_at <= now,
            )
        )
        due_ids = [row[0] for row in result.all()]

    for schedule_id in due_ids:
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(Schedule).where(Schedule.id == schedule_id)
                )
                schedule = result.scalar_one_or_none()
                if not schedule or not schedule.is_active:
                    continue
                await execute_schedule(session, schedule)
                await session.commit()
        except Exception as exc:
            logger.error(
                "scheduler_schedule_failed", schedule_id=str(schedule_id), error=str(exc)
            )


async def _scheduler_loop() -> None:
    logger.info("scheduler_loop_started", poll_interval=POLL_INTERVAL_SECONDS)
    assert _stop_event is not None
    while not _stop_event.is_set():
        try:
            await _run_due_schedules()
        except Exception as exc:
            # Never let an exception kill the loop
            logger.error("scheduler_tick_failed", error=str(exc))
        try:
            await asyncio.wait_for(_stop_event.wait(), timeout=POLL_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            pass
    logger.info("scheduler_loop_stopped")


async def start_scheduler() -> None:
    """Start the background scheduler loop (idempotent)."""
    global _task, _stop_event
    if _task and not _task.done():
        return
    _stop_event = asyncio.Event()
    _task = asyncio.create_task(_scheduler_loop())


async def stop_scheduler() -> None:
    """Signal the loop to stop and wait for it to finish."""
    global _task, _stop_event
    if _stop_event:
        _stop_event.set()
    if _task:
        try:
            await asyncio.wait_for(_task, timeout=10)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            _task.cancel()
    _task = None
    _stop_event = None
