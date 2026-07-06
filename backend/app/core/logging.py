from __future__ import annotations

import logging
import sys
import uuid
from contextvars import ContextVar
from typing import Any

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.config import settings

# ── Context variables ─────────────────────────────────────────────────────────

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")
correlation_id_ctx: ContextVar[str] = ContextVar("correlation_id", default="")


def get_request_id() -> str:
    return request_id_ctx.get()


def get_correlation_id() -> str:
    return correlation_id_ctx.get()


# ── Structlog configuration ───────────────────────────────────────────────────

def _add_request_context(logger: Any, method: str, event_dict: dict) -> dict:
    rid = request_id_ctx.get()
    cid = correlation_id_ctx.get()
    if rid:
        event_dict["request_id"] = rid
    if cid:
        event_dict["correlation_id"] = cid
    return event_dict


def setup_logging() -> None:
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        _add_request_context,
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.LOG_JSON or settings.is_production:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))

    # Silence noisy libraries
    for noisy in ("uvicorn.access", "sqlalchemy.engine", "httpx"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str = __name__) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)


# ── Middleware ────────────────────────────────────────────────────────────────

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Attach request/correlation IDs and log every HTTP request."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        correlation_id = request.headers.get("X-Correlation-ID", request_id)

        rid_token = request_id_ctx.set(request_id)
        cid_token = correlation_id_ctx.set(correlation_id)

        logger = get_logger("http")
        try:
            response: Response = await call_next(request)
            logger.info(
                "http_request",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                client=request.client.host if request.client else None,
            )
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Correlation-ID"] = correlation_id
            return response
        except Exception as exc:
            logger.error("http_error", method=request.method, path=request.url.path, error=str(exc))
            raise
        finally:
            request_id_ctx.reset(rid_token)
            correlation_id_ctx.reset(cid_token)
