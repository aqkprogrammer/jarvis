from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from agents.base.agent_types import AgentResult, AgentTask
from agents.base.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class CalendarAgent(BaseAgent):
    """Agent for calendar operations via Google Calendar API or LLM fallback."""

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    @property
    def name(self) -> str:
        return "calendar"

    @property
    def description(self) -> str:
        return (
            "Manages calendar operations: scheduling events, listing upcoming events, "
            "deleting events, and finding free time slots."
        )

    @property
    def capabilities(self) -> List[str]:
        return ["schedule_event", "list_events", "delete_event", "find_free_time"]

    # ------------------------------------------------------------------
    # Core execution
    # ------------------------------------------------------------------

    async def execute(self, task: AgentTask) -> AgentResult:
        """Route to Google Calendar API if credentials are available, else LLM reasoning."""
        credentials_path = os.environ.get("GOOGLE_CALENDAR_CREDENTIALS")

        if credentials_path:
            return await self._execute_with_google(task, credentials_path)
        return await self._execute_with_llm(task)

    # ------------------------------------------------------------------
    # Google Calendar path
    # ------------------------------------------------------------------

    async def _execute_with_google(
        self, task: AgentTask, credentials_path: str
    ) -> AgentResult:
        try:
            from google.oauth2.service_account import Credentials
            from googleapiclient.discovery import build
        except ImportError:
            logger.warning(
                "google-api-python-client not installed; falling back to LLM reasoning."
            )
            return await self._execute_with_llm(task)

        try:
            scopes = ["https://www.googleapis.com/auth/calendar"]
            creds = Credentials.from_service_account_file(credentials_path, scopes=scopes)
            service = build("calendar", "v3", credentials=creds, cache_discovery=False)

            action = self._detect_action(task.goal)

            if action == "list_events":
                result = await self._list_events(service, task)
            elif action == "schedule_event":
                result = await self._schedule_event(service, task)
            elif action == "delete_event":
                result = await self._delete_event(service, task)
            elif action == "find_free_time":
                result = await self._find_free_time(service, task)
            else:
                result = {"message": f"Unrecognised calendar action in goal: {task.goal}"}

            return AgentResult(
                task_id=task.id,
                success=True,
                output=result,
            )
        except Exception as exc:
            logger.exception("Google Calendar call failed: %s", exc)
            return AgentResult(
                task_id=task.id,
                success=False,
                error=str(exc),
                error_type=type(exc).__name__,
            )

    async def _list_events(self, service: Any, task: AgentTask) -> Dict[str, Any]:
        import asyncio
        from datetime import datetime, timezone

        time_min = task.context.get("time_min", datetime.now(timezone.utc).isoformat())
        max_results = task.context.get("max_results", 10)
        calendar_id = task.context.get("calendar_id", "primary")

        loop = asyncio.get_event_loop()
        events_result = await loop.run_in_executor(
            None,
            lambda: service.events()
            .list(
                calendarId=calendar_id,
                timeMin=time_min,
                maxResults=max_results,
                singleEvents=True,
                orderBy="startTime",
            )
            .execute(),
        )
        events = events_result.get("items", [])
        return {"events": events, "count": len(events)}

    async def _schedule_event(self, service: Any, task: AgentTask) -> Dict[str, Any]:
        import asyncio

        event_body = task.context.get("event", {})
        calendar_id = task.context.get("calendar_id", "primary")

        if not event_body:
            # Ask the LLM to extract event details from the goal
            if self._llm:
                prompt = (
                    "Extract calendar event details from this request and return a JSON object "
                    "with keys: summary, start (ISO datetime), end (ISO datetime), description "
                    f"(optional), attendees (list of email strings, optional).\n\nRequest: {task.goal}"
                )
                raw = await self._llm_complete(prompt)
                try:
                    import re
                    match = re.search(r"\{.*\}", raw, re.DOTALL)
                    event_body = json.loads(match.group()) if match else {}
                except Exception:
                    event_body = {}

        if not event_body.get("summary"):
            return {"message": "Could not extract event details. Please provide event context."}

        # Normalise to Google Calendar format
        gc_event: Dict[str, Any] = {
            "summary": event_body.get("summary", ""),
            "description": event_body.get("description", ""),
            "start": {"dateTime": event_body.get("start"), "timeZone": "UTC"},
            "end": {"dateTime": event_body.get("end"), "timeZone": "UTC"},
        }
        if event_body.get("attendees"):
            gc_event["attendees"] = [{"email": e} for e in event_body["attendees"]]

        loop = asyncio.get_event_loop()
        created = await loop.run_in_executor(
            None,
            lambda: service.events()
            .insert(calendarId=calendar_id, body=gc_event)
            .execute(),
        )
        return {"created_event_id": created.get("id"), "html_link": created.get("htmlLink")}

    async def _delete_event(self, service: Any, task: AgentTask) -> Dict[str, Any]:
        import asyncio

        event_id = task.context.get("event_id")
        calendar_id = task.context.get("calendar_id", "primary")
        if not event_id:
            return {"message": "event_id is required in task context to delete an event."}

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: service.events()
            .delete(calendarId=calendar_id, eventId=event_id)
            .execute(),
        )
        return {"deleted": True, "event_id": event_id}

    async def _find_free_time(self, service: Any, task: AgentTask) -> Dict[str, Any]:
        import asyncio
        from datetime import datetime, timezone

        time_min = task.context.get("time_min", datetime.now(timezone.utc).isoformat())
        time_max = task.context.get("time_max")
        calendar_id = task.context.get("calendar_id", "primary")

        if not time_max:
            return {"message": "time_max is required in task context to find free time."}

        body = {
            "timeMin": time_min,
            "timeMax": time_max,
            "items": [{"id": calendar_id}],
        }
        loop = asyncio.get_event_loop()
        freebusy = await loop.run_in_executor(
            None,
            lambda: service.freebusy().query(body=body).execute(),
        )
        busy_slots = freebusy.get("calendars", {}).get(calendar_id, {}).get("busy", [])
        return {"busy_slots": busy_slots, "time_min": time_min, "time_max": time_max}

    # ------------------------------------------------------------------
    # LLM fallback path
    # ------------------------------------------------------------------

    async def _execute_with_llm(self, task: AgentTask) -> AgentResult:
        if self._llm is None:
            return AgentResult(
                task_id=task.id,
                success=False,
                output={
                    "message": (
                        "Google Calendar integration is not configured. "
                        "Set the GOOGLE_CALENDAR_CREDENTIALS environment variable with the path "
                        "to your service account JSON file, or provide an LLM provider."
                    )
                },
                error="No Google Calendar credentials or LLM provider configured.",
                error_type="ConfigurationError",
            )

        context = task.context
        prompt = (
            f"You are a calendar assistant.\n"
            f"Task: {task.goal}\n"
            f"Context: {json.dumps(context)}\n\n"
            "Provide a helpful, structured response about this calendar operation. "
            "Note that no real calendar API is connected. Describe what would happen "
            "and ask for any missing information."
        )
        response = await self._llm_complete(prompt)
        return AgentResult(
            task_id=task.id,
            success=True,
            output={
                "message": response,
                "note": (
                    "Set GOOGLE_CALENDAR_CREDENTIALS to enable live Google Calendar integration."
                ),
            },
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _detect_action(goal: str) -> str:
        goal_lower = goal.lower()
        if any(w in goal_lower for w in ("schedule", "create", "add", "book", "invite")):
            return "schedule_event"
        if any(w in goal_lower for w in ("delete", "cancel", "remove")):
            return "delete_event"
        if any(w in goal_lower for w in ("free", "available", "availability", "slot")):
            return "find_free_time"
        return "list_events"
