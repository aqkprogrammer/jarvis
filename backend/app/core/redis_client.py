from __future__ import annotations

import asyncio
import functools
import hashlib
import json
from typing import Any, Callable, Optional

import redis.asyncio as aioredis
from redis.asyncio import ConnectionPool

from app.core.config import settings

# ── Pool & client ──────────────────────────────────────────────────────────────

_pool: Optional[ConnectionPool] = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool.from_url(
            settings.REDIS_URL,
            max_connections=settings.REDIS_POOL_MAX_CONNECTIONS,
            decode_responses=True,
        )
    return _pool


def get_redis() -> aioredis.Redis:
    return aioredis.Redis(connection_pool=get_pool())


async def close_redis() -> None:
    global _pool
    if _pool is not None:
        await _pool.disconnect()
        _pool = None


async def check_redis_health() -> dict:
    try:
        r = get_redis()
        await r.ping()
        return {"status": "healthy", "redis": "connected"}
    except Exception as exc:
        return {"status": "unhealthy", "redis": str(exc)}


# ── Cache decorator ───────────────────────────────────────────────────────────

def cache(ttl: int = settings.CACHE_DEFAULT_TTL, prefix: str = "cache"):
    """Async cache decorator that serialises return value to JSON."""
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            key_data = f"{prefix}:{func.__module__}.{func.__qualname__}:{args}:{kwargs}"
            cache_key = hashlib.sha256(key_data.encode()).hexdigest()
            r = get_redis()

            cached = await r.get(cache_key)
            if cached is not None:
                return json.loads(cached)

            result = await func(*args, **kwargs)
            await r.setex(cache_key, ttl, json.dumps(result, default=str))
            return result
        return wrapper
    return decorator


# ── Session store ─────────────────────────────────────────────────────────────

class SessionStore:
    PREFIX = "session"

    def __init__(self, redis: aioredis.Redis):
        self._r = redis

    async def set(self, session_id: str, data: dict, ttl: int = 86400) -> None:
        key = f"{self.PREFIX}:{session_id}"
        await self._r.setex(key, ttl, json.dumps(data, default=str))

    async def get(self, session_id: str) -> Optional[dict]:
        key = f"{self.PREFIX}:{session_id}"
        raw = await self._r.get(key)
        return json.loads(raw) if raw else None

    async def delete(self, session_id: str) -> None:
        await self._r.delete(f"{self.PREFIX}:{session_id}")

    async def refresh(self, session_id: str, ttl: int = 86400) -> None:
        await self._r.expire(f"{self.PREFIX}:{session_id}", ttl)


# ── Rate limiter ──────────────────────────────────────────────────────────────

class RateLimiter:
    """Sliding-window rate limiter backed by Redis."""

    def __init__(
        self,
        redis: aioredis.Redis,
        limit: int = settings.RATE_LIMIT_PER_MINUTE,
        window_seconds: int = 60,
    ):
        self._r = redis
        self.limit = limit
        self.window = window_seconds

    async def is_allowed(self, identifier: str) -> tuple[bool, int]:
        """Returns (allowed, remaining)."""
        key = f"rl:{identifier}"
        pipe = self._r.pipeline()
        import time
        now = int(time.time())
        window_start = now - self.window

        await pipe.zremrangebyscore(key, "-inf", window_start)
        await pipe.zadd(key, {str(now) + str(asyncio.get_event_loop().time()): now})
        await pipe.zcard(key)
        await pipe.expire(key, self.window)
        results = await pipe.execute()

        count: int = results[2]
        remaining = max(0, self.limit - count)
        return count <= self.limit, remaining
