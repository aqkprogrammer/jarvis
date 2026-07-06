from __future__ import annotations

import asyncio
import imaplib
import json
import logging
import os
import smtplib
from email import message_from_bytes
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List, Optional

from agents.base.agent_types import AgentResult, AgentTask
from agents.base.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class EmailAgent(BaseAgent):
    """Agent for email operations via SMTP (send) and IMAP (read/search)."""

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    @property
    def name(self) -> str:
        return "email"

    @property
    def description(self) -> str:
        return (
            "Manages email operations: sending emails, reading inbox, "
            "searching emails, and drafting replies."
        )

    @property
    def capabilities(self) -> List[str]:
        return ["send_email", "read_emails", "search_emails", "draft_reply"]

    # ------------------------------------------------------------------
    # Core execution
    # ------------------------------------------------------------------

    async def execute(self, task: AgentTask) -> AgentResult:
        action = self._detect_action(task.goal)
        try:
            if action == "send_email":
                result = await self._send_email(task)
            elif action == "read_emails":
                result = await self._read_emails(task)
            elif action == "search_emails":
                result = await self._search_emails(task)
            elif action == "draft_reply":
                result = await self._draft_reply(task)
            else:
                result = await self._llm_reason(task)

            return AgentResult(task_id=task.id, success=True, output=result)
        except Exception as exc:
            logger.exception("EmailAgent error for task %s: %s", task.id, exc)
            return AgentResult(
                task_id=task.id,
                success=False,
                error=str(exc),
                error_type=type(exc).__name__,
            )

    # ------------------------------------------------------------------
    # Send email (SMTP)
    # ------------------------------------------------------------------

    async def _send_email(self, task: AgentTask) -> Dict[str, Any]:
        ctx = task.context
        smtp_host = ctx.get("smtp_host") or os.environ.get("SMTP_HOST", "smtp.gmail.com")
        smtp_port = int(ctx.get("smtp_port") or os.environ.get("SMTP_PORT", 587))
        smtp_user = ctx.get("smtp_user") or os.environ.get("SMTP_USER", "")
        smtp_password = ctx.get("smtp_password") or os.environ.get("SMTP_PASSWORD", "")
        use_tls = str(ctx.get("smtp_tls", os.environ.get("SMTP_TLS", "true"))).lower() == "true"

        if not smtp_user or not smtp_password:
            return {
                "message": "SMTP credentials not configured. "
                "Set SMTP_USER and SMTP_PASSWORD environment variables."
            }

        to_addr: str = ctx.get("to", "")
        subject: str = ctx.get("subject", "")
        body: str = ctx.get("body", "")

        if not to_addr or not subject or not body:
            if self._llm:
                prompt = (
                    "Extract email fields from this request as JSON with keys: "
                    "to (email address), subject (string), body (string).\n\n"
                    f"Request: {task.goal}"
                )
                raw = await self._llm_complete(prompt)
                import re
                match = re.search(r"\{.*\}", raw, re.DOTALL)
                if match:
                    try:
                        extracted = json.loads(match.group())
                        to_addr = to_addr or extracted.get("to", "")
                        subject = subject or extracted.get("subject", "")
                        body = body or extracted.get("body", "")
                    except Exception:
                        pass

        if not to_addr:
            return {"message": "Recipient email address is required."}

        msg = MIMEMultipart("alternative")
        msg["From"] = smtp_user
        msg["To"] = to_addr
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        loop = asyncio.get_event_loop()

        def _do_send() -> None:
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                if use_tls:
                    server.starttls()
                server.login(smtp_user, smtp_password)
                server.sendmail(smtp_user, [to_addr], msg.as_string())

        await loop.run_in_executor(None, _do_send)
        return {"sent": True, "to": to_addr, "subject": subject}

    # ------------------------------------------------------------------
    # Read emails (IMAP)
    # ------------------------------------------------------------------

    async def _read_emails(self, task: AgentTask) -> Dict[str, Any]:
        messages, error = await self._imap_fetch(task, search_criteria="ALL")
        if error:
            return {"message": error}
        return {"emails": messages, "count": len(messages)}

    # ------------------------------------------------------------------
    # Search emails (IMAP)
    # ------------------------------------------------------------------

    async def _search_emails(self, task: AgentTask) -> Dict[str, Any]:
        ctx = task.context
        query = ctx.get("query") or task.goal
        # Build IMAP search string from query
        search_criteria = f'SUBJECT "{query}"'
        if ctx.get("from_addr"):
            search_criteria = f'FROM "{ctx["from_addr"]}"'
        elif ctx.get("body"):
            search_criteria = f'BODY "{ctx["body"]}"'

        messages, error = await self._imap_fetch(task, search_criteria=search_criteria)
        if error:
            return {"message": error}
        return {"emails": messages, "count": len(messages), "query": query}

    # ------------------------------------------------------------------
    # Draft reply (LLM)
    # ------------------------------------------------------------------

    async def _draft_reply(self, task: AgentTask) -> Dict[str, Any]:
        ctx = task.context
        original = ctx.get("original_email", "")
        instructions = ctx.get("reply_instructions", task.goal)

        if self._llm is None:
            return {
                "message": "LLM provider required to draft replies.",
                "draft": "",
            }

        prompt = (
            "You are an email assistant. Draft a professional reply to the following email.\n\n"
            f"Original email:\n{original}\n\n"
            f"Reply instructions: {instructions}\n\n"
            "Write only the reply body, no subject line."
        )
        draft = await self._llm_complete(prompt)
        return {"draft": draft, "original_subject": ctx.get("subject", "")}

    # ------------------------------------------------------------------
    # IMAP helper
    # ------------------------------------------------------------------

    async def _imap_fetch(
        self, task: AgentTask, search_criteria: str = "ALL"
    ) -> tuple[List[Dict[str, Any]], Optional[str]]:
        ctx = task.context
        imap_host = ctx.get("imap_host") or os.environ.get("IMAP_HOST", "imap.gmail.com")
        imap_port = int(ctx.get("imap_port") or os.environ.get("IMAP_PORT", 993))
        imap_user = ctx.get("imap_user") or os.environ.get("SMTP_USER", "")
        imap_password = ctx.get("imap_password") or os.environ.get("SMTP_PASSWORD", "")
        max_emails = int(ctx.get("max_emails", 10))
        mailbox = ctx.get("mailbox", "INBOX")

        if not imap_user or not imap_password:
            return [], (
                "IMAP credentials not configured. "
                "Set SMTP_USER / SMTP_PASSWORD (or IMAP_HOST/IMAP_USER/IMAP_PASSWORD) "
                "environment variables."
            )

        loop = asyncio.get_event_loop()

        def _do_fetch() -> List[Dict[str, Any]]:
            messages: List[Dict[str, Any]] = []
            with imaplib.IMAP4_SSL(imap_host, imap_port) as mail:
                mail.login(imap_user, imap_password)
                mail.select(mailbox)
                _, data = mail.search(None, search_criteria)
                ids = data[0].split()
                # Most recent first, limited
                for num in reversed(ids[-max_emails:]):
                    _, msg_data = mail.fetch(num, "(RFC822)")
                    raw = msg_data[0][1]
                    msg = message_from_bytes(raw)
                    body = ""
                    if msg.is_multipart():
                        for part in msg.walk():
                            if part.get_content_type() == "text/plain":
                                body = part.get_payload(decode=True).decode("utf-8", errors="replace")
                                break
                    else:
                        body = msg.get_payload(decode=True).decode("utf-8", errors="replace")
                    messages.append({
                        "from": msg.get("From", ""),
                        "to": msg.get("To", ""),
                        "subject": msg.get("Subject", ""),
                        "date": msg.get("Date", ""),
                        "body": body[:2000],  # truncate for safety
                    })
            return messages

        try:
            result = await loop.run_in_executor(None, _do_fetch)
            return result, None
        except Exception as exc:
            return [], str(exc)

    # ------------------------------------------------------------------
    # LLM reasoning fallback
    # ------------------------------------------------------------------

    async def _llm_reason(self, task: AgentTask) -> Dict[str, Any]:
        if self._llm is None:
            return {
                "message": (
                    "Email integration is not configured and no LLM provider is available. "
                    "Set SMTP_USER, SMTP_PASSWORD, and related environment variables."
                )
            }
        prompt = (
            f"You are an email assistant. The user asked: {task.goal}\n"
            f"Context: {json.dumps(task.context)}\n\n"
            "Provide a helpful response. If credentials are missing, explain what to configure."
        )
        response = await self._llm_complete(prompt)
        return {"message": response}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _detect_action(goal: str) -> str:
        goal_lower = goal.lower()
        if any(w in goal_lower for w in ("send", "compose", "write email", "email to")):
            return "send_email"
        if any(w in goal_lower for w in ("search", "find", "look for")):
            return "search_emails"
        if any(w in goal_lower for w in ("reply", "respond", "draft", "answer")):
            return "draft_reply"
        if any(w in goal_lower for w in ("read", "inbox", "check email", "list email")):
            return "read_emails"
        return "read_emails"
