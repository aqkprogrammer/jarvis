from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any, Callable, Dict, List, Optional, Set

from agents.base.agent_types import AgentResult, AgentTask, TaskPriority, TaskType
from agents.base.base_agent import BaseAgent
from core.event_bus.event_bus import Event, EventBus, EventType

logger = logging.getLogger(__name__)


class _TaskEntry:
    def __init__(self, task: AgentTask) -> None:
        self.task = task
        # get_running_loop() is safe here because _TaskEntry is always
        # constructed inside an async context (Orchestrator.submit).
        self.future: asyncio.Future[AgentResult] = asyncio.get_running_loop().create_future()
        self.enqueued_at: float = time.monotonic()


class Orchestrator:
    """Central orchestrator: routes tasks to agents, manages concurrency, aggregates results."""

    MAX_CONCURRENT: int = 8

    def __init__(self, event_bus: Optional[EventBus] = None) -> None:
        self._agents: Dict[str, BaseAgent] = {}
        self._event_bus: EventBus = event_bus or EventBus()
        self._task_queue: asyncio.PriorityQueue[tuple[int, _TaskEntry]] = asyncio.PriorityQueue()
        self._active_tasks: Dict[str, asyncio.Task[Any]] = {}
        self._results: Dict[str, AgentResult] = {}
        self._ws_callbacks: List[Callable[[Dict[str, Any]], Any]] = []
        self._semaphore = asyncio.Semaphore(self.MAX_CONCURRENT)
        self._running = False
        self._worker_task: Optional[asyncio.Task[Any]] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._worker_task = asyncio.create_task(self._process_queue(), name="orchestrator-worker")
        logger.info("Orchestrator started.")

    async def stop(self) -> None:
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        await self._event_bus.emit(EventType.SYSTEM_SHUTDOWN, source="orchestrator")
        logger.info("Orchestrator stopped.")

    # ------------------------------------------------------------------
    # Agent registry
    # ------------------------------------------------------------------

    def register_agent(self, agent: BaseAgent) -> None:
        self._agents[agent.name] = agent
        asyncio.create_task(
            self._event_bus.emit(
                EventType.AGENT_REGISTERED,
                source="orchestrator",
                payload={"agent": agent.name, "capabilities": agent.capabilities},
            )
        )
        logger.info("Agent registered: %s", agent.name)

    def unregister_agent(self, name: str) -> None:
        if name in self._agents:
            del self._agents[name]
            asyncio.create_task(
                self._event_bus.emit(
                    EventType.AGENT_UNREGISTERED,
                    source="orchestrator",
                    payload={"agent": name},
                )
            )
            logger.info("Agent unregistered: %s", name)

    def get_agent(self, name: str) -> Optional[BaseAgent]:
        return self._agents.get(name)

    def list_agents(self) -> List[str]:
        return list(self._agents.keys())

    # ------------------------------------------------------------------
    # Task submission
    # ------------------------------------------------------------------

    async def submit(self, task: AgentTask) -> AgentResult:
        """Submit a task and await its result."""
        entry = _TaskEntry(task)
        priority = -task.priority.value  # negate so higher priority pops first
        await self._task_queue.put((priority, entry))
        await self._event_bus.emit(
            EventType.TASK_CREATED,
            source="orchestrator",
            payload={"task_id": task.id, "type": task.type, "goal": task.goal[:120]},
            correlation_id=task.id,
        )
        return await entry.future

    async def submit_many(
        self, tasks: List[AgentTask], parallel: bool = True
    ) -> List[AgentResult]:
        """Submit multiple tasks, optionally in parallel."""
        if parallel:
            return list(await asyncio.gather(*[self.submit(t) for t in tasks]))
        results = []
        for t in tasks:
            results.append(await self.submit(t))
        return results

    # ------------------------------------------------------------------
    # Routing
    # ------------------------------------------------------------------

    def route(self, task: AgentTask) -> Optional[BaseAgent]:
        """Determine the best agent for a task.  Explicit type match first, then capability match."""
        type_map: Dict[TaskType, str] = {
            TaskType.PLAN: "planner",
            TaskType.RESEARCH: "research",
            TaskType.CODE: "coding",
            TaskType.BROWSE: "browser",
            TaskType.VISION: "vision",
            TaskType.AUTOMATE: "automation",
            TaskType.MEMORY: "memory",
        }
        preferred = type_map.get(task.type)
        if preferred and preferred in self._agents:
            return self._agents[preferred]

        # Capability fallback
        goal_lower = task.goal.lower()
        for agent in self._agents.values():
            for cap in agent.capabilities:
                if cap.lower() in goal_lower:
                    return agent

        # Last resort: any available agent
        if self._agents:
            return next(iter(self._agents.values()))
        return None

    # ------------------------------------------------------------------
    # Worker
    # ------------------------------------------------------------------

    async def _process_queue(self) -> None:
        while self._running:
            try:
                priority, entry = await asyncio.wait_for(self._task_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            # Wait for dependencies
            task = entry.task
            if task.depends_on:
                await self._wait_for_dependencies(task.depends_on)

            agent = self.route(task)
            if agent is None:
                entry.future.set_exception(RuntimeError(f"No agent available for task {task.id}"))
                self._task_queue.task_done()
                continue

            async def _run(e: _TaskEntry = entry, a: BaseAgent = agent) -> None:
                async with self._semaphore:
                    try:
                        result = await a.execute_with_retry(e.task)
                        self._results[e.task.id] = result
                        if not e.future.done():
                            e.future.set_result(result)
                        await self._notify_ws(
                            {"event": "task_complete", "task_id": e.task.id, "success": result.success}
                        )
                    except Exception as exc:
                        logger.exception("Unhandled error executing task %s", e.task.id)
                        if not e.future.done():
                            e.future.set_exception(exc)
                    finally:
                        self._active_tasks.pop(e.task.id, None)
                        self._task_queue.task_done()

            t = asyncio.create_task(_run(), name=f"task-{task.id[:8]}")
            self._active_tasks[task.id] = t

    async def _wait_for_dependencies(self, dep_ids: List[str]) -> None:
        while True:
            missing = [d for d in dep_ids if d not in self._results]
            if not missing:
                return
            await asyncio.sleep(0.2)

    # ------------------------------------------------------------------
    # WebSocket notifications
    # ------------------------------------------------------------------

    def add_ws_callback(self, cb: Callable[[Dict[str, Any]], Any]) -> None:
        self._ws_callbacks.append(cb)

    async def _notify_ws(self, payload: Dict[str, Any]) -> None:
        for cb in self._ws_callbacks:
            try:
                result = cb(payload)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as exc:
                logger.warning("WS callback error: %s", exc)

    # ------------------------------------------------------------------
    # Result access
    # ------------------------------------------------------------------

    def get_result(self, task_id: str) -> Optional[AgentResult]:
        return self._results.get(task_id)

    async def aggregate_results(self, task_ids: List[str]) -> Dict[str, AgentResult]:
        return {tid: self._results[tid] for tid in task_ids if tid in self._results}

    @property
    def event_bus(self) -> EventBus:
        return self._event_bus
