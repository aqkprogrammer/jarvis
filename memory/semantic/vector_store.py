from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class VectorStore(ABC):
    """Abstract base class for vector stores."""

    @abstractmethod
    async def upsert(
        self,
        id: str,
        text: str,
        metadata: Optional[Dict[str, Any]] = None,
        vector: Optional[List[float]] = None,
    ) -> None: ...

    @abstractmethod
    async def search(
        self,
        query: str,
        limit: int = 5,
        filters: Optional[Dict[str, Any]] = None,
        query_vector: Optional[List[float]] = None,
    ) -> List[Dict[str, Any]]: ...

    @abstractmethod
    async def delete(self, id: str) -> None: ...

    @abstractmethod
    async def get(self, id: str) -> Optional[Dict[str, Any]]: ...

    @abstractmethod
    async def batch_upsert(
        self, items: List[Dict[str, Any]]
    ) -> None: ...


# ------------------------------------------------------------------
# Embedding helper
# ------------------------------------------------------------------

class EmbeddingProvider:
    """Generates dense embeddings via sentence-transformers."""

    _model: Any = None
    _model_name: str = "all-MiniLM-L6-v2"

    @classmethod
    def get_model(cls) -> Any:
        if cls._model is None:
            try:
                from sentence_transformers import SentenceTransformer
                cls._model = SentenceTransformer(cls._model_name)
                logger.info("Loaded embedding model: %s", cls._model_name)
            except ImportError:
                raise RuntimeError(
                    "sentence-transformers is required. Install with: pip install sentence-transformers"
                )
        return cls._model

    @classmethod
    def embed(cls, texts: List[str]) -> List[List[float]]:
        model = cls.get_model()
        vectors = model.encode(texts, convert_to_numpy=True)
        return [v.tolist() for v in vectors]

    @classmethod
    def embed_one(cls, text: str) -> List[float]:
        return cls.embed([text])[0]


# ------------------------------------------------------------------
# Qdrant implementation
# ------------------------------------------------------------------

class QdrantStore(VectorStore):
    """Qdrant vector store implementation."""

    VECTOR_SIZE = 384  # all-MiniLM-L6-v2 output dim

    def __init__(
        self,
        collection: str = "jarvis_memory",
        host: str = "localhost",
        port: int = 6333,
        api_key: Optional[str] = None,
        url: Optional[str] = None,
    ) -> None:
        self._collection = collection
        self._host = host
        self._port = port
        self._api_key = api_key
        self._url = url
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            try:
                from qdrant_client import QdrantClient
                from qdrant_client.models import Distance, VectorParams
            except ImportError:
                raise RuntimeError("qdrant-client is required. pip install qdrant-client")

            if self._url:
                self._client = QdrantClient(url=self._url, api_key=self._api_key)
            else:
                self._client = QdrantClient(host=self._host, port=self._port)

            # Ensure collection exists
            from qdrant_client.models import Distance, VectorParams
            existing = [c.name for c in self._client.get_collections().collections]
            if self._collection not in existing:
                self._client.create_collection(
                    collection_name=self._collection,
                    vectors_config=VectorParams(size=self.VECTOR_SIZE, distance=Distance.COSINE),
                )
                logger.info("Created Qdrant collection: %s", self._collection)
        return self._client

    async def upsert(
        self,
        id: str,
        text: str,
        metadata: Optional[Dict[str, Any]] = None,
        vector: Optional[List[float]] = None,
    ) -> None:
        from qdrant_client.models import PointStruct
        client = self._get_client()
        vec = vector or EmbeddingProvider.embed_one(text)
        payload = {"text": text, **(metadata or {})}
        client.upsert(
            collection_name=self._collection,
            points=[PointStruct(id=self._str_to_int_id(id), vector=vec, payload=payload)],
        )

    async def search(
        self,
        query: str,
        limit: int = 5,
        filters: Optional[Dict[str, Any]] = None,
        query_vector: Optional[List[float]] = None,
    ) -> List[Dict[str, Any]]:
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        client = self._get_client()
        vec = query_vector or EmbeddingProvider.embed_one(query)

        qdrant_filter = None
        if filters:
            conditions = [
                FieldCondition(key=k, match=MatchValue(value=v))
                for k, v in filters.items()
            ]
            qdrant_filter = Filter(must=conditions)

        results = client.search(
            collection_name=self._collection,
            query_vector=vec,
            limit=limit,
            query_filter=qdrant_filter,
            with_payload=True,
        )
        return [
            {"id": str(r.id), "score": r.score, **r.payload}
            for r in results
        ]

    async def delete(self, id: str) -> None:
        from qdrant_client.models import PointIdsList
        client = self._get_client()
        client.delete(
            collection_name=self._collection,
            points_selector=PointIdsList(points=[self._str_to_int_id(id)]),
        )

    async def get(self, id: str) -> Optional[Dict[str, Any]]:
        client = self._get_client()
        results = client.retrieve(
            collection_name=self._collection,
            ids=[self._str_to_int_id(id)],
            with_payload=True,
        )
        if results:
            r = results[0]
            return {"id": str(r.id), **r.payload}
        return None

    async def batch_upsert(self, items: List[Dict[str, Any]]) -> None:
        from qdrant_client.models import PointStruct
        client = self._get_client()
        texts = [item["text"] for item in items]
        vectors = EmbeddingProvider.embed(texts)
        points = [
            PointStruct(
                id=self._str_to_int_id(item["id"]),
                vector=vectors[i],
                payload={"text": item["text"], **item.get("metadata", {})},
            )
            for i, item in enumerate(items)
        ]
        client.upsert(collection_name=self._collection, points=points)

    @staticmethod
    def _str_to_int_id(s: str) -> int:
        """Convert string ID to integer (Qdrant requires numeric IDs)."""
        import hashlib
        return int(hashlib.md5(s.encode()).hexdigest()[:15], 16)


# ------------------------------------------------------------------
# Chroma implementation
# ------------------------------------------------------------------

class ChromaStore(VectorStore):
    """ChromaDB vector store implementation."""

    def __init__(
        self,
        collection: str = "jarvis_memory",
        persist_directory: Optional[str] = None,
        host: Optional[str] = None,
        port: int = 8000,
    ) -> None:
        self._collection_name = collection
        self._persist_dir = persist_directory
        self._host = host
        self._port = port
        self._client: Any = None
        self._collection: Any = None

    def _get_collection(self) -> Any:
        if self._collection is not None:
            return self._collection
        try:
            import chromadb
        except ImportError:
            raise RuntimeError("chromadb is required. pip install chromadb")

        if self._host:
            self._client = chromadb.HttpClient(host=self._host, port=self._port)
        elif self._persist_dir:
            self._client = chromadb.PersistentClient(path=self._persist_dir)
        else:
            self._client = chromadb.Client()

        self._collection = self._client.get_or_create_collection(
            name=self._collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info("Connected to Chroma collection: %s", self._collection_name)
        return self._collection

    async def upsert(
        self,
        id: str,
        text: str,
        metadata: Optional[Dict[str, Any]] = None,
        vector: Optional[List[float]] = None,
    ) -> None:
        col = self._get_collection()
        vec = vector or EmbeddingProvider.embed_one(text)
        col.upsert(
            ids=[id],
            documents=[text],
            embeddings=[vec],
            metadatas=[metadata or {}],
        )

    async def search(
        self,
        query: str,
        limit: int = 5,
        filters: Optional[Dict[str, Any]] = None,
        query_vector: Optional[List[float]] = None,
    ) -> List[Dict[str, Any]]:
        col = self._get_collection()
        vec = query_vector or EmbeddingProvider.embed_one(query)
        where = filters if filters else None
        results = col.query(
            query_embeddings=[vec],
            n_results=limit,
            where=where,
            include=["documents", "metadatas", "distances"],
        )
        output = []
        for i, doc_id in enumerate(results["ids"][0]):
            output.append({
                "id": doc_id,
                "text": results["documents"][0][i],
                "score": 1.0 - results["distances"][0][i],
                **(results["metadatas"][0][i] or {}),
            })
        return output

    async def delete(self, id: str) -> None:
        col = self._get_collection()
        col.delete(ids=[id])

    async def get(self, id: str) -> Optional[Dict[str, Any]]:
        col = self._get_collection()
        result = col.get(ids=[id], include=["documents", "metadatas"])
        if result["ids"]:
            return {
                "id": result["ids"][0],
                "text": result["documents"][0],
                **(result["metadatas"][0] or {}),
            }
        return None

    async def batch_upsert(self, items: List[Dict[str, Any]]) -> None:
        col = self._get_collection()
        ids = [item["id"] for item in items]
        texts = [item["text"] for item in items]
        metadatas = [item.get("metadata", {}) for item in items]
        vectors = EmbeddingProvider.embed(texts)
        col.upsert(
            ids=ids,
            documents=texts,
            embeddings=vectors,
            metadatas=metadatas,
        )
