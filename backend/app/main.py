from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.config import settings
from app.core.database import create_tables
from app.core.logging import RequestLoggingMiddleware, get_logger, setup_logging
from app.core.redis_client import check_redis_health, close_redis, get_redis
from app.core.database import check_database_health

setup_logging()
logger = get_logger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("jarvis_starting", version=settings.APP_VERSION, env=settings.ENVIRONMENT)

    # Create DB tables in dev/test (production uses Alembic)
    if not settings.is_production:
        try:
            await create_tables()
            logger.info("database_tables_created")
        except Exception as exc:
            logger.error("database_init_failed", error=str(exc))

    # Warm up Redis pool
    try:
        r = get_redis()
        await r.ping()
        logger.info("redis_connected")
    except Exception as exc:
        logger.warning("redis_unavailable", error=str(exc))

    # Warm up Qdrant collection (best-effort)
    if settings.FEATURE_MEMORY_ENABLED:
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.http.models import Distance, VectorParams
            client = QdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY)
            existing = [c.name for c in client.get_collections().collections]
            for col in [settings.QDRANT_COLLECTION_MEMORIES, settings.QDRANT_COLLECTION_DOCS]:
                if col not in existing:
                    client.create_collection(
                        collection_name=col,
                        vectors_config=VectorParams(size=settings.VECTOR_DIMENSION, distance=Distance.COSINE),
                    )
            logger.info("qdrant_collections_ready")
        except Exception as exc:
            logger.warning("qdrant_unavailable", error=str(exc))

    # Start the scheduled-agents background loop (best-effort)
    try:
        from app.services.scheduler_service import start_scheduler
        await start_scheduler()
        logger.info("scheduler_started")
    except Exception as exc:
        logger.warning("scheduler_start_failed", error=str(exc))

    logger.info("jarvis_ready")
    yield

    # Shutdown
    logger.info("jarvis_shutting_down")
    try:
        from app.services.scheduler_service import stop_scheduler
        await stop_scheduler()
        logger.info("scheduler_stopped")
    except Exception as exc:
        logger.warning("scheduler_stop_failed", error=str(exc))
    await close_redis()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="JARVIS – Just A Rather Very Intelligent System",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)


# ── Middleware ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)

if settings.is_production:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS)

app.add_middleware(RequestLoggingMiddleware)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip rate limiting for health checks
        if request.url.path in ("/health", "/metrics"):
            return await call_next(request)

        identifier = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")
        try:
            from app.core.redis_client import RateLimiter
            r = get_redis()
            limiter = RateLimiter(r)
            allowed, remaining = await limiter.is_allowed(identifier)
            if not allowed:
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "Rate limit exceeded"},
                    headers={"X-RateLimit-Remaining": "0", "Retry-After": "60"},
                )
            response = await call_next(request)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            return response
        except Exception:
            # Redis unavailable — allow through
            return await call_next(request)


app.add_middleware(RateLimitMiddleware)


# ── Exception handlers ────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("unhandled_exception", path=request.url.path, error=str(exc), exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": str(exc)},
    )


# ── Routers ───────────────────────────────────────────────────────────────────

from app.api.v1 import api_router
from app.api.v1.websockets.chat import router as ws_router
from app.api.v1.websockets.presence import router as presence_ws_router

app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(ws_router)
app.include_router(presence_ws_router)


# ── Health / Metrics ──────────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
async def health_check() -> dict:
    db_health = await check_database_health()
    redis_health = await check_redis_health()
    overall = "healthy" if all(
        h["status"] == "healthy" for h in [db_health, redis_health]
    ) else "degraded"
    return {
        "status": overall,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "checks": {"database": db_health, "redis": redis_health},
    }


@app.get("/", tags=["system"])
async def root() -> dict:
    return {"name": settings.APP_NAME, "version": settings.APP_VERSION, "status": "running"}


if settings.PROMETHEUS_ENABLED:
    try:
        from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
        from prometheus_fastapi_instrumentator import Instrumentator

        Instrumentator().instrument(app).expose(app, endpoint="/metrics")
        logger.info("prometheus_metrics_enabled")
    except ImportError:
        # prometheus_fastapi_instrumentator not installed – serve raw metrics only
        from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

        @app.get("/metrics", tags=["system"], include_in_schema=False)
        async def metrics():
            return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
