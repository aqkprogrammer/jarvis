from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_SUMMARIZE_PROMPT = """Summarize the following conversation concisely, preserving all important facts,
decisions, and context. Keep it under 300 words."""


class SessionMemory:
    """Redis-backed short-term/session memory with token-aware context management."""

    DEFAULT_MAX_TOKENS = 8000
    DEFAULT_WINDOW_SIZE = 50  # max messages before summarization

    def __init__(
        self,
        session_id: str,
        redis_client: Any = None,
        llm_provider: Any = None,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        window_size: int = DEFAULT_WINDOW_SIZE,
        ttl_seconds: int = 3600 * 8,  # 8-hour TTL
    ) -> None:
        self._session_id = session_id
        self._redis = redis_client
        self._llm = llm_provider
        self._max_tokens = max_tokens
        self._window_size = window_size
        self._ttl = ttl_seconds

        # In-memory fallback when Redis is unavailable
        self._local_messages: List[Dict[str, Any]] = []
        self._local_state: Dict[str, Any] = {}
        self._local_history: List[str] = []
        self._summary: Optional[str] = None

    # ------------------------------------------------------------------
    # Keys
    # ------------------------------------------------------------------

    @property
    def _messages_key(self) -> str:
        return f"jarvis:session:{self._session_id}:messages"

    @property
    def _state_key(self) -> str:
        return f"jarvis:session:{self._session_id}:state"

    @property
    def _summary_key(self) -> str:
        return f"jarvis:session:{self._session_id}:summary"

    @property
    def _history_key(self) -> str:
        return f"jarvis:session:{self._session_id}:history"

    # ------------------------------------------------------------------
    # Message buffer
    # ------------------------------------------------------------------

    async def add_message(self, role: str, content: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        msg = {
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
            **(metadata or {}),
        }
        if self._redis:
            await self._redis.rpush(self._messages_key, json.dumps(msg))
            await self._redis.expire(self._messages_key, self._ttl)
        else:
            self._local_messages.append(msg)

        await self._maybe_summarize()

    async def get_messages(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        if self._redis:
            raw = await self._redis.lrange(self._messages_key, 0, -1)
            msgs = [json.loads(r) for r in raw]
        else:
            msgs = list(self._local_messages)
        return msgs[-limit:] if limit else msgs

    async def clear_messages(self) -> None:
        if self._redis:
            await self._redis.delete(self._messages_key)
        else:
            self._local_messages.clear()

    # ------------------------------------------------------------------
    # Token-aware context window
    # ------------------------------------------------------------------

    async def get_context_window(
        self, max_tokens: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Return messages that fit within the token budget, newest first."""
        budget = max_tokens or self._max_tokens
        messages = await self.get_messages()
        messages = list(reversed(messages))

        selected: List[Dict[str, Any]] = []
        used = 0
        for msg in messages:
            tokens = self._estimate_tokens(msg["content"])
            if used + tokens > budget:
                break
            selected.append(msg)
            used += tokens

        selected.reverse()
        if self._summary and selected:
            # Prepend summary as system context
            selected.insert(0, {"role": "system", "content": f"[Summary of prior context]: {self._summary}"})
        return selected

    # ------------------------------------------------------------------
    # Summarization
    # ------------------------------------------------------------------

    async def _maybe_summarize(self) -> None:
        msgs = await self.get_messages()
        if len(msgs) < self._window_size:
            return
        # Summarize the oldest half
        half = len(msgs) // 2
        to_summarize = msgs[:half]
        remaining = msgs[half:]

        summary = await self._summarize_messages(to_summarize)
        if summary:
            self._summary = summary
            if self._redis:
                await self._redis.set(self._summary_key, summary, ex=self._ttl)
            # Replace buffer with remaining messages
            if self._redis:
                await self._redis.delete(self._messages_key)
                for msg in remaining:
                    await self._redis.rpush(self._messages_key, json.dumps(msg))
                await self._redis.expire(self._messages_key, self._ttl)
            else:
                self._local_messages = remaining
            logger.info("Session %s: summarized %d messages.", self._session_id, half)

    async def _summarize_messages(self, messages: List[Dict[str, Any]]) -> Optional[str]:
        if not self._llm:
            return None
        conversation = "\n".join(
            f"{m['role'].upper()}: {m['content']}" for m in messages
        )
        try:
            return await self._llm.complete(
                f"{_SUMMARIZE_PROMPT}\n\nConversation:\n{conversation}"
            )
        except Exception as exc:
            logger.warning("Summarization failed: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Session state
    # ------------------------------------------------------------------

    async def set_state(self, key: str, value: Any) -> None:
        if self._redis:
            state = await self._get_state_dict()
            state[key] = value
            await self._redis.set(self._state_key, json.dumps(state), ex=self._ttl)
        else:
            self._local_state[key] = value

    async def get_state(self, key: str, default: Any = None) -> Any:
        if self._redis:
            state = await self._get_state_dict()
            return state.get(key, default)
        return self._local_state.get(key, default)

    async def get_all_state(self) -> Dict[str, Any]:
        if self._redis:
            return await self._get_state_dict()
        return dict(self._local_state)

    async def _get_state_dict(self) -> Dict[str, Any]:
        raw = await self._redis.get(self._state_key)
        return json.loads(raw) if raw else {}

    # ------------------------------------------------------------------
    # Command history
    # ------------------------------------------------------------------

    async def add_command(self, command: str) -> None:
        entry = json.dumps({"cmd": command, "ts": datetime.utcnow().isoformat()})
        if self._redis:
            await self._redis.rpush(self._history_key, entry)
            await self._redis.ltrim(self._history_key, -200, -1)  # keep last 200
            await self._redis.expire(self._history_key, self._ttl)
        else:
            self._local_history.append(entry)
            if len(self._local_history) > 200:
                self._local_history = self._local_history[-200:]

    async def get_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        if self._redis:
            raw = await self._redis.lrange(self._history_key, -limit, -1)
            return [json.loads(r) for r in raw]
        return [json.loads(r) for r in self._local_history[-limit:]]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        """Rough token estimation: ~4 chars per token."""
        return max(1, len(text) // 4)

    async def get_summary(self) -> Optional[str]:
        if self._redis:
            raw = await self._redis.get(self._summary_key)
            return raw.decode() if raw else None
        return self._summary

    async def delete_session(self) -> None:
        if self._redis:
            for key in [self._messages_key, self._state_key, self._summary_key, self._history_key]:
                await self._redis.delete(key)
        else:
            self._local_messages.clear()
            self._local_state.clear()
            self._local_history.clear()
            self._summary = None
