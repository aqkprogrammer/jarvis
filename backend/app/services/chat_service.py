from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, AsyncIterator, Dict, List, Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.workspace import Workspace, WorkspaceMember
from app.services.ai_provider import AIProviderFactory, CompletionResult
from app.services.document_service import search_documents
from app.services.memory_service import MemoryService

logger = get_logger(__name__)

_BASE_SYSTEM_PROMPT = """You are JARVIS, an advanced AI assistant. You are helpful, accurate, and concise.
You have access to the user's long-term memory and can use it to personalise responses.
When you learn important facts about the user, remember them for future conversations."""


class ChatService:
    def __init__(self, db: AsyncSession):
        self._db = db

    # ── Conversation management ───────────────────────────────────────────────

    async def get_or_create_conversation(
        self,
        user_id: int,
        conversation_id: Optional[int] = None,
        title: Optional[str] = None,
    ) -> Conversation:
        if conversation_id:
            result = await self._db.execute(
                select(Conversation).where(
                    Conversation.id == conversation_id,
                    Conversation.user_id == user_id,
                )
            )
            conv = result.scalar_one_or_none()
            if not conv:
                raise ValueError(f"Conversation {conversation_id} not found")
            return conv

        conv = Conversation(user_id=user_id, title=title or "New Conversation")
        self._db.add(conv)
        await self._db.flush()
        return conv

    async def list_conversations(
        self, user_id: int, limit: int = 50, offset: int = 0
    ) -> List[Conversation]:
        """The user's own conversations plus ones shared to their workspaces."""
        member_ws_ids = (
            select(WorkspaceMember.workspace_id)
            .where(WorkspaceMember.user_id == user_id)
            .scalar_subquery()
        )
        owned_ws_ids = (
            select(Workspace.id).where(Workspace.owner_id == user_id).scalar_subquery()
        )
        result = await self._db.execute(
            select(Conversation)
            .where(
                or_(
                    Conversation.user_id == user_id,
                    Conversation.workspace_id.in_(member_ws_ids),
                    Conversation.workspace_id.in_(owned_ws_ids),
                ),
                Conversation.is_archived == False,
            )
            .order_by(Conversation.updated_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_conversation_with_messages(
        self, conversation_id: int, user_id: int
    ) -> Optional[Conversation]:
        result = await self._db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id, Conversation.user_id == user_id
            )
        )
        return result.scalar_one_or_none()

    async def delete_conversation(self, conversation_id: int, user_id: int) -> bool:
        result = await self._db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id, Conversation.user_id == user_id
            )
        )
        conv = result.scalar_one_or_none()
        if not conv:
            return False
        await self._db.delete(conv)
        await self._db.flush()
        return True

    async def clear_messages(self, conversation_id: int, user_id: int) -> bool:
        result = await self._db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id, Conversation.user_id == user_id
            )
        )
        conv = result.scalar_one_or_none()
        if not conv:
            return False
        for msg in conv.messages:
            await self._db.delete(msg)
        await self._db.flush()
        return True

    # ── Prompt building ───────────────────────────────────────────────────────

    async def _build_system_prompt(
        self,
        user_id: int,
        custom_prompt: Optional[str] = None,
        user_query: str = "",
    ) -> str:
        base = custom_prompt or _BASE_SYSTEM_PROMPT
        if not settings.FEATURE_MEMORY_ENABLED:
            return base

        try:
            mem_svc = MemoryService(self._db)
            relevant = await mem_svc.search(user_id, user_query, limit=5)
            if relevant:
                mem_block = "\n".join(
                    f"- [{r['memory'].memory_type}] {r['memory'].content}"
                    for r in relevant
                )
                base += f"\n\n## Relevant memories about this user:\n{mem_block}"
        except Exception as exc:
            logger.warning("memory_fetch_failed", error=str(exc))

        return base

    async def _retrieve_document_context(
        self,
        user_id: int,
        user_query: str,
        document_ids: Optional[List[str]],
    ) -> tuple[List[Dict[str, Any]], Optional[str]]:
        """RAG retrieval: return (results, context_block) for the given documents."""
        if not document_ids:
            return [], None
        try:
            results = await search_documents(
                query=user_query, user_id=user_id, document_ids=document_ids, limit=5
            )
        except Exception as exc:
            logger.warning("document_retrieval_failed", error=str(exc))
            return [], None
        if not results:
            return [], None
        excerpts = "\n\n".join(
            f"[Source: {r['filename']}]\n{r['content']}" for r in results
        )
        context_block = (
            "Relevant document excerpts:\n"
            f"{excerpts}\n\n"
            "When answering from these excerpts, cite the source filename."
        )
        return results, context_block

    @staticmethod
    def _retrieval_trace_step(
        document_ids: Optional[List[str]],
        retrieval_results: List[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        if not document_ids:
            return None
        if retrieval_results:
            detail = "; ".join(
                f"{r['filename']} (score {r['score']:.2f})" for r in retrieval_results
            )
        else:
            detail = "No matching excerpts found in the selected documents"
        return {"type": "retrieval", "label": "Document search", "detail": detail}

    def _messages_to_provider_format(self, messages: List[Message]) -> List[Dict[str, str]]:
        return [{"role": m.role, "content": m.content} for m in messages]

    # ── Save message ──────────────────────────────────────────────────────────

    async def _save_message(
        self,
        conversation_id: int,
        role: str,
        content: str,
        tokens_used: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Message:
        msg = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            tokens_used=tokens_used,
            metadata_=metadata or {},
        )
        self._db.add(msg)
        await self._db.flush()
        return msg

    # ── Chat (non-streaming) ──────────────────────────────────────────────────

    async def chat(
        self,
        user_id: int,
        user_message: str,
        conversation_id: Optional[int] = None,
        provider_name: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = settings.DEFAULT_MAX_TOKENS,
        temperature: float = settings.DEFAULT_TEMPERATURE,
        system_prompt: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
        document_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        provider = AIProviderFactory.get(provider_name)
        conv = await self.get_or_create_conversation(user_id, conversation_id)

        # Persist user message
        await self._save_message(conv.id, "user", user_message)

        history = self._messages_to_provider_format(conv.messages[:-1])  # exclude the just-saved
        history.append({"role": "user", "content": user_message})

        system = await self._build_system_prompt(user_id, system_prompt, user_message)

        # RAG: retrieve relevant chunks from the selected documents
        retrieval_results, doc_context = await self._retrieve_document_context(
            user_id, user_message, document_ids
        )
        if doc_context:
            system = f"{system}\n\n{doc_context}"

        result: CompletionResult = await provider.complete(
            messages=history,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system,
            tools=tools,
        )

        # Reasoning trace (agent-generated messages can append richer steps later)
        trace_steps: List[Dict[str, Any]] = []
        retrieval_step = self._retrieval_trace_step(document_ids, retrieval_results)
        if retrieval_step:
            trace_steps.append(retrieval_step)
        trace_steps.append(
            {
                "type": "thinking",
                "label": "Model",
                "detail": f"{result.model} via {provider.name}",
            }
        )
        trace_steps.append(
            {
                "type": "thinking",
                "label": "Token usage",
                "detail": (
                    f"input={result.input_tokens}, output={result.output_tokens}, "
                    f"total={result.total_tokens}"
                ),
            }
        )

        # Persist assistant reply
        assistant_msg = await self._save_message(
            conv.id,
            "assistant",
            result.content,
            tokens_used=result.total_tokens,
            metadata={
                "model": result.model,
                "provider": provider.name,
                "steps": trace_steps,
            },
        )

        # Auto-title conversation
        if not conv.title or conv.title == "New Conversation":
            conv.title = user_message[:80]

        conv.updated_at = datetime.now(timezone.utc)

        # Background memory extraction (best-effort)
        if settings.FEATURE_MEMORY_ENABLED:
            try:
                mem_svc = MemoryService(self._db)
                await mem_svc.extract_and_store(user_id, result.content)
            except Exception as exc:
                logger.warning("memory_store_failed", error=str(exc))

        return {
            "message": assistant_msg,
            "usage": {
                "input_tokens": result.input_tokens,
                "output_tokens": result.output_tokens,
                "total_tokens": result.total_tokens,
            },
            "model": result.model,
            "provider": provider.name,
            "conversation_id": conv.id,
        }

    # ── Streaming chat ────────────────────────────────────────────────────────

    async def stream_chat(
        self,
        user_id: int,
        user_message: str,
        conversation_id: Optional[int] = None,
        provider_name: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = settings.DEFAULT_MAX_TOKENS,
        temperature: float = settings.DEFAULT_TEMPERATURE,
        system_prompt: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
        document_ids: Optional[List[str]] = None,
    ) -> AsyncIterator[Dict[str, Any]]:
        provider = AIProviderFactory.get(provider_name)
        conv = await self.get_or_create_conversation(user_id, conversation_id)
        await self._save_message(conv.id, "user", user_message)

        history = self._messages_to_provider_format(conv.messages[:-1])
        history.append({"role": "user", "content": user_message})
        system = await self._build_system_prompt(user_id, system_prompt, user_message)

        # RAG: retrieve relevant chunks from the selected documents
        retrieval_results, doc_context = await self._retrieve_document_context(
            user_id, user_message, document_ids
        )
        if doc_context:
            system = f"{system}\n\n{doc_context}"

        # Reasoning trace (token counts not available when streaming)
        trace_steps: List[Dict[str, Any]] = []
        retrieval_step = self._retrieval_trace_step(document_ids, retrieval_results)
        if retrieval_step:
            trace_steps.append(retrieval_step)
        trace_steps.append(
            {
                "type": "thinking",
                "label": "Model",
                "detail": f"{model or settings.DEFAULT_MODEL} via {provider.name}",
            }
        )

        full_response: List[str] = []

        async def _generator():
            async for delta in provider.stream(
                messages=history,
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                tools=tools,
            ):
                full_response.append(delta)
                yield {"type": "delta", "delta": delta}

            # After stream finishes, persist and yield done
            full_content = "".join(full_response)
            assistant_msg = await self._save_message(
                conv.id,
                "assistant",
                full_content,
                metadata={
                    "model": model or settings.DEFAULT_MODEL,
                    "provider": provider.name,
                    "steps": trace_steps,
                },
            )

            if not conv.title or conv.title == "New Conversation":
                conv.title = user_message[:80]
            conv.updated_at = datetime.now(timezone.utc)

            yield {
                "type": "done",
                "conversation_id": conv.id,
                "message_id": assistant_msg.id,
                "model": model or settings.DEFAULT_MODEL,
                "provider": provider.name,
            }

        return _generator()
