from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# DDL — same PostgreSQL instance as long-term memory
# ---------------------------------------------------------------------------

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS jarvis_episodes (
    id              TEXT PRIMARY KEY,
    event_type      TEXT NOT NULL,
    description     TEXT NOT NULL,
    context         JSONB DEFAULT '{}',
    emotional_tone  TEXT DEFAULT 'neutral',
    related_ids     JSONB DEFAULT '[]',
    occurred_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_episodes_event_type  ON jarvis_episodes(event_type);
CREATE INDEX IF NOT EXISTS idx_episodes_occurred_at ON jarvis_episodes(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_description ON jarvis_episodes USING GIN(to_tsvector('english', description));
"""


# ---------------------------------------------------------------------------
# Pydantic model
# ---------------------------------------------------------------------------

class EpisodeRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str
    description: str
    context: Dict[str, Any] = Field(default_factory=dict)
    emotional_tone: str = "neutral"
    related_ids: List[str] = Field(default_factory=list)
    occurred_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# EpisodicMemory
# ---------------------------------------------------------------------------

class EpisodicMemory:
    """
    Stores and retrieves timestamped experiential events (episodes).

    Backed by PostgreSQL (same DB as long-term memory) when *db_pool* is
    provided; falls back to an in-memory list otherwise.

    Episode sequences can be linked via related_ids to represent chains of
    events (e.g., "user asked about X, then did Y").
    """

    def __init__(self, db_pool: Any = None) -> None:
        self._pool = db_pool
        # In-memory fallback store
        self._store: List[EpisodeRecord] = []

    # ------------------------------------------------------------------
    # Initialization
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        """Create the episodes table if it does not exist."""
        if self._pool:
            async with self._pool.acquire() as conn:
                await conn.execute(_CREATE_TABLE_SQL)
            logger.info("EpisodicMemory: PostgreSQL table initialized.")

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    async def store_episode(
        self,
        event_type: str,
        description: str,
        context: Optional[Dict[str, Any]] = None,
        emotional_tone: str = "neutral",
        related_ids: Optional[List[str]] = None,
        occurred_at: Optional[datetime] = None,
    ) -> EpisodeRecord:
        """
        Persist a new episode.

        Parameters
        ----------
        event_type:
            Category of the event, e.g. ``"user_query"``, ``"agent_action"``,
            ``"tool_call"``, ``"error"``.
        description:
            Human-readable description of what happened.
        context:
            Arbitrary JSON payload with additional details.
        emotional_tone:
            Qualitative label for the valence of the event
            (e.g. ``"positive"``, ``"negative"``, ``"neutral"``).
        related_ids:
            IDs of other episodes that are causally or temporally linked.
        occurred_at:
            When the event happened. Defaults to *now*.
        """
        record = EpisodeRecord(
            event_type=event_type,
            description=description,
            context=context or {},
            emotional_tone=emotional_tone,
            related_ids=related_ids or [],
            occurred_at=occurred_at or datetime.utcnow(),
        )

        if self._pool:
            await self._pg_insert(record)
        else:
            self._store.append(record)

        logger.debug("Episode stored: %s [%s]", record.id[:8], event_type)
        return record

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def retrieve_episodes(
        self,
        query: str,
        limit: int = 20,
        event_type: Optional[str] = None,
        emotional_tone: Optional[str] = None,
    ) -> List[EpisodeRecord]:
        """
        Retrieve episodes matching *query* (full-text or substring search).

        Results are ordered by recency (most recent first).
        """
        if self._pool:
            return await self._pg_search(query, limit, event_type, emotional_tone)
        return self._memory_search(query, limit, event_type, emotional_tone)

    async def get_timeline(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        event_type: Optional[str] = None,
        limit: int = 100,
    ) -> List[EpisodeRecord]:
        """
        Return episodes in chronological order within the given date range.
        """
        if self._pool:
            return await self._pg_timeline(start_date, end_date, event_type, limit)
        return self._memory_timeline(start_date, end_date, event_type, limit)

    async def get_by_id(self, episode_id: str) -> Optional[EpisodeRecord]:
        """Fetch a single episode by its ID."""
        if self._pool:
            return await self._pg_get(episode_id)
        return next((e for e in self._store if e.id == episode_id), None)

    # ------------------------------------------------------------------
    # Sequence linking
    # ------------------------------------------------------------------

    async def link_episodes(self, id_a: str, id_b: str) -> bool:
        """
        Bidirectionally link two episodes to represent a causal or temporal
        sequence (e.g., "user asked about X → then did Y").
        """
        a = await self.get_by_id(id_a)
        b = await self.get_by_id(id_b)
        if not a or not b:
            return False

        changed = False
        if id_b not in a.related_ids:
            a.related_ids.append(id_b)
            await self._update_related(a)
            changed = True
        if id_a not in b.related_ids:
            b.related_ids.append(id_a)
            await self._update_related(b)
            changed = True
        return changed

    async def get_sequence(self, episode_id: str) -> List[EpisodeRecord]:
        """
        Return the chain of episodes linked to *episode_id*, ordered
        chronologically.
        """
        root = await self.get_by_id(episode_id)
        if root is None:
            return []
        chain: List[EpisodeRecord] = [root]
        seen = {episode_id}
        queue = list(root.related_ids)
        while queue:
            next_id = queue.pop(0)
            if next_id in seen:
                continue
            seen.add(next_id)
            ep = await self.get_by_id(next_id)
            if ep:
                chain.append(ep)
                queue.extend(rid for rid in ep.related_ids if rid not in seen)
        chain.sort(key=lambda e: e.occurred_at)
        return chain

    # ------------------------------------------------------------------
    # PostgreSQL helpers
    # ------------------------------------------------------------------

    async def _pg_insert(self, record: EpisodeRecord) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO jarvis_episodes
                    (id, event_type, description, context, emotional_tone,
                     related_ids, occurred_at, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO NOTHING
                """,
                record.id,
                record.event_type,
                record.description,
                json.dumps(record.context),
                record.emotional_tone,
                json.dumps(record.related_ids),
                record.occurred_at,
                record.created_at,
            )

    async def _pg_get(self, episode_id: str) -> Optional[EpisodeRecord]:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM jarvis_episodes WHERE id = $1", episode_id
            )
        return self._row_to_record(dict(row)) if row else None

    async def _pg_search(
        self,
        query: str,
        limit: int,
        event_type: Optional[str],
        emotional_tone: Optional[str],
    ) -> List[EpisodeRecord]:
        clauses = ["to_tsvector('english', description) @@ plainto_tsquery('english', $1)"]
        params: list = [query]
        idx = 2
        if event_type:
            clauses.append(f"event_type = ${idx}")
            params.append(event_type)
            idx += 1
        if emotional_tone:
            clauses.append(f"emotional_tone = ${idx}")
            params.append(emotional_tone)
            idx += 1
        params.append(limit)
        where = " AND ".join(clauses)
        sql = (
            f"SELECT * FROM jarvis_episodes WHERE {where} "
            f"ORDER BY occurred_at DESC LIMIT ${idx}"
        )
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)
        return [self._row_to_record(dict(r)) for r in rows]

    async def _pg_timeline(
        self,
        start_date: Optional[datetime],
        end_date: Optional[datetime],
        event_type: Optional[str],
        limit: int,
    ) -> List[EpisodeRecord]:
        clauses: list[str] = []
        params: list = []
        idx = 1
        if start_date:
            clauses.append(f"occurred_at >= ${idx}")
            params.append(start_date)
            idx += 1
        if end_date:
            clauses.append(f"occurred_at <= ${idx}")
            params.append(end_date)
            idx += 1
        if event_type:
            clauses.append(f"event_type = ${idx}")
            params.append(event_type)
            idx += 1
        params.append(limit)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = (
            f"SELECT * FROM jarvis_episodes {where} "
            f"ORDER BY occurred_at ASC LIMIT ${idx}"
        )
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)
        return [self._row_to_record(dict(r)) for r in rows]

    async def _update_related(self, record: EpisodeRecord) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                "UPDATE jarvis_episodes SET related_ids = $1 WHERE id = $2",
                json.dumps(record.related_ids),
                record.id,
            )

    # ------------------------------------------------------------------
    # In-memory fallback helpers
    # ------------------------------------------------------------------

    def _memory_search(
        self,
        query: str,
        limit: int,
        event_type: Optional[str],
        emotional_tone: Optional[str],
    ) -> List[EpisodeRecord]:
        query_lower = query.lower()
        results = [
            e for e in self._store
            if query_lower in e.description.lower()
            and (event_type is None or e.event_type == event_type)
            and (emotional_tone is None or e.emotional_tone == emotional_tone)
        ]
        results.sort(key=lambda e: e.occurred_at, reverse=True)
        return results[:limit]

    def _memory_timeline(
        self,
        start_date: Optional[datetime],
        end_date: Optional[datetime],
        event_type: Optional[str],
        limit: int,
    ) -> List[EpisodeRecord]:
        results = [
            e for e in self._store
            if (start_date is None or e.occurred_at >= start_date)
            and (end_date is None or e.occurred_at <= end_date)
            and (event_type is None or e.event_type == event_type)
        ]
        results.sort(key=lambda e: e.occurred_at)
        return results[:limit]

    # ------------------------------------------------------------------
    # Shared deserialization
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_record(row: Dict[str, Any]) -> EpisodeRecord:
        row["context"] = (
            json.loads(row["context"])
            if isinstance(row["context"], str)
            else row.get("context") or {}
        )
        row["related_ids"] = (
            json.loads(row["related_ids"])
            if isinstance(row["related_ids"], str)
            else row.get("related_ids") or []
        )
        return EpisodeRecord(**row)
