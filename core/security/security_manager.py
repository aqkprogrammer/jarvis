"""
Security manager for JARVIS.
Handles action classification, permission matrix, audit logging,
secret scanning, rate limiting, and input sanitization.
"""

from __future__ import annotations

import asyncio
import hashlib
import html
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ActionRisk(str, Enum):
    SAFE = "safe"
    REQUIRES_CONFIRMATION = "requires_confirmation"
    DANGEROUS = "dangerous"
    FORBIDDEN = "forbidden"


class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"
    READONLY = "readonly"
    SERVICE = "service"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class ActionClassification:
    action: str
    risk: ActionRisk
    reason: str = ""
    requires_mfa: bool = False


@dataclass
class AuditEvent:
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    action: str = ""
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    risk: ActionRisk = ActionRisk.SAFE
    success: bool = True
    error_detail: Optional[str] = None
    ip_address: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)


@dataclass
class SecurityPolicy:
    """Configures what actions each role is allowed to perform."""
    role: UserRole
    allowed_actions: set[str] = field(default_factory=set)
    denied_actions: set[str] = field(default_factory=set)
    max_requests_per_minute: int = 60
    require_confirmation_for: set[ActionRisk] = field(
        default_factory=lambda: {ActionRisk.DANGEROUS}
    )


# ---------------------------------------------------------------------------
# Permission matrix
# ---------------------------------------------------------------------------


class PermissionMatrix:
    """
    Defines which roles can perform which action risk levels.

    Risk matrix (default):
        ADMIN    → SAFE, REQUIRES_CONFIRMATION, DANGEROUS
        USER     → SAFE, REQUIRES_CONFIRMATION
        READONLY → SAFE only
        SERVICE  → SAFE, REQUIRES_CONFIRMATION (no DANGEROUS)
    """

    _DEFAULT: dict[UserRole, set[ActionRisk]] = {
        UserRole.ADMIN:    {ActionRisk.SAFE, ActionRisk.REQUIRES_CONFIRMATION, ActionRisk.DANGEROUS},
        UserRole.USER:     {ActionRisk.SAFE, ActionRisk.REQUIRES_CONFIRMATION},
        UserRole.READONLY: {ActionRisk.SAFE},
        UserRole.SERVICE:  {ActionRisk.SAFE, ActionRisk.REQUIRES_CONFIRMATION},
    }

    def __init__(self, overrides: Optional[dict[UserRole, set[ActionRisk]]] = None) -> None:
        self._matrix = {**self._DEFAULT, **(overrides or {})}

    def can_perform(self, role: UserRole, risk: ActionRisk) -> bool:
        if risk == ActionRisk.FORBIDDEN:
            return False
        allowed = self._matrix.get(role, set())
        return risk in allowed

    def requires_confirmation(self, role: UserRole, risk: ActionRisk) -> bool:
        """True if the action needs explicit user confirmation before execution."""
        return risk == ActionRisk.REQUIRES_CONFIRMATION and self.can_perform(role, risk)


# ---------------------------------------------------------------------------
# Action classifier
# ---------------------------------------------------------------------------


class ActionClassifier:
    """
    Classifies JARVIS actions by risk level.
    Uses pattern matching on action names and content.
    """

    # (pattern, risk, reason)
    _RULES: list[tuple[re.Pattern, ActionRisk, str]] = [
        # Forbidden
        (re.compile(r"(delete_user|drop_database|wipe_all|format_disk)", re.I),
         ActionRisk.FORBIDDEN, "Destructive system action is forbidden"),
        # Dangerous
        (re.compile(r"(exec|shell|subprocess|rm\s+-rf|delete|destroy|drop|truncate)", re.I),
         ActionRisk.DANGEROUS, "Potentially destructive operation"),
        (re.compile(r"(write|overwrite|modify).*\.(env|config|password|secret|key)", re.I),
         ActionRisk.DANGEROUS, "Writing to sensitive files"),
        # Requires confirmation
        (re.compile(r"(send|email|message|notify|post|publish|deploy)", re.I),
         ActionRisk.REQUIRES_CONFIRMATION, "External communication or deployment"),
        (re.compile(r"(update|patch|modify|change|edit).*\b(file|database|record)", re.I),
         ActionRisk.REQUIRES_CONFIRMATION, "Modifying existing data"),
        (re.compile(r"(create|insert|add).*\b(user|payment|order)", re.I),
         ActionRisk.REQUIRES_CONFIRMATION, "Creating sensitive resource"),
        # Safe (explicit allow-list patterns)
        (re.compile(r"(read|get|list|search|fetch|view|describe|explain|summarize)", re.I),
         ActionRisk.SAFE, "Read-only operation"),
    ]

    def classify(self, action: str, context: Optional[str] = None) -> ActionClassification:
        text = f"{action} {context or ''}".strip()
        for pattern, risk, reason in self._RULES:
            if pattern.search(text):
                return ActionClassification(action=action, risk=risk, reason=reason)
        return ActionClassification(action=action, risk=ActionRisk.SAFE, reason="Default safe")


# ---------------------------------------------------------------------------
# Secret scanner
# ---------------------------------------------------------------------------


class SecretScanner:
    """
    Scans text for accidentally exposed secrets.
    Prevents API keys and passwords from being logged or returned.
    """

    _PATTERNS: list[tuple[str, re.Pattern]] = [
        ("aws_key",         re.compile(r"AKIA[0-9A-Z]{16}")),
        ("openai_key",      re.compile(r"sk-[a-zA-Z0-9]{20,}")),
        ("anthropic_key",   re.compile(r"sk-ant-[a-zA-Z0-9\-_]{20,}")),
        ("groq_key",        re.compile(r"gsk_[a-zA-Z0-9]{20,}")),
        ("github_token",    re.compile(r"ghp_[a-zA-Z0-9]{36}")),
        ("jwt_token",       re.compile(r"eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+")),
        ("generic_secret",  re.compile(r"(?i)(password|secret|token|api_key|apikey)\s*[=:]\s*['\"]?([^\s'\"]{8,})")),
        ("private_key",     re.compile(r"-----BEGIN (RSA |EC )?PRIVATE KEY-----")),
    ]

    def scan(self, text: str) -> list[dict]:
        """Return list of findings with type and (redacted) position."""
        findings = []
        for name, pattern in self._PATTERNS:
            for match in pattern.finditer(text):
                findings.append({
                    "type": name,
                    "start": match.start(),
                    "end": match.end(),
                    "preview": text[match.start():match.start() + 8] + "...",
                })
        return findings

    def redact(self, text: str) -> str:
        """Replace detected secrets with [REDACTED]."""
        for _, pattern in self._PATTERNS:
            text = pattern.sub("[REDACTED]", text)
        return text

    def contains_secret(self, text: str) -> bool:
        return bool(self.scan(text))


# ---------------------------------------------------------------------------
# Rate limiter (in-memory, per-user sliding window)
# ---------------------------------------------------------------------------


class RateLimiter:
    """
    Simple in-memory sliding-window rate limiter.
    For production, replace with a Redis-backed implementation.
    """

    def __init__(self) -> None:
        # user_id -> list[timestamp]
        self._windows: dict[str, list[float]] = {}
        self._lock = asyncio.Lock()

    async def is_allowed(self, user_id: str, max_requests: int, window_seconds: int = 60) -> bool:
        async with self._lock:
            now = time.time()
            cutoff = now - window_seconds
            history = [t for t in self._windows.get(user_id, []) if t > cutoff]
            if len(history) >= max_requests:
                return False
            history.append(now)
            self._windows[user_id] = history
            return True

    async def reset(self, user_id: str) -> None:
        async with self._lock:
            self._windows.pop(user_id, None)


# ---------------------------------------------------------------------------
# Input sanitizer
# ---------------------------------------------------------------------------


class InputSanitizer:
    """Basic input sanitization to prevent injection attacks."""

    # Patterns that should never appear in user input passed to agents
    _INJECTION_PATTERNS = [
        re.compile(r"<script[^>]*>.*?</script>", re.IGNORECASE | re.DOTALL),
        re.compile(r"javascript:", re.IGNORECASE),
        re.compile(r"on\w+\s*=", re.IGNORECASE),   # onerror=, onclick=, etc.
        re.compile(r"(union\s+select|drop\s+table|insert\s+into|delete\s+from)", re.IGNORECASE),
        re.compile(r"\.\./", re.IGNORECASE),         # Path traversal
    ]

    def sanitize_html(self, text: str) -> str:
        """Escape HTML entities."""
        return html.escape(text, quote=True)

    def sanitize_text(self, text: str, max_length: int = 10000) -> str:
        """Remove dangerous patterns and enforce length limit."""
        for pattern in self._INJECTION_PATTERNS:
            text = pattern.sub("", text)
        return text[:max_length].strip()

    def sanitize_filename(self, name: str) -> str:
        """Produce a safe filename from user-supplied string."""
        # Keep only alphanumeric, dots, dashes, underscores
        safe = re.sub(r"[^\w\.\-]", "_", name)
        # Prevent hidden files and path traversal
        safe = safe.lstrip(".")
        return safe[:255] or "unnamed"

    def validate_url(self, url: str) -> bool:
        """Return True if the URL is http/https and has a valid-looking host."""
        pattern = re.compile(
            r"^https?://"
            r"(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,}"
            r"(?::\d+)?"
            r"(?:/[^\s]*)?$"
        )
        return bool(pattern.match(url))


# ---------------------------------------------------------------------------
# SecurityManager — top-level orchestrator
# ---------------------------------------------------------------------------


class SecurityManager:
    """
    Central security orchestrator for JARVIS.

    Provides:
        - classify_action() → ActionClassification
        - check_permission() → bool
        - audit_log()
        - scan_for_secrets()
        - rate_limit_check()
        - sanitize_input()
    """

    def __init__(
        self,
        permission_matrix: Optional[PermissionMatrix] = None,
        audit_writer: Optional[Callable[[AuditEvent], None]] = None,
        rate_limits: Optional[dict[UserRole, int]] = None,
    ) -> None:
        self.permissions = permission_matrix or PermissionMatrix()
        self._audit_writer = audit_writer
        self._classifier = ActionClassifier()
        self._scanner = SecretScanner()
        self._sanitizer = InputSanitizer()
        self._rate_limiter = RateLimiter()
        self._rate_limits: dict[UserRole, int] = rate_limits or {
            UserRole.ADMIN:    300,
            UserRole.USER:     60,
            UserRole.READONLY: 20,
            UserRole.SERVICE:  600,
        }
        self._audit_queue: list[AuditEvent] = []

    # ------------------------------------------------------------------
    # Action flow
    # ------------------------------------------------------------------

    def classify_action(self, action: str, context: Optional[str] = None) -> ActionClassification:
        """Classify an action string by risk level."""
        return self._classifier.classify(action, context)

    def check_permission(
        self,
        role: UserRole,
        action: str,
        context: Optional[str] = None,
    ) -> bool:
        """Return True if *role* is allowed to perform *action*."""
        classification = self.classify_action(action, context)
        return self.permissions.can_perform(role, classification.risk)

    def requires_confirmation(
        self,
        role: UserRole,
        action: str,
        context: Optional[str] = None,
    ) -> bool:
        """Return True if the action needs explicit user confirmation."""
        classification = self.classify_action(action, context)
        return self.permissions.requires_confirmation(role, classification.risk)

    # ------------------------------------------------------------------
    # Rate limiting
    # ------------------------------------------------------------------

    async def check_rate_limit(self, user_id: str, role: UserRole) -> bool:
        """Return True if the request is within rate limits."""
        max_rpm = self._rate_limits.get(role, 60)
        allowed = await self._rate_limiter.is_allowed(user_id, max_rpm)
        if not allowed:
            logger.warning("Rate limit exceeded for user %s (role=%s)", user_id, role)
        return allowed

    # ------------------------------------------------------------------
    # Secret scanning
    # ------------------------------------------------------------------

    def scan_for_secrets(self, text: str) -> list[dict]:
        """Scan text for exposed secrets. Returns findings list."""
        findings = self._scanner.scan(text)
        if findings:
            logger.warning("Secret scan found %d potential secret(s)", len(findings))
        return findings

    def redact_secrets(self, text: str) -> str:
        """Replace detected secrets with [REDACTED]."""
        return self._scanner.redact(text)

    # ------------------------------------------------------------------
    # Input sanitization
    # ------------------------------------------------------------------

    def sanitize(self, text: str, max_length: int = 10000) -> str:
        return self._sanitizer.sanitize_text(text, max_length=max_length)

    def sanitize_filename(self, name: str) -> str:
        return self._sanitizer.sanitize_filename(name)

    def validate_url(self, url: str) -> bool:
        return self._sanitizer.validate_url(url)

    # ------------------------------------------------------------------
    # Audit logging
    # ------------------------------------------------------------------

    def audit(self, event: AuditEvent) -> None:
        """Record an audit event."""
        # Redact any secrets from metadata
        if event.metadata:
            safe_meta = {}
            for k, v in event.metadata.items():
                if isinstance(v, str):
                    safe_meta[k] = self._scanner.redact(v)
                else:
                    safe_meta[k] = v
            event.metadata = safe_meta

        self._audit_queue.append(event)
        logger.info(
            "AUDIT user=%s action=%s risk=%s success=%s",
            event.user_id,
            event.action,
            event.risk,
            event.success,
        )
        if self._audit_writer:
            try:
                self._audit_writer(event)
            except Exception as exc:
                logger.error("Audit writer failed: %s", exc)

    def audit_action(
        self,
        user_id: str,
        action: str,
        success: bool = True,
        role: UserRole = UserRole.USER,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        metadata: Optional[dict] = None,
        error_detail: Optional[str] = None,
    ) -> AuditEvent:
        """Convenience method to classify and immediately audit an action."""
        classification = self.classify_action(action)
        event = AuditEvent(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            risk=classification.risk,
            success=success,
            error_detail=error_detail,
            ip_address=ip_address,
            metadata=metadata or {},
        )
        self.audit(event)
        return event

    def get_audit_log(
        self,
        user_id: Optional[str] = None,
        limit: int = 100,
    ) -> list[AuditEvent]:
        """Return recent audit events (from in-memory buffer)."""
        events = self._audit_queue
        if user_id:
            events = [e for e in events if e.user_id == user_id]
        return events[-limit:]

    # ------------------------------------------------------------------
    # Dangerous action interceptor
    # ------------------------------------------------------------------

    async def intercept_dangerous_action(
        self,
        user_id: str,
        role: UserRole,
        action: str,
        context: Optional[str] = None,
        confirmation_callback: Optional[Callable[[str, str], bool]] = None,
    ) -> bool:
        """
        Full action gate: check permissions, rate limits, and optionally
        require explicit confirmation for dangerous actions.

        Returns True if the action should proceed.
        """
        # Rate limit check
        if not await self.check_rate_limit(user_id, role):
            self.audit_action(user_id, action, success=False, role=role,
                              error_detail="Rate limit exceeded")
            return False

        classification = self.classify_action(action, context)

        # Forbidden
        if classification.risk == ActionRisk.FORBIDDEN:
            self.audit_action(user_id, action, success=False, role=role,
                              error_detail="Forbidden action")
            return False

        # Permission check
        if not self.permissions.can_perform(role, classification.risk):
            self.audit_action(user_id, action, success=False, role=role,
                              error_detail=f"Permission denied for risk={classification.risk}")
            return False

        # Confirmation required
        if (
            classification.risk in (ActionRisk.DANGEROUS, ActionRisk.REQUIRES_CONFIRMATION)
            and confirmation_callback is not None
        ):
            confirmed = confirmation_callback(action, classification.reason)
            if not confirmed:
                self.audit_action(user_id, action, success=False, role=role,
                                  error_detail="User declined confirmation")
                return False

        self.audit_action(user_id, action, success=True, role=role)
        return True
