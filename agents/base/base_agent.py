from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, Dict, List, Optional, Type

from .agent_types import AgentAction, AgentResult, AgentTask, AgentThought, AgentTool

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """Abstract base class for all JARVIS agents."""

    MAX_RETRIES: int = 3
    RETRY_BACKOFF: float = 1.5  # exponential base

    def __init__(
        self,
        llm_provider: Any = None,
        memory_store: Any = None,
        event_bus: Any = None,
    ) -> None:
        self._llm = llm_provider
        self._memory = memory_store
        self._event_bus = event_bus
        self._tools: Dict[str, AgentTool] = {}
        self._thoughts: List[AgentThought] = []
        self._logger = logging.getLogger(f"jarvis.agent.{self.name}")

    # ------------------------------------------------------------------
    # Identity (subclasses must define)
    # ------------------------------------------------------------------

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def description(self) -> str: ...

    @property
    @abstractmethod
    def capabilities(self) -> List[str]: ...

    # ------------------------------------------------------------------
    # Core execution
    # ------------------------------------------------------------------

    @abstractmethod
    async def execute(self, task: AgentTask) -> AgentResult: ...

    async def execute_with_retry(self, task: AgentTask) -> AgentResult:
        """Execute a task with exponential-backoff retries."""
        start = time.monotonic()
        last_error: Optional[Exception] = None

        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                self._logger.info(
                    "Executing task %s (attempt %d/%d)", task.id, attempt, self.MAX_RETRIES
                )
                if self._event_bus:
                    await self._event_bus.emit(
                        "task.started",
                        source=self.name,
                        payload={"task_id": task.id, "attempt": attempt},
                        correlation_id=task.id,
                    )
                result = await asyncio.wait_for(self.execute(task), timeout=task.timeout)
                result.duration = time.monotonic() - start
                if self._event_bus:
                    await self._event_bus.emit(
                        "task.completed" if result.success else "task.failed",
                        source=self.name,
                        payload={"task_id": task.id, "success": result.success},
                        correlation_id=task.id,
                    )
                return result
            except asyncio.TimeoutError:
                last_error = asyncio.TimeoutError(f"Task {task.id} timed out after {task.timeout}s")
                self._logger.warning("Task %s timed out on attempt %d", task.id, attempt)
            except Exception as exc:
                last_error = exc
                self._logger.warning(
                    "Task %s failed on attempt %d: %s", task.id, attempt, exc
                )

            if attempt < self.MAX_RETRIES:
                delay = self.RETRY_BACKOFF ** attempt
                self._logger.info("Retrying in %.1fs…", delay)
                await asyncio.sleep(delay)

        duration = time.monotonic() - start
        return AgentResult(
            task_id=task.id,
            success=False,
            error=str(last_error),
            error_type=type(last_error).__name__,
            duration=duration,
        )

    # ------------------------------------------------------------------
    # ReAct loop helpers
    # ------------------------------------------------------------------

    async def think(self, context: Dict[str, Any]) -> AgentThought:
        """Reasoning step: produce a thought given current context."""
        prompt = self._build_think_prompt(context)
        reasoning = await self._llm_complete(prompt)
        thought = AgentThought(reasoning=reasoning)
        self._thoughts.append(thought)
        self._logger.debug("Thought: %s", reasoning[:200])
        return thought

    async def act(self, action: AgentAction) -> Any:
        """Execution step: run a tool action."""
        tool = self._tools.get(action.tool_name or action.type)
        if tool is None:
            raise ValueError(f"Unknown tool: {action.tool_name or action.type}")
        self._logger.info("Acting with tool '%s', params=%s", tool.name, action.parameters)
        return await tool.execute(**action.parameters)

    async def observe(self, result: Any) -> str:
        """Result-processing step: convert raw result to an observation string."""
        if isinstance(result, str):
            return result
        if isinstance(result, dict):
            return str(result)
        return repr(result)

    # ------------------------------------------------------------------
    # Streaming
    # ------------------------------------------------------------------

    async def stream_execute(self, task: AgentTask) -> AsyncIterator[str]:
        """Stream incremental output. Default: run execute and yield full output."""
        result = await self.execute_with_retry(task)
        if result.output:
            yield str(result.output)

    # ------------------------------------------------------------------
    # Tool registry
    # ------------------------------------------------------------------

    def register_tool(self, tool: AgentTool) -> None:
        self._tools[tool.name] = tool
        self._logger.debug("Registered tool: %s", tool.name)

    def unregister_tool(self, name: str) -> None:
        self._tools.pop(name, None)

    def get_tool(self, name: str) -> Optional[AgentTool]:
        return self._tools.get(name)

    def list_tools(self) -> List[str]:
        return list(self._tools.keys())

    # ------------------------------------------------------------------
    # Memory access helpers
    # ------------------------------------------------------------------

    async def remember(self, key: str, value: Any) -> None:
        if self._memory:
            await self._memory.store(key, value, source=self.name)

    async def recall(self, query: str, limit: int = 5) -> List[Any]:
        if self._memory:
            return await self._memory.search(query, limit=limit)
        return []

    # ------------------------------------------------------------------
    # LLM helpers
    # ------------------------------------------------------------------

    async def _llm_complete(self, prompt: str, **kwargs: Any) -> str:
        if self._llm is None:
            raise RuntimeError("No LLM provider configured for agent '%s'" % self.name)
        return await self._llm.complete(prompt, **kwargs)

    async def _llm_chat(
        self, messages: List[Dict[str, str]], **kwargs: Any
    ) -> str:
        if self._llm is None:
            raise RuntimeError("No LLM provider configured for agent '%s'" % self.name)
        return await self._llm.chat(messages, **kwargs)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_think_prompt(self, context: Dict[str, Any]) -> str:
        ctx_str = "\n".join(f"  {k}: {v}" for k, v in context.items())
        tools_str = ", ".join(self.list_tools()) or "none"
        return (
            f"You are {self.name}: {self.description}\n"
            f"Available tools: {tools_str}\n\n"
            f"Current context:\n{ctx_str}\n\n"
            "Think step by step about what to do next. "
            "Be concise and reason towards a clear action."
        )

    def get_thoughts(self) -> List[AgentThought]:
        return list(self._thoughts)

    def clear_thoughts(self) -> None:
        self._thoughts.clear()

    def __repr__(self) -> str:
        return f"<{type(self).__name__} name={self.name!r}>"
