from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict, List

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.workflow import Workflow, WorkflowRun
from app.services.ai_provider import AIProviderFactory, CompletionResult

logger = get_logger(__name__)

NODE_TYPES = {"trigger", "agent", "condition", "output"}
MAX_NODE_OUTPUT_CHARS = 4000


# ── Validation ────────────────────────────────────────────────────────────────

def _topological_order(
    nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]
) -> List[str]:
    """Return node ids in topological order (Kahn's algorithm).

    Raises ValueError if the graph contains a cycle.
    """
    node_ids = [n["id"] for n in nodes]
    in_degree: Dict[str, int] = {nid: 0 for nid in node_ids}
    adjacency: Dict[str, List[str]] = {nid: [] for nid in node_ids}

    for edge in edges:
        adjacency[edge["source"]].append(edge["target"])
        in_degree[edge["target"]] += 1

    queue = [nid for nid in node_ids if in_degree[nid] == 0]
    order: List[str] = []
    while queue:
        current = queue.pop(0)
        order.append(current)
        for neighbour in adjacency[current]:
            in_degree[neighbour] -= 1
            if in_degree[neighbour] == 0:
                queue.append(neighbour)

    if len(order) != len(node_ids):
        raise ValueError("Workflow graph contains a cycle")
    return order


def validate_workflow(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> None:
    """Validate workflow structure. Raises ValueError on any problem."""
    if not nodes:
        raise ValueError("Workflow must contain at least one node")

    node_ids: set[str] = set()
    for node in nodes:
        node_id = node.get("id")
        if not node_id or not isinstance(node_id, str):
            raise ValueError("Every node must have a string 'id'")
        if node_id in node_ids:
            raise ValueError(f"Duplicate node id: {node_id}")
        node_ids.add(node_id)
        node_type = node.get("type")
        if node_type not in NODE_TYPES:
            raise ValueError(
                f"Node '{node_id}' has invalid type '{node_type}'. "
                f"Allowed types: {', '.join(sorted(NODE_TYPES))}"
            )

    trigger_count = sum(1 for n in nodes if n.get("type") == "trigger")
    if trigger_count != 1:
        raise ValueError(f"Workflow must have exactly one trigger node (found {trigger_count})")

    for edge in edges:
        source, target = edge.get("source"), edge.get("target")
        if source not in node_ids:
            raise ValueError(f"Edge references unknown source node: {source}")
        if target not in node_ids:
            raise ValueError(f"Edge references unknown target node: {target}")

    # Raises on cycles
    _topological_order(nodes, edges)


# ── Node execution helpers ────────────────────────────────────────────────────

def _truncate(text: str) -> str:
    return text[:MAX_NODE_OUTPUT_CHARS]


def _evaluate_condition(condition: Dict[str, Any], text: str) -> bool:
    op = (condition or {}).get("op", "contains")
    value = str((condition or {}).get("value", ""))
    if op == "contains":
        return value in text
    if op == "not_contains":
        return value not in text
    if op == "equals":
        return text.strip() == value
    raise ValueError(f"Unknown condition op: {op}")


async def _run_agent_node(node: Dict[str, Any], incoming_text: str) -> str:
    data = node.get("data") or {}
    agent_type = data.get("agent_type") or "assistant"
    prompt = data.get("prompt") or ""
    system = f"You are the {agent_type} agent in a JARVIS workflow. {prompt}".strip()
    user_content = incoming_text if incoming_text.strip() else "(no input)"

    provider = AIProviderFactory.get()
    result: CompletionResult = await provider.complete(
        messages=[{"role": "user", "content": user_content}],
        system=system,
    )
    return result.content


# ── Execution ─────────────────────────────────────────────────────────────────

async def execute_workflow(
    db: AsyncSession, workflow: Workflow, input_text: str = ""
) -> WorkflowRun:
    """Execute a workflow inline, persisting a WorkflowRun with per-node results.

    Node semantics:
      * trigger   → output = input_text
      * agent     → default AI provider completion over concatenated incoming output
      * condition → passes incoming output through when the condition holds,
                    otherwise downstream nodes are marked "skipped"
      * output    → collects concatenated incoming output as the final result

    A node whose upstream produced nothing (skipped or failed) is marked
    "skipped". Any node failure marks the whole run "failed", but all node
    results gathered so far are persisted.
    """
    run = WorkflowRun(
        workflow_id=workflow.id,
        status="running",
        node_results={},
        started_at=datetime.now(timezone.utc),
    )
    db.add(run)
    await db.flush()

    node_results: Dict[str, Dict[str, Any]] = {}
    run_error: str | None = None

    try:
        nodes: List[Dict[str, Any]] = workflow.nodes or []
        edges: List[Dict[str, Any]] = workflow.edges or []
        order = _topological_order(nodes, edges)
        nodes_by_id = {n["id"]: n for n in nodes}
        incoming: Dict[str, List[str]] = {nid: [] for nid in nodes_by_id}
        for edge in edges:
            incoming[edge["target"]].append(edge["source"])

        # node_id -> propagated output; nodes absent from this dict do not
        # feed their downstream (skipped, failed, or failed condition).
        outputs: Dict[str, str] = {}

        for node_id in order:
            node = nodes_by_id[node_id]
            node_type = node.get("type")
            sources = incoming[node_id]
            active_outputs = [outputs[s] for s in sources if s in outputs]

            # Upstream produced nothing → this branch is skipped
            if sources and not active_outputs:
                node_results[node_id] = {
                    "status": "skipped",
                    "output": None,
                    "error": None,
                    "duration_ms": 0,
                }
                continue

            incoming_text = "\n\n".join(active_outputs)
            started = time.monotonic()
            try:
                if node_type == "trigger":
                    result_text = input_text
                    outputs[node_id] = result_text
                elif node_type == "agent":
                    result_text = await _run_agent_node(node, incoming_text or input_text)
                    outputs[node_id] = result_text
                elif node_type == "condition":
                    condition = (node.get("data") or {}).get("condition") or {}
                    passed = _evaluate_condition(condition, incoming_text)
                    if passed:
                        result_text = incoming_text
                        outputs[node_id] = result_text
                    else:
                        # Do not propagate: downstream branch will be skipped
                        result_text = "false"
                elif node_type == "output":
                    result_text = incoming_text
                    outputs[node_id] = result_text
                else:
                    raise ValueError(f"Unknown node type: {node_type}")

                duration_ms = int((time.monotonic() - started) * 1000)
                node_results[node_id] = {
                    "status": "completed",
                    "output": _truncate(result_text),
                    "error": None,
                    "duration_ms": duration_ms,
                }
            except Exception as exc:
                duration_ms = int((time.monotonic() - started) * 1000)
                node_results[node_id] = {
                    "status": "failed",
                    "output": None,
                    "error": str(exc),
                    "duration_ms": duration_ms,
                }
                if run_error is None:
                    run_error = f"Node '{node_id}' failed: {exc}"
                logger.warning(
                    "workflow_node_failed",
                    workflow_id=str(workflow.id),
                    node_id=node_id,
                    error=str(exc),
                )

        run.status = "failed" if run_error else "completed"
        run.error = run_error
    except Exception as exc:
        logger.error(
            "workflow_run_failed", workflow_id=str(workflow.id), error=str(exc)
        )
        run.status = "failed"
        run.error = str(exc)

    run.node_results = node_results
    run.finished_at = datetime.now(timezone.utc)
    await db.flush()
    return run
