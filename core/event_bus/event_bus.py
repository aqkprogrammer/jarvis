from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict, deque
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Coroutine, Deque, Dict, List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class EventType(str, Enum):
    # Task lifecycle
    TASK_CREATED = "task.created"
    TASK_STARTED = "task.started"
    TASK_COMPLETED = "task.completed"
    TASK_FAILED = "task.failed"
    TASK_CANCELLED = "task.cancelled"
    TASK_PROGRESS = "task.progress"

    # Agent lifecycle
    AGENT_REGISTERED = "agent.registered"
    AGENT_UNREGISTERED = "agent.unregistered"
    AGENT_BUSY = "agent.busy"
    AGENT_IDLE = "agent.idle"
    AGENT_ERROR = "agent.error"

    # Memory
    MEMORY_STORED = "memory.stored"
    MEMORY_RETRIEVED = "memory.retrieved"
    MEMORY_DECAYED = "memory.decayed"

    # System
    SYSTEM_SHUTDOWN = "system.shutdown"
    SYSTEM_ERROR = "system.error"

    # User interaction
    USER_MESSAGE = "user.message"
    AGENT_RESPONSE = "agent.response"
    STREAM_CHUNK = "stream.chunk"
    STREAM_END = "stream.end"


class Event(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: EventType
    source: str  # agent/component name
    payload: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    correlation_id: Optional[str] = None  # groups related events


HandlerFn = Callable[[Event], Coroutine[Any, Any, None]]


class EventBus:
    """Async pub/sub event bus for inter-agent communication."""

    MAX_HISTORY = 1000
    DEAD_LETTER_MAX = 200

    def __init__(self) -> None:
        self._handlers: Dict[EventType, List[HandlerFn]] = defaultdict(list)
        self._wildcard_handlers: List[HandlerFn] = []
        self._history: Deque[Event] = deque(maxlen=self.MAX_HISTORY)
        self._dead_letters: Deque[Dict[str, Any]] = deque(maxlen=self.DEAD_LETTER_MAX)
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Subscription
    # ------------------------------------------------------------------

    def subscribe(
        self,
        event_type: Optional[EventType],
        handler: HandlerFn,
    ) -> None:
        """Subscribe to a specific event type.  Pass None to subscribe to all events."""
        if event_type is None:
            self._wildcard_handlers.append(handler)
        else:
            self._handlers[event_type].append(handler)
        logger.debug("Subscribed handler %s to %s", handler.__name__, event_type)

    def unsubscribe(
        self,
        event_type: Optional[EventType],
        handler: HandlerFn,
    ) -> None:
        if event_type is None:
            try:
                self._wildcard_handlers.remove(handler)
            except ValueError:
                pass
        else:
            try:
                self._handlers[event_type].remove(handler)
            except ValueError:
                pass

    # ------------------------------------------------------------------
    # Publishing
    # ------------------------------------------------------------------

    async def publish(self, event: Event) -> None:
        """Publish an event to all registered handlers."""
        async with self._lock:
            self._history.append(event)

        handlers = list(self._handlers.get(event.type, [])) + list(self._wildcard_handlers)
        if not handlers:
            logger.debug("No handlers for event %s", event.type)
            return

        results = await asyncio.gather(
            *[self._safe_call(h, event) for h in handlers],
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, Exception):
                logger.error("Handler raised exception for event %s: %s", event.type, r)

    async def _safe_call(self, handler: HandlerFn, event: Event) -> None:
        try:
            await handler(event)
        except Exception as exc:
            self._dead_letters.append(
                {
                    "event": event.model_dump(),
                    "handler": getattr(handler, "__name__", str(handler)),
                    "error": str(exc),
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )
            raise

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    async def emit(
        self,
        event_type: EventType,
        source: str,
        payload: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None,
    ) -> Event:
        event = Event(
            type=event_type,
            source=source,
            payload=payload or {},
            correlation_id=correlation_id,
        )
        await self.publish(event)
        return event

    # ------------------------------------------------------------------
    # History / diagnostics
    # ------------------------------------------------------------------

    def get_history(
        self,
        event_type: Optional[EventType] = None,
        limit: int = 100,
    ) -> List[Event]:
        events = list(self._history)
        if event_type:
            events = [e for e in events if e.type == event_type]
        return events[-limit:]

    def get_dead_letters(self) -> List[Dict[str, Any]]:
        return list(self._dead_letters)

    def clear_dead_letters(self) -> None:
        self._dead_letters.clear()
