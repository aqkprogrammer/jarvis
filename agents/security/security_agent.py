from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from agents.base.agent_types import AgentResult, AgentTask
from agents.base.base_agent import BaseAgent
from core.security.security_manager import (
    ActionRisk,
    AuditEvent,
    SecurityManager,
    UserRole,
)

logger = logging.getLogger(__name__)


class SecurityAgent(BaseAgent):
    """Agent that wraps SecurityManager for security operations."""

    def __init__(
        self,
        security_manager: Optional[SecurityManager] = None,
        llm_provider: Any = None,
        memory_store: Any = None,
        event_bus: Any = None,
    ) -> None:
        super().__init__(
            llm_provider=llm_provider,
            memory_store=memory_store,
            event_bus=event_bus,
        )
        self._security = security_manager or SecurityManager()

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    @property
    def name(self) -> str:
        return "security"

    @property
    def description(self) -> str:
        return (
            "Handles security operations: scanning for exposed secrets, checking action "
            "permissions, auditing actions, and classifying risk levels."
        )

    @property
    def capabilities(self) -> List[str]:
        return ["scan_for_secrets", "check_permissions", "audit_action", "classify_risk"]

    # ------------------------------------------------------------------
    # Core execution
    # ------------------------------------------------------------------

    async def execute(self, task: AgentTask) -> AgentResult:
        action = self._detect_action(task.goal)
        try:
            if action == "scan_for_secrets":
                result = self._scan_for_secrets(task)
            elif action == "check_permissions":
                result = self._check_permissions(task)
            elif action == "audit_action":
                result = self._audit_action(task)
            elif action == "classify_risk":
                result = self._classify_risk(task)
            else:
                result = await self._llm_reason(task)

            return AgentResult(task_id=task.id, success=True, output=result)
        except Exception as exc:
            logger.exception("SecurityAgent error for task %s: %s", task.id, exc)
            return AgentResult(
                task_id=task.id,
                success=False,
                error=str(exc),
                error_type=type(exc).__name__,
            )

    # ------------------------------------------------------------------
    # Capability implementations
    # ------------------------------------------------------------------

    def _scan_for_secrets(self, task: AgentTask) -> Dict[str, Any]:
        """Scan provided text for exposed secrets."""
        text = task.context.get("text") or task.goal
        findings = self._security.scan_for_secrets(text)
        redacted = self._security.redact_secrets(text)
        return {
            "findings": findings,
            "findings_count": len(findings),
            "has_secrets": bool(findings),
            "redacted_text": redacted,
        }

    def _check_permissions(self, task: AgentTask) -> Dict[str, Any]:
        """Check whether a role is permitted to perform an action."""
        ctx = task.context
        action_str: str = ctx.get("action") or task.goal
        role_str: str = ctx.get("role", "user")
        context_hint: Optional[str] = ctx.get("context_hint")

        try:
            role = UserRole(role_str.lower())
        except ValueError:
            return {
                "error": f"Unknown role '{role_str}'. Valid roles: admin, user, readonly, service."
            }

        allowed = self._security.check_permission(role, action_str, context_hint)
        needs_confirmation = self._security.requires_confirmation(role, action_str, context_hint)
        classification = self._security.classify_action(action_str, context_hint)

        return {
            "action": action_str,
            "role": role.value,
            "allowed": allowed,
            "requires_confirmation": needs_confirmation,
            "risk_level": classification.risk.value,
            "reason": classification.reason,
        }

    def _audit_action(self, task: AgentTask) -> Dict[str, Any]:
        """Record and return an audit event for an action."""
        ctx = task.context
        user_id: str = ctx.get("user_id", "unknown")
        action_str: str = ctx.get("action") or task.goal
        success: bool = bool(ctx.get("success", True))
        role_str: str = ctx.get("role", "user")
        resource_type: Optional[str] = ctx.get("resource_type")
        resource_id: Optional[str] = ctx.get("resource_id")
        ip_address: Optional[str] = ctx.get("ip_address")
        metadata: Optional[dict] = ctx.get("metadata")
        error_detail: Optional[str] = ctx.get("error_detail")

        try:
            role = UserRole(role_str.lower())
        except ValueError:
            role = UserRole.USER

        event = self._security.audit_action(
            user_id=user_id,
            action=action_str,
            success=success,
            role=role,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=ip_address,
            metadata=metadata,
            error_detail=error_detail,
        )
        return {
            "event_id": event.event_id,
            "user_id": event.user_id,
            "action": event.action,
            "risk": event.risk.value,
            "success": event.success,
            "timestamp": event.timestamp,
            "resource_type": event.resource_type,
            "resource_id": event.resource_id,
        }

    def _classify_risk(self, task: AgentTask) -> Dict[str, Any]:
        """Classify the risk level of an action string."""
        action_str = task.context.get("action") or task.goal
        context_hint = task.context.get("context_hint")
        classification = self._security.classify_action(action_str, context_hint)
        return {
            "action": classification.action,
            "risk_level": classification.risk.value,
            "reason": classification.reason,
            "requires_mfa": classification.requires_mfa,
            "is_forbidden": classification.risk == ActionRisk.FORBIDDEN,
            "is_dangerous": classification.risk == ActionRisk.DANGEROUS,
            "is_safe": classification.risk == ActionRisk.SAFE,
        }

    # ------------------------------------------------------------------
    # LLM reasoning fallback
    # ------------------------------------------------------------------

    async def _llm_reason(self, task: AgentTask) -> Dict[str, Any]:
        if self._llm is None:
            return {"message": f"No matching security action for: {task.goal}"}
        prompt = (
            "You are a security assistant for JARVIS. Analyse the following security-related "
            f"task and provide guidance:\n\nTask: {task.goal}\n"
            f"Context: {json.dumps(task.context)}\n\n"
            "Respond with a structured analysis covering risk, recommendations, and next steps."
        )
        response = await self._llm_complete(prompt)
        return {"analysis": response}

    # ------------------------------------------------------------------
    # Helper
    # ------------------------------------------------------------------

    @staticmethod
    def _detect_action(goal: str) -> str:
        goal_lower = goal.lower()
        if any(w in goal_lower for w in ("scan", "secret", "leak", "exposure", "redact")):
            return "scan_for_secrets"
        if any(w in goal_lower for w in ("permission", "allowed", "authorise", "authorize", "can ")):
            return "check_permissions"
        if any(w in goal_lower for w in ("audit", "log", "record", "track")):
            return "audit_action"
        if any(w in goal_lower for w in ("risk", "classify", "level", "dangerous", "safe")):
            return "classify_risk"
        return "classify_risk"
