"""
Celery application configuration for JARVIS.
Includes task routing, beat schedule, and periodic task definitions.
"""

from __future__ import annotations

import logging
import os
from datetime import timedelta

from celery import Celery
from celery.schedules import crontab
from celery.signals import task_failure, task_postrun, task_prerun, worker_ready

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App creation
# ---------------------------------------------------------------------------

from app.core.config import settings

REDIS_URL = settings.REDIS_URL
CELERY_BROKER_URL = settings.CELERY_BROKER_URL
CELERY_RESULT_BACKEND = settings.CELERY_RESULT_BACKEND

celery_app = Celery(
    "jarvis",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=[
        "app.workers.tasks",
    ],
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Timezone
    timezone="UTC",
    enable_utc=True,
    # Result expiry
    result_expires=timedelta(days=1),
    # Task timeouts
    task_soft_time_limit=300,   # 5 minutes
    task_time_limit=600,        # 10 minutes hard limit
    # Retries
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Rate limits (per worker)
    task_default_rate_limit="100/m",
    # Concurrency
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=50,
    # Visibility timeout must exceed longest task
    broker_transport_options={"visibility_timeout": 43200},  # 12 hours
    # Routing
    task_routes={
        "app.services.celery_app.consolidate_memories": {"queue": "memory"},
        "app.services.celery_app.cleanup_stale_memories": {"queue": "memory"},
        "app.services.celery_app.refresh_embedding_index": {"queue": "memory"},
        "app.services.celery_app.system_health_check": {"queue": "health"},
        "app.workers.tasks.*": {"queue": "agents"},
    },
    task_default_queue="default",
    task_queues={
        "default": {},
        "memory": {},
        "health": {},
        "agents": {},
        "priority": {"exchange": "priority", "routing_key": "priority"},
    },
    # Beat schedule
    beat_schedule={
        # ------------------------------------------------------------------
        # Daily memory consolidation at 03:00 UTC
        # ------------------------------------------------------------------
        "daily-memory-consolidation": {
            "task": "app.services.celery_app.consolidate_memories",
            "schedule": crontab(hour=3, minute=0),
            "options": {"queue": "memory"},
            "kwargs": {"dry_run": False},
        },
        # ------------------------------------------------------------------
        # Weekly memory cleanup every Sunday at 04:00 UTC
        # ------------------------------------------------------------------
        "weekly-memory-cleanup": {
            "task": "app.services.celery_app.cleanup_stale_memories",
            "schedule": crontab(hour=4, minute=0, day_of_week="sunday"),
            "options": {"queue": "memory"},
            "kwargs": {"days_threshold": 90, "min_importance": 0.1},
        },
        # ------------------------------------------------------------------
        # Hourly health check
        # ------------------------------------------------------------------
        "hourly-health-check": {
            "task": "app.services.celery_app.system_health_check",
            "schedule": crontab(minute=0),
            "options": {"queue": "health"},
        },
        # ------------------------------------------------------------------
        # Periodic embedding index refresh every 6 hours
        # ------------------------------------------------------------------
        "embedding-index-refresh": {
            "task": "app.services.celery_app.refresh_embedding_index",
            "schedule": crontab(minute=30, hour="*/6"),
            "options": {"queue": "memory"},
        },
    },
)


# ---------------------------------------------------------------------------
# Inline task definitions (memory_tasks module)
# ---------------------------------------------------------------------------

@celery_app.task(
    name="app.services.celery_app.consolidate_memories",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
    queue="memory",
    soft_time_limit=3600,
)
def consolidate_memories(self, dry_run: bool = False):
    """
    Consolidate memories: merge duplicates, update importance scores,
    and refresh vector embeddings for stale entries.
    """
    import asyncio
    from app.core.database import AsyncSessionLocal
    from app.services.memory_service import MemoryService

    logger.info("Starting daily memory consolidation (dry_run=%s)", dry_run)
    try:
        async def _run():
            async with AsyncSessionLocal() as session:
                svc = MemoryService(session)
                stats = await svc.consolidate_all(dry_run=dry_run)
            return stats

        stats = asyncio.get_event_loop().run_until_complete(_run())
        logger.info("Memory consolidation complete: %s", stats)
        return stats
    except Exception as exc:
        logger.error("Memory consolidation failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.services.celery_app.cleanup_stale_memories",
    bind=True,
    max_retries=2,
    default_retry_delay=600,
    queue="memory",
)
def cleanup_stale_memories(self, days_threshold: int = 90, min_importance: float = 0.1):
    """
    Remove or archive memories that haven't been accessed in *days_threshold* days
    and have importance below *min_importance*.
    """
    import asyncio
    from app.core.database import AsyncSessionLocal
    from app.services.memory_service import MemoryService

    logger.info(
        "Starting weekly memory cleanup (threshold=%d days, min_importance=%.2f)",
        days_threshold,
        min_importance,
    )
    try:
        async def _run():
            async with AsyncSessionLocal() as session:
                svc = MemoryService(session)
                deleted = await svc.cleanup_stale(
                    days_threshold=days_threshold,
                    min_importance=min_importance,
                )
            return deleted

        deleted = asyncio.get_event_loop().run_until_complete(_run())
        logger.info("Cleaned up %d stale memories", deleted)
        return {"deleted": deleted}
    except Exception as exc:
        logger.error("Memory cleanup failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.services.celery_app.refresh_embedding_index",
    bind=True,
    max_retries=2,
    queue="memory",
    soft_time_limit=1800,
)
def refresh_embedding_index(self):
    """Re-generate embeddings for memories that are missing them or have stale vectors."""
    import asyncio
    from app.core.database import AsyncSessionLocal
    from app.services.memory_service import MemoryService

    logger.info("Refreshing embedding index")
    try:
        async def _run():
            async with AsyncSessionLocal() as session:
                svc = MemoryService(session)
                updated = await svc.refresh_embeddings()
            return updated

        updated = asyncio.get_event_loop().run_until_complete(_run())
        logger.info("Refreshed embeddings for %d memories", updated)
        return {"updated": updated}
    except Exception as exc:
        logger.error("Embedding refresh failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# Health check task
# ---------------------------------------------------------------------------

@celery_app.task(
    name="app.services.celery_app.system_health_check",
    queue="health",
    soft_time_limit=60,
)
def system_health_check():
    """
    Check connectivity to all critical services and log the results.
    Failures trigger alerts (via notification service).
    """
    import asyncio

    results: dict = {}

    # PostgreSQL
    try:
        from app.core.database import AsyncSessionLocal

        async def _pg():
            async with AsyncSessionLocal() as s:
                await s.execute("SELECT 1")

        asyncio.get_event_loop().run_until_complete(_pg())
        results["postgres"] = "ok"
    except Exception as exc:
        results["postgres"] = f"error: {exc}"
        logger.error("Health check: postgres failed: %s", exc)

    # Redis
    try:
        import redis  # type: ignore

        r = redis.from_url(REDIS_URL)
        r.ping()
        results["redis"] = "ok"
    except Exception as exc:
        results["redis"] = f"error: {exc}"
        logger.error("Health check: redis failed: %s", exc)

    # Qdrant
    try:
        import httpx  # type: ignore

        qdrant_url = settings.QDRANT_URL
        resp = httpx.get(f"{qdrant_url}/healthz", timeout=5)
        results["qdrant"] = "ok" if resp.status_code == 200 else f"http {resp.status_code}"
    except Exception as exc:
        results["qdrant"] = f"error: {exc}"
        logger.error("Health check: qdrant failed: %s", exc)

    all_ok = all(v == "ok" for v in results.values())
    if not all_ok:
        logger.warning("Health check failures: %s", results)
    else:
        logger.info("Health check passed: %s", results)

    return {"status": "ok" if all_ok else "degraded", "services": results}


# ---------------------------------------------------------------------------
# Signals for observability
# ---------------------------------------------------------------------------

@worker_ready.connect
def on_worker_ready(sender, **kwargs):
    logger.info("Celery worker ready: %s", sender)


@task_prerun.connect
def on_task_prerun(task_id, task, args, kwargs, **extras):
    logger.debug("Task starting: %s[%s]", task.name, task_id)


@task_postrun.connect
def on_task_postrun(task_id, task, retval, state, **extras):
    logger.debug("Task finished: %s[%s] state=%s", task.name, task_id, state)


@task_failure.connect
def on_task_failure(task_id, exception, traceback, sender, **extras):
    logger.error(
        "Task failed: %s[%s] exception=%s",
        sender.name,
        task_id,
        exception,
        exc_info=(type(exception), exception, traceback),
    )
