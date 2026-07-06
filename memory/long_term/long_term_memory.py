from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class MemoryCategory(str, Enum):
    FACT = "fact"
    PREFERENCE = "preference"
    SKILL = "skill"
    EPISODE = "episode"
    CONTEXT = "context"
    RELATIONSHIP = "relationship"
    INSTRUCTION = "instruction"


class LongTermMemoryRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: MemoryCategory = MemoryCategory.FACT
    content: str
    tags: List[str] = Field(default_factory=list)
    importance: float = Field(0.5, ge=0.0, le=1.0)
    source: str = ""
    related_ids: List[str] = Field(default_factory=list)
    access_count: int = 0
    last_accessed: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    extra: Dict[str, Any] = Field(default_factory=dict)


# SQL DDL used when initializing a PostgreSQL-backed store
_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS jarvis_memories (
    id          TEXT PRIMARY KEY,
    category    TEXT NOT NULL,
    content     TEXT NOT NULL,
    tags        JSONB DEFAULT '[]',
    importance  REAL DEFAULT 0.5,
    source      TEXT DEFAULT '',
    related_ids JSONB DEFAULT '[]',
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    extra       JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_memories_category ON jarvis_memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON jarvis_memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON jarvis_memories USING GIN(tags);
"""


class LongTermMemory:
    """Long-term memory manager: PostgreSQL-backed persistence with CRUD, search, and ranking."""

    def __init__(
        self,
        db_pool: Any = None,
        vector_store: Any = None,
        llm_provider: Any = None,
    ) -> None:
        self._pool = db_pool
        self._vector_store = vector_store
        self._llm = llm_provider
        # In-memory fallback
        self._store: Dict[str, LongTermMemoryRecord] = {}

    # ------------------------------------------------------------------
    # Initialization
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        if self._pool:
            async with self._pool.acquire() as conn:
                await conn.execute(_CREATE_TABLE_SQL)
            logger.info("LongTermMemory: PostgreSQL table initialized.")

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def create(self, record: LongTermMemoryRecord) -> LongTermMemoryRecord:
        if self._pool:
            await self._pg_upsert(record)
        else:
            self._store[record.id] = record
        if self._vector_store:
            await self._vector_store.upsert(
                id=record.id,
                text=record.content,
                metadata={"category": record.category, "importance": record.importance, "tags": record.tags},
            )
        logger.debug("LTM created: %s (%s)", record.id[:8], record.category)
        return record

    async def get(self, id: str) -> Optional[LongTermMemoryRecord]:
        if self._pool:
            return await self._pg_get(id)
        return self._store.get(id)

    async def update(self, id: str, **fields: Any) -> Optional[LongTermMemoryRecord]:
        record = await self.get(id)
        if record is None:
            return None
        for k, v in fields.items():
            if hasattr(record, k):
                setattr(record, k, v)
        record.updated_at = datetime.utcnow()
        await self.create(record)  # upsert
        return record

    async def delete(self, id: str) -> bool:
        if self._pool:
            async with self._pool.acquire() as conn:
                result = await conn.execute("DELETE FROM jarvis_memories WHERE id = $1", id)
                deleted = result.split()[-1] != "0"
        else:
            deleted = id in self._store
            self._store.pop(id, None)
        if self._vector_store and deleted:
            await self._vector_store.delete(id)
        return deleted

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    async def search(
        self,
        query: str,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        min_importance: float = 0.0,
        limit: int = 10,
    ) -> List[LongTermMemoryRecord]:
        # Semantic search first
        if self._vector_store:
            filters: Dict[str, Any] = {}
            if category:
                filters["category"] = category
            if min_importance > 0:
                filters["importance"] = {"$gte": min_importance}
            raw = await self._vector_store.search(query, limit=limit * 2, filters=filters or None)
            ids = [r["id"] for r in raw]
            records = [r for r in [await self.get(i) for i in ids] if r is not None]
        else:
            records = await self._keyword_search(query, category, tags, min_importance, limit * 2)

        # Apply tag filter
        if tags:
            tag_set = set(tags)
            records = [r for r in records if tag_set.intersection(r.tags)]

        # Rank by composite score
        ranked = self._rank(records, query)
        return ranked[:limit]

    def _rank(
        self, records: List[LongTermMemoryRecord], query: str
    ) -> List[LongTermMemoryRecord]:
        query_words = set(query.lower().split())

        def score(r: LongTermMemoryRecord) -> float:
            keyword_hit = sum(1 for w in query_words if w in r.content.lower()) / max(len(query_words), 1)
            recency = 1.0
            if r.last_accessed:
                age_days = (datetime.utcnow() - r.last_accessed).total_seconds() / 86400
                recency = max(0.1, 1.0 - age_days / 365)
            return r.importance * 0.5 + keyword_hit * 0.3 + recency * 0.2

        return sorted(records, key=score, reverse=True)

    async def _keyword_search(
        self,
        query: str,
        category: Optional[str],
        tags: Optional[List[str]],
        min_importance: float,
        limit: int,
    ) -> List[LongTermMemoryRecord]:
        query_lower = query.lower()
        results = []
        for record in self._store.values():
            if category and record.category.value != category:
                continue
            if record.importance < min_importance:
                continue
            if tags and not set(tags).intersection(record.tags):
                continue
            if query_lower in record.content.lower() or any(
                t.lower() in query_lower for t in record.tags
            ):
                results.append(record)
        return results[:limit]

    # ------------------------------------------------------------------
    # Auto-tag extraction
    # ------------------------------------------------------------------

    async def extract_tags(self, content: str) -> List[str]:
        if self._llm is None:
            words = [w.lower() for w in content.split() if len(w) > 5]
            return list(set(words[:8]))
        try:
            prompt = (
                "Extract 3-8 concise keyword tags from the following text. "
                "Return as a JSON array of lowercase strings.\n\n" + content
            )
            raw = await self._llm.complete(prompt)
            import re
            match = re.search(r"\[.*?\]", raw, re.DOTALL)
            if match:
                return json.loads(match.group())
        except Exception as exc:
            logger.warning("Tag extraction failed: %s", exc)
        return []

    # ------------------------------------------------------------------
    # Relationship mapping
    # ------------------------------------------------------------------

    async def link(self, id_a: str, id_b: str) -> bool:
        a = await self.get(id_a)
        b = await self.get(id_b)
        if not a or not b:
            return False
        if id_b not in a.related_ids:
            a.related_ids.append(id_b)
            await self.create(a)
        if id_a not in b.related_ids:
            b.related_ids.append(id_a)
            await self.create(b)
        return True

    async def get_related(self, id: str, depth: int = 1) -> List[LongTermMemoryRecord]:
        seen = {id}
        frontier = {id}
        results = []
        for _ in range(depth):
            next_frontier = set()
            for fid in frontier:
                record = await self.get(fid)
                if record:
                    for rid in record.related_ids:
                        if rid not in seen:
                            seen.add(rid)
                            next_frontier.add(rid)
                            r = await self.get(rid)
                            if r:
                                results.append(r)
            frontier = next_frontier
        return results

    # ------------------------------------------------------------------
    # Importance ranking
    # ------------------------------------------------------------------

    async def get_top_memories(
        self, limit: int = 20, category: Optional[str] = None
    ) -> List[LongTermMemoryRecord]:
        if self._pool:
            return await self._pg_top(limit, category)
        records = list(self._store.values())
        if category:
            records = [r for r in records if r.category.value == category]
        records.sort(key=lambda r: r.importance, reverse=True)
        return records[:limit]

    # ------------------------------------------------------------------
    # PostgreSQL helpers
    # ------------------------------------------------------------------

    async def _pg_upsert(self, record: LongTermMemoryRecord) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO jarvis_memories
                    (id, category, content, tags, importance, source, related_ids,
                     access_count, last_accessed, created_at, updated_at, extra)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                ON CONFLICT (id) DO UPDATE SET
                    category=EXCLUDED.category, content=EXCLUDED.content,
                    tags=EXCLUDED.tags, importance=EXCLUDED.importance,
                    source=EXCLUDED.source, related_ids=EXCLUDED.related_ids,
                    access_count=EXCLUDED.access_count, last_accessed=EXCLUDED.last_accessed,
                    updated_at=EXCLUDED.updated_at, extra=EXCLUDED.extra
                """,
                record.id,
                record.category.value,
                record.content,
                json.dumps(record.tags),
                record.importance,
                record.source,
                json.dumps(record.related_ids),
                record.access_count,
                record.last_accessed,
                record.created_at,
                record.updated_at,
                json.dumps(record.extra),
            )

    async def _pg_get(self, id: str) -> Optional[LongTermMemoryRecord]:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM jarvis_memories WHERE id=$1", id)
        if row is None:
            return None
        return self._row_to_record(dict(row))

    async def _pg_top(self, limit: int, category: Optional[str]) -> List[LongTermMemoryRecord]:
        async with self._pool.acquire() as conn:
            if category:
                rows = await conn.fetch(
                    "SELECT * FROM jarvis_memories WHERE category=$1 ORDER BY importance DESC LIMIT $2",
                    category, limit,
                )
            else:
                rows = await conn.fetch(
                    "SELECT * FROM jarvis_memories ORDER BY importance DESC LIMIT $1", limit
                )
        return [self._row_to_record(dict(r)) for r in rows]

    @staticmethod
    def _row_to_record(row: Dict[str, Any]) -> LongTermMemoryRecord:
        row["tags"] = json.loads(row["tags"]) if isinstance(row["tags"], str) else row["tags"] or []
        row["related_ids"] = json.loads(row["related_ids"]) if isinstance(row["related_ids"], str) else row.get("related_ids") or []
        row["extra"] = json.loads(row["extra"]) if isinstance(row["extra"], str) else row.get("extra") or {}
        return LongTermMemoryRecord(**row)
