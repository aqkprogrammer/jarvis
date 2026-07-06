from __future__ import annotations

import asyncio
import logging
import math
import uuid
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from agents.base.agent_types import AgentResult, AgentTask
from agents.base.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class MemoryType(str, Enum):
    FACT = "fact"
    PREFERENCE = "preference"
    SKILL = "skill"
    EPISODE = "episode"
    CONTEXT = "context"
    RELATIONSHIP = "relationship"


class MemoryEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: MemoryType = MemoryType.FACT
    content: str
    tags: List[str] = Field(default_factory=list)
    importance: float = Field(0.5, ge=0.0, le=1.0)
    source: str = ""
    related_ids: List[str] = Field(default_factory=list)
    access_count: int = 0
    last_accessed: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    decay_factor: float = 1.0  # 0 = forgotten, 1 = fresh
    metadata: Dict[str, Any] = Field(default_factory=dict)


class MemoryAgent(BaseAgent):
    """Memory management agent: extract, classify, score, consolidate, decay memories."""

    DECAY_HALF_LIFE_DAYS = 30  # days before low-importance memory decays by half
    CONSOLIDATION_SIMILARITY_THRESHOLD = 0.85

    def __init__(self, vector_store: Any = None, db: Any = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._vector_store = vector_store
        self._db = db
        self._in_memory: Dict[str, MemoryEntry] = {}  # fallback local store

    @property
    def name(self) -> str:
        return "memory"

    @property
    def description(self) -> str:
        return "Memory management: extract, classify, score, deduplicate, link, decay, consolidate."

    @property
    def capabilities(self) -> List[str]:
        return ["memory", "remember", "recall", "store", "learn", "forget"]

    # ------------------------------------------------------------------
    # Main execution
    # ------------------------------------------------------------------

    async def execute(self, task: AgentTask) -> AgentResult:
        try:
            action = task.context.get("action", "extract_and_store")
            dispatch = {
                "extract_and_store": self._do_extract_and_store,
                "retrieve": self._do_retrieve,
                "decay": self._do_decay,
                "consolidate": self._do_consolidate,
                "forget": self._do_forget,
            }
            handler = dispatch.get(action, self._do_extract_and_store)
            return await handler(task)
        except Exception as exc:
            logger.exception("MemoryAgent failed for task %s", task.id)
            return AgentResult(task_id=task.id, success=False, error=str(exc))

    # ------------------------------------------------------------------
    # Action handlers
    # ------------------------------------------------------------------

    async def _do_extract_and_store(self, task: AgentTask) -> AgentResult:
        text = task.context.get("text", task.goal)
        source = task.context.get("source", "unknown")
        entries = await self._extract_memories(text, source)
        stored = []
        for entry in entries:
            entry = await self._deduplicate(entry)
            await self._store(entry)
            stored.append(entry.id)
        return AgentResult(
            task_id=task.id, success=True,
            output=f"Stored {len(stored)} memories.",
            artifacts={"memory_ids": stored, "entries": [e.model_dump() for e in entries]},
        )

    async def _do_retrieve(self, task: AgentTask) -> AgentResult:
        query = task.context.get("query", task.goal)
        limit = int(task.context.get("limit", 5))
        memory_type = task.context.get("type")
        results = await self._retrieve(query, limit=limit, memory_type=memory_type)
        # Update access stats
        for entry in results:
            entry.access_count += 1
            entry.last_accessed = datetime.utcnow()
            await self._store(entry)
        return AgentResult(
            task_id=task.id, success=True,
            output="\n\n".join(f"[{e.type}] {e.content}" for e in results),
            artifacts={"memories": [e.model_dump() for e in results]},
        )

    async def _do_decay(self, task: AgentTask) -> AgentResult:
        decayed = await self._apply_decay()
        forgotten = [e.id for e in decayed if e.decay_factor < 0.05]
        for eid in forgotten:
            self._in_memory.pop(eid, None)
        return AgentResult(
            task_id=task.id, success=True,
            output=f"Decayed {len(decayed)} memories; forgot {len(forgotten)}.",
            artifacts={"decayed_count": len(decayed), "forgotten": forgotten},
        )

    async def _do_consolidate(self, task: AgentTask) -> AgentResult:
        merged = await self._consolidate()
        return AgentResult(
            task_id=task.id, success=True,
            output=f"Consolidated {merged} memory pairs.",
            artifacts={"merged": merged},
        )

    async def _do_forget(self, task: AgentTask) -> AgentResult:
        memory_id = task.context.get("memory_id", "")
        if memory_id and memory_id in self._in_memory:
            del self._in_memory[memory_id]
            return AgentResult(task_id=task.id, success=True, output=f"Forgot memory {memory_id}.")
        return AgentResult(task_id=task.id, success=False, error=f"Memory not found: {memory_id}")

    # ------------------------------------------------------------------
    # Core logic
    # ------------------------------------------------------------------

    async def _extract_memories(self, text: str, source: str) -> List[MemoryEntry]:
        if self._llm is None:
            # Simple heuristic: treat whole text as one episodic memory
            return [MemoryEntry(
                content=text[:2000],
                type=MemoryType.EPISODE,
                source=source,
                importance=0.5,
            )]

        messages = [
            {
                "role": "system",
                "content": (
                    "Extract distinct, atomic facts or memories from the text. "
                    "Return a JSON array of objects with fields: "
                    "content (string), type (fact/preference/skill/episode/context/relationship), "
                    "importance (0.0-1.0), tags (array of strings)."
                ),
            },
            {"role": "user", "content": text},
        ]
        raw = await self._llm_chat(messages)
        import json, re
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if not match:
            return []
        data = json.loads(match.group())
        entries = []
        for item in data:
            entries.append(MemoryEntry(
                content=item.get("content", ""),
                type=MemoryType(item.get("type", "fact")),
                importance=float(item.get("importance", 0.5)),
                tags=item.get("tags", []),
                source=source,
            ))
        return entries

    async def _deduplicate(self, entry: MemoryEntry) -> MemoryEntry:
        # Simple substring deduplication against in-memory store
        for existing in self._in_memory.values():
            if existing.content.strip().lower() == entry.content.strip().lower():
                # Merge: keep higher importance, merge tags
                existing.importance = max(existing.importance, entry.importance)
                existing.tags = list(set(existing.tags + entry.tags))
                return existing
        return entry

    async def _store(self, entry: MemoryEntry) -> None:
        self._in_memory[entry.id] = entry
        if self._vector_store:
            await self._vector_store.upsert(
                id=entry.id,
                text=entry.content,
                metadata={"type": entry.type, "importance": entry.importance, "tags": entry.tags},
            )
        if self._db:
            await self._db.upsert_memory(entry)

    async def _retrieve(
        self,
        query: str,
        limit: int = 5,
        memory_type: Optional[str] = None,
    ) -> List[MemoryEntry]:
        if self._vector_store:
            filters = {"type": memory_type} if memory_type else {}
            results = await self._vector_store.search(query, limit=limit, filters=filters)
            ids = [r["id"] for r in results]
            return [self._in_memory[i] for i in ids if i in self._in_memory]

        # Fallback: keyword search
        query_lower = query.lower()
        scored = []
        for entry in self._in_memory.values():
            if memory_type and entry.type.value != memory_type:
                continue
            overlap = sum(1 for word in query_lower.split() if word in entry.content.lower())
            scored.append((overlap * entry.importance * entry.decay_factor, entry))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [e for _, e in scored[:limit]]

    async def _apply_decay(self) -> List[MemoryEntry]:
        now = datetime.utcnow()
        decayed = []
        for entry in list(self._in_memory.values()):
            age_days = (now - entry.created_at).total_seconds() / 86400
            # Decay only low-importance memories
            if entry.importance < 0.7:
                half_life = self.DECAY_HALF_LIFE_DAYS * (1 + entry.importance)
                entry.decay_factor = math.exp(-0.693 * age_days / half_life)
                decayed.append(entry)
        return decayed

    async def _consolidate(self) -> int:
        """Merge near-duplicate memories (simple word-overlap similarity)."""
        entries = list(self._in_memory.values())
        merged = 0
        to_delete = set()

        for i in range(len(entries)):
            if entries[i].id in to_delete:
                continue
            for j in range(i + 1, len(entries)):
                if entries[j].id in to_delete:
                    continue
                sim = self._jaccard(entries[i].content, entries[j].content)
                if sim >= self.CONSOLIDATION_SIMILARITY_THRESHOLD:
                    # Keep i, absorb j
                    entries[i].importance = max(entries[i].importance, entries[j].importance)
                    entries[i].tags = list(set(entries[i].tags + entries[j].tags))
                    entries[i].related_ids.append(entries[j].id)
                    to_delete.add(entries[j].id)
                    merged += 1

        for eid in to_delete:
            self._in_memory.pop(eid, None)
        return merged

    @staticmethod
    def _jaccard(a: str, b: str) -> float:
        set_a = set(a.lower().split())
        set_b = set(b.lower().split())
        if not set_a or not set_b:
            return 0.0
        return len(set_a & set_b) / len(set_a | set_b)

    # ------------------------------------------------------------------
    # Public helpers (called by BaseAgent.remember / recall)
    # ------------------------------------------------------------------

    async def store(self, key: str, value: Any, source: str = "system") -> None:
        entry = MemoryEntry(
            id=key,
            content=str(value),
            type=MemoryType.CONTEXT,
            source=source,
            importance=0.6,
        )
        await self._store(entry)

    async def search(self, query: str, limit: int = 5) -> List[Any]:
        results = await self._retrieve(query, limit=limit)
        return [{"id": e.id, "content": e.content, "type": e.type, "importance": e.importance}
                for e in results]
