from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Coroutine, Dict, List, Optional

from pydantic import BaseModel, Field


class TaskType(str, Enum):
    PLAN = "plan"
    RESEARCH = "research"
    CODE = "code"
    BROWSE = "browse"
    VISION = "vision"
    AUTOMATE = "automate"
    MEMORY = "memory"
    GENERIC = "generic"


class TaskPriority(int, Enum):
    LOW = 1
    NORMAL = 2
    HIGH = 3
    CRITICAL = 4


class AgentTask(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: TaskType = TaskType.GENERIC
    goal: str
    context: Dict[str, Any] = Field(default_factory=dict)
    constraints: List[str] = Field(default_factory=list)
    priority: TaskPriority = TaskPriority.NORMAL
    timeout: int = 300  # seconds
    parent_task_id: Optional[str] = None
    depends_on: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AgentResult(BaseModel):
    task_id: str
    success: bool
    output: Any = None
    artifacts: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    error_type: Optional[str] = None
    duration: float = 0.0  # seconds
    tokens_used: int = 0
    thoughts: List["AgentThought"] = Field(default_factory=list)
    completed_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AgentThought(BaseModel):
    reasoning: str
    plan: Optional[str] = None
    action: Optional["AgentAction"] = None
    observation: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AgentAction(BaseModel):
    type: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    expected_result: Optional[str] = None
    tool_name: Optional[str] = None


class AgentTool(BaseModel):
    name: str
    description: str
    parameters_schema: Dict[str, Any] = Field(default_factory=dict)
    is_async: bool = True

    # Not serialized — set after construction
    _execute_fn: Optional[Callable[..., Coroutine[Any, Any, Any]]] = None

    model_config = {"arbitrary_types_allowed": True}

    def set_execute(self, fn: Callable[..., Coroutine[Any, Any, Any]]) -> None:
        self._execute_fn = fn

    async def execute(self, **kwargs: Any) -> Any:
        if self._execute_fn is None:
            raise NotImplementedError(f"Tool '{self.name}' has no execute function set.")
        return await self._execute_fn(**kwargs)


AgentThought.model_rebuild()
AgentResult.model_rebuild()
