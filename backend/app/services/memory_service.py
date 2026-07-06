from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sentence_transformers import SentenceTransformer
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.memory import Memory

logger = get_logger(__name__)

_embedding_model: Optional[SentenceTransformer] = None


def _get_embedding_model() -> SentenceTransformer:
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedding_model


class MemoryService:
    def __init__(self, db: AsyncSession):
        self._db = db
        self._qdrant = None

    def _get_qdrant(self):
        if self._qdrant is None:
            from qdrant_client import QdrantClient
            self._qdrant = QdrantClient(
                url=settings.QDRANT_URL,
                api_key=settings.QDRANT_API_KEY,
            )
        return self._qdrant

    # ── Embedding ─────────────────────────────────────────────────────────────

    def _embed(self, text: str) -> List[float]:
        model = _get_embedding_model()
        return model.encode(text, normalize_embeddings=True).tolist()

    async def _ensure_collection(self) -> None:
        from qdrant_client.http.models import Distance, VectorParams
        client = self._get_qdrant()
        loop = asyncio.get_event_loop()
        collections = await loop.run_in_executor(None, lambda: client.get_collections().collections)
        names = [c.name for c in collections]
        if settings.QDRANT_COLLECTION_MEMORIES not in names:
            await loop.run_in_executor(
                None,
                lambda: client.create_collection(
                    collection_name=settings.QDRANT_COLLECTION_MEMORIES,
                    vectors_config=VectorParams(
                        size=settings.VECTOR_DIMENSION, distance=Distance.COSINE
                    ),
                ),
            )

    # ── CRUD ──────────────────────────────────────────────────────────────────

    async def create(
        self,
        user_id: int,
        content: str,
        memory_type: str = "fact",
        importance_score: float = 0.5,
        tags: Optional[List[str]] = None,
        summary: Optional[str] = None,
    ) -> Memory:
        await self._ensure_collection()

        embedding_id = str(uuid.uuid4())
        loop = asyncio.get_event_loop()
        vector = await loop.run_in_executor(None, self._embed, content)

        client = self._get_qdrant()
        from qdrant_client.http.models import PointStruct
        await loop.run_in_executor(
            None,
            lambda: client.upsert(
                collection_name=settings.QDRANT_COLLECTION_MEMORIES,
                points=[
                    PointStruct(
                        id=embedding_id,
                        vector=vector,
                        payload={
                            "user_id": user_id,
                            "memory_type": memory_type,
                            "content": content,
                        },
                    )
                ],
            ),
        )

        memory = Memory(
            user_id=user_id,
            content=content,
            summary=summary or content[:200],
            memory_type=memory_type,
            importance_score=importance_score,
            embedding_id=embedding_id,
            tags=tags or [],
        )
        self._db.add(memory)
        await self._db.flush()
        return memory

    async def get_by_id(self, memory_id: int, user_id: int) -> Optional[Memory]:
        result = await self._db.execute(
            select(Memory).where(Memory.id == memory_id, Memory.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def list_memories(
        self,
        user_id: int,
        memory_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Memory]:
        stmt = select(Memory).where(Memory.user_id == user_id)
        if memory_type:
            stmt = stmt.where(Memory.memory_type == memory_type)
        stmt = stmt.order_by(Memory.importance_score.desc()).offset(offset).limit(limit)
        result = await self._db.execute(stmt)
        return list(result.scalars().all())

    async def update(self, memory_id: int, user_id: int, **fields) -> Optional[Memory]:
        memory = await self.get_by_id(memory_id, user_id)
        if not memory:
            return None
        for k, v in fields.items():
            setattr(memory, k, v)
        await self._db.flush()
        return memory

    async def delete(self, memory_id: int, user_id: int) -> bool:
        memory = await self.get_by_id(memory_id, user_id)
        if not memory:
            return False
        if memory.embedding_id:
            try:
                from qdrant_client.http.models import PointIdsList
                loop = asyncio.get_event_loop()
                client = self._get_qdrant()
                await loop.run_in_executor(
                    None,
                    lambda: client.delete(
                        collection_name=settings.QDRANT_COLLECTION_MEMORIES,
                        points_selector=PointIdsList(points=[memory.embedding_id]),
                    ),
                )
            except Exception as exc:
                logger.warning("qdrant_delete_failed", error=str(exc))
        await self._db.delete(memory)
        await self._db.flush()
        return True

    # ── Semantic search ───────────────────────────────────────────────────────

    async def search(
        self, user_id: int, query: str, limit: int = 10, score_threshold: float = 0.5
    ) -> List[Dict[str, Any]]:
        await self._ensure_collection()
        loop = asyncio.get_event_loop()
        vector = await loop.run_in_executor(None, self._embed, query)
        client = self._get_qdrant()

        results = await loop.run_in_executor(
            None,
            lambda: client.search(
                collection_name=settings.QDRANT_COLLECTION_MEMORIES,
                query_vector=vector,
                limit=limit,
                score_threshold=score_threshold,
                query_filter={
                    "must": [{"key": "user_id", "match": {"value": user_id}}]
                },
            ),
        )

        # Fetch full DB records for matched embedding IDs
        embedding_ids = [str(r.id) for r in results]
        scores = {str(r.id): r.score for r in results}

        if not embedding_ids:
            return []

        stmt = select(Memory).where(
            Memory.user_id == user_id,
            Memory.embedding_id.in_(embedding_ids),
        )
        db_result = await self._db.execute(stmt)
        memories = db_result.scalars().all()

        # Update access stats
        for mem in memories:
            mem.last_accessed = datetime.now(timezone.utc)
            mem.access_count += 1

        return [
            {
                "memory": m,
                "score": scores.get(m.embedding_id, 0.0),
            }
            for m in sorted(memories, key=lambda x: scores.get(x.embedding_id, 0), reverse=True)
        ]

    # ── Stats ─────────────────────────────────────────────────────────────────

    async def get_stats(self, user_id: int) -> Dict[str, Any]:
        from sqlalchemy import func
        result = await self._db.execute(
            select(Memory.memory_type, func.count(Memory.id))
            .where(Memory.user_id == user_id)
            .group_by(Memory.memory_type)
        )
        type_counts = {row[0]: row[1] for row in result.all()}
        total = sum(type_counts.values())
        return {"total": total, "by_type": type_counts}

    # ── Auto-extract memories from text ──────────────────────────────────────

    async def extract_and_store(self, user_id: int, text: str) -> List[Memory]:
        """Heuristic extraction – in production, use an LLM extraction step."""
        memories: List[Memory] = []
        sentences = [s.strip() for s in text.split(".") if len(s.strip()) > 20]
        for sentence in sentences[:5]:  # cap at 5 per message
            try:
                mem = await self.create(
                    user_id=user_id,
                    content=sentence,
                    memory_type="fact",
                    importance_score=0.3,
                )
                memories.append(mem)
            except Exception as exc:
                logger.warning("memory_extract_failed", error=str(exc))
        return memories
