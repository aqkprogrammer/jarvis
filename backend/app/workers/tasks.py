from app.services.celery_app import celery_app
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)

@celery_app.task(bind=True, name="app.workers.tasks.execute_agent_task", max_retries=3)
def execute_agent_task(self, task_id: str):
    """Execute an agent task asynchronously."""
    import asyncio
    from app.core.database import AsyncSessionLocal
    from app.models.task import Task

    async def _run():
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select
            result = await db.execute(select(Task).where(Task.id == task_id))
            task = result.scalar_one_or_none()
            if not task:
                logger.error(f"Task {task_id} not found")
                return
            try:
                task.status = "running"
                await db.commit()
                # Route to appropriate agent based on task.agent_type
                from core.orchestrator.orchestrator import Orchestrator
                from agents.base.agent_types import AgentTask
                import uuid
                agent_task = AgentTask(
                    id=str(uuid.uuid4()),
                    type=task.agent_type or "general",
                    goal=task.title,
                    context=task.input_data or {},
                )
                orchestrator = Orchestrator()
                result = await orchestrator.execute(agent_task)
                task.status = "completed"
                task.output_data = result.output if result else {}
                from datetime import datetime, timezone
                task.completed_at = datetime.now(timezone.utc)
                await db.commit()
            except Exception as exc:
                task.status = "failed"
                task.output_data = {"error": str(exc)}
                await db.commit()
                raise self.retry(exc=exc, countdown=60)

    asyncio.run(_run())
