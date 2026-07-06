from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from agents.base.agent_types import (
    AgentAction,
    AgentResult,
    AgentTask,
    AgentThought,
    TaskPriority,
    TaskType,
)
from agents.base.base_agent import BaseAgent

logger = logging.getLogger(__name__)

_PLAN_SYSTEM_PROMPT = """You are an expert task planner. Given a high-level goal, decompose it into
a structured plan of subtasks that can be executed by specialized agents.

Return ONLY a JSON object with this schema:
{
  "summary": "one-line plan summary",
  "steps": [
    {
      "id": "step_1",
      "title": "short step title",
      "goal": "detailed goal for this step",
      "agent_type": "planner|research|coding|browser|vision|automation|memory|generic",
      "depends_on": [],
      "priority": 1-4,
      "estimated_tokens": 500,
      "constraints": []
    }
  ],
  "critical_path": ["step_1", "step_3"],
  "estimated_total_tokens": 2000,
  "risks": ["potential risk 1"]
}"""


class PlannerAgent(BaseAgent):
    """Planning agent: breaks complex goals into a DAG of subtasks."""

    @property
    def name(self) -> str:
        return "planner"

    @property
    def description(self) -> str:
        return "Decomposes complex goals into ordered, executable subtask plans."

    @property
    def capabilities(self) -> List[str]:
        return ["plan", "decompose", "schedule", "dependencies", "prioritize"]

    # ------------------------------------------------------------------
    # Main execution
    # ------------------------------------------------------------------

    async def execute(self, task: AgentTask) -> AgentResult:
        try:
            plan = await self._build_plan(task)
            subtasks = self._plan_to_tasks(plan, parent_id=task.id)
            return AgentResult(
                task_id=task.id,
                success=True,
                output=plan,
                artifacts={
                    "subtasks": [t.model_dump() for t in subtasks],
                    "step_count": len(subtasks),
                    "critical_path": plan.get("critical_path", []),
                },
                thoughts=self.get_thoughts(),
            )
        except Exception as exc:
            logger.exception("PlannerAgent failed for task %s", task.id)
            return AgentResult(task_id=task.id, success=False, error=str(exc))

    # ------------------------------------------------------------------
    # Planning logic
    # ------------------------------------------------------------------

    async def _build_plan(self, task: AgentTask) -> Dict[str, Any]:
        context_str = json.dumps(task.context, indent=2) if task.context else "{}"
        constraints_str = "\n".join(f"- {c}" for c in task.constraints) or "none"

        messages = [
            {"role": "system", "content": _PLAN_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Goal: {task.goal}\n\n"
                    f"Context:\n{context_str}\n\n"
                    f"Constraints:\n{constraints_str}"
                ),
            },
        ]

        thought = AgentThought(
            reasoning=f"Planning task: {task.goal[:100]}",
            plan="Will call LLM to decompose into subtasks.",
        )
        self._thoughts.append(thought)

        raw = await self._llm_chat(messages)
        plan = self._parse_json_response(raw)
        return plan

    def _parse_json_response(self, raw: str) -> Dict[str, Any]:
        """Extract and parse the JSON block from the LLM response."""
        raw = raw.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            lines = raw.split("\n")
            lines = [l for l in lines if not l.startswith("```")]
            raw = "\n".join(lines)
        return json.loads(raw)

    def _plan_to_tasks(
        self, plan: Dict[str, Any], parent_id: str
    ) -> List[AgentTask]:
        tasks: List[AgentTask] = []
        step_id_map: Dict[str, str] = {}

        for step in plan.get("steps", []):
            task_id = f"{parent_id}_{step['id']}"
            step_id_map[step["id"]] = task_id
            depends_on = [
                step_id_map[dep] for dep in step.get("depends_on", []) if dep in step_id_map
            ]
            t = AgentTask(
                id=task_id,
                type=TaskType(step.get("agent_type", "generic")),
                goal=step["goal"],
                context={"title": step.get("title", "")},
                constraints=step.get("constraints", []),
                priority=TaskPriority(step.get("priority", 2)),
                parent_task_id=parent_id,
                depends_on=depends_on,
            )
            tasks.append(t)
        return tasks

    # ------------------------------------------------------------------
    # Re-planning
    # ------------------------------------------------------------------

    async def replan(
        self,
        original_task: AgentTask,
        failed_step_id: str,
        failure_reason: str,
    ) -> AgentResult:
        """Generate an updated plan given a failure at a specific step."""
        original_task.context["replan_reason"] = failure_reason
        original_task.context["failed_step"] = failed_step_id
        original_task.goal = (
            f"[RE-PLAN] {original_task.goal} "
            f"(step '{failed_step_id}' failed: {failure_reason})"
        )
        return await self.execute(original_task)
