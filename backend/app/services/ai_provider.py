from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, Dict, List, Optional

import tiktoken
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


# ── Data classes ──────────────────────────────────────────────────────────────

class AIMessage:
    def __init__(self, role: str, content: str):
        self.role = role
        self.content = content


class CompletionResult:
    def __init__(self, content: str, model: str, input_tokens: int, output_tokens: int):
        self.content = content
        self.model = model
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.total_tokens = input_tokens + output_tokens


# ── Abstract base ─────────────────────────────────────────────────────────────

class AIProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def complete(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: int = settings.DEFAULT_MAX_TOKENS,
        temperature: float = settings.DEFAULT_TEMPERATURE,
        system: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
    ) -> CompletionResult:
        ...

    @abstractmethod
    async def stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: int = settings.DEFAULT_MAX_TOKENS,
        temperature: float = settings.DEFAULT_TEMPERATURE,
        system: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
    ) -> AsyncIterator[str]:
        ...

    @abstractmethod
    async def embed(self, text: str) -> List[float]:
        ...

    def count_tokens(self, text: str) -> int:
        try:
            enc = tiktoken.get_encoding("cl100k_base")
            return len(enc.encode(text))
        except Exception:
            return len(text) // 4  # rough fallback


# ── Anthropic ─────────────────────────────────────────────────────────────────

class AnthropicProvider(AIProvider):
    name = "anthropic"
    DEFAULT_MODEL = "claude-sonnet-4-6"

    def __init__(self):
        import anthropic
        self._client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    @retry(
        retry=retry_if_exception_type(Exception),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    async def complete(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: int = settings.DEFAULT_MAX_TOKENS,
        temperature: float = settings.DEFAULT_TEMPERATURE,
        system: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
    ) -> CompletionResult:
        kwargs: Dict[str, Any] = dict(
            model=model or self.DEFAULT_MODEL,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=messages,
        )
        if system:
            kwargs["system"] = system
        if tools:
            kwargs["tools"] = tools

        resp = await self._client.messages.create(**kwargs)
        content = resp.content[0].text if resp.content else ""
        return CompletionResult(
            content=content,
            model=resp.model,
            input_tokens=resp.usage.input_tokens,
            output_tokens=resp.usage.output_tokens,
        )

    async def stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: int = settings.DEFAULT_MAX_TOKENS,
        temperature: float = settings.DEFAULT_TEMPERATURE,
        system: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
    ) -> AsyncIterator[str]:
        kwargs: Dict[str, Any] = dict(
            model=model or self.DEFAULT_MODEL,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=messages,
        )
        if system:
            kwargs["system"] = system
        if tools:
            kwargs["tools"] = tools

        async with self._client.messages.stream(**kwargs) as stream_ctx:
            async for text in stream_ctx.text_stream:
                yield text

    async def embed(self, text: str) -> List[float]:
        # Anthropic does not expose embeddings; fall through to sentence-transformers
        raise NotImplementedError("Use a dedicated embedding provider")


# ── OpenAI ────────────────────────────────────────────────────────────────────

class OpenAIProvider(AIProvider):
    name = "openai"
    DEFAULT_MODEL = "gpt-4o"

    def __init__(self):
        from openai import AsyncOpenAI
        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    @retry(
        retry=retry_if_exception_type(Exception),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    async def complete(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: int = settings.DEFAULT_MAX_TOKENS,
        temperature: float = settings.DEFAULT_TEMPERATURE,
        system: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
    ) -> CompletionResult:
        all_messages = []
        if system:
            all_messages.append({"role": "system", "content": system})
        all_messages.extend(messages)

        kwargs: Dict[str, Any] = dict(
            model=model or self.DEFAULT_MODEL,
            messages=all_messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        if tools:
            kwargs["tools"] = tools

        resp = await self._client.chat.completions.create(**kwargs)
        content = resp.choices[0].message.content or ""
        return CompletionResult(
            content=content,
            model=resp.model,
            input_tokens=resp.usage.prompt_tokens,
            output_tokens=resp.usage.completion_tokens,
        )

    async def stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: int = settings.DEFAULT_MAX_TOKENS,
        temperature: float = settings.DEFAULT_TEMPERATURE,
        system: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
    ) -> AsyncIterator[str]:
        all_messages = []
        if system:
            all_messages.append({"role": "system", "content": system})
        all_messages.extend(messages)

        kwargs: Dict[str, Any] = dict(
            model=model or self.DEFAULT_MODEL,
            messages=all_messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        resp = await self._client.chat.completions.create(**kwargs)
        async for chunk in resp:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def embed(self, text: str) -> List[float]:
        resp = await self._client.embeddings.create(
            model="text-embedding-3-small", input=text
        )
        return resp.data[0].embedding


# ── Groq ──────────────────────────────────────────────────────────────────────

class GroqProvider(AIProvider):
    name = "groq"
    DEFAULT_MODEL = "llama3-8b-8192"

    def __init__(self):
        from groq import AsyncGroq
        self._client = AsyncGroq(api_key=settings.GROQ_API_KEY)

    @retry(
        retry=retry_if_exception_type(Exception),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    async def complete(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: int = settings.DEFAULT_MAX_TOKENS,
        temperature: float = settings.DEFAULT_TEMPERATURE,
        system: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
    ) -> CompletionResult:
        all_messages = []
        if system:
            all_messages.append({"role": "system", "content": system})
        all_messages.extend(messages)

        resp = await self._client.chat.completions.create(
            model=model or self.DEFAULT_MODEL,
            messages=all_messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        content = resp.choices[0].message.content or ""
        return CompletionResult(
            content=content,
            model=resp.model,
            input_tokens=resp.usage.prompt_tokens,
            output_tokens=resp.usage.completion_tokens,
        )

    async def stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: int = settings.DEFAULT_MAX_TOKENS,
        temperature: float = settings.DEFAULT_TEMPERATURE,
        system: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
    ) -> AsyncIterator[str]:
        all_messages = []
        if system:
            all_messages.append({"role": "system", "content": system})
        all_messages.extend(messages)

        resp = await self._client.chat.completions.create(
            model=model or self.DEFAULT_MODEL,
            messages=all_messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        async for chunk in resp:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def embed(self, text: str) -> List[float]:
        raise NotImplementedError("Groq does not provide embeddings")


# ── Google ────────────────────────────────────────────────────────────────────

class GoogleProvider(AIProvider):
    name = "google"
    DEFAULT_MODEL = "gemini-2.0-flash"

    def __init__(self):
        import google.generativeai as genai
        genai.configure(api_key=settings.GOOGLE_API_KEY)
        self._genai = genai

    @retry(
        retry=retry_if_exception_type(Exception),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    async def complete(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: int = settings.DEFAULT_MAX_TOKENS,
        temperature: float = settings.DEFAULT_TEMPERATURE,
        system: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
    ) -> CompletionResult:
        model_name = model or self.DEFAULT_MODEL
        genai_model = self._genai.GenerativeModel(model_name)
        prompt = "\n".join(f"{m['role']}: {m['content']}" for m in messages)
        if system:
            prompt = f"System: {system}\n\n{prompt}"
        response = await asyncio.get_event_loop().run_in_executor(
            None, lambda: genai_model.generate_content(prompt)
        )
        text = response.text
        return CompletionResult(
            content=text,
            model=model_name,
            input_tokens=0,
            output_tokens=0,
        )

    async def stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: int = settings.DEFAULT_MAX_TOKENS,
        temperature: float = settings.DEFAULT_TEMPERATURE,
        system: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
    ) -> AsyncIterator[str]:
        # Simple non-streaming fallback for Google
        result = await self.complete(messages, model=model, system=system)
        yield result.content

    async def embed(self, text: str) -> List[float]:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: self._genai.embed_content(model="models/embedding-001", content=text),
        )
        return result["embedding"]


# ── Ollama ────────────────────────────────────────────────────────────────────

class OllamaProvider(AIProvider):
    name = "ollama"
    DEFAULT_MODEL = "llama3"

    def __init__(self):
        import httpx
        self._base = settings.OLLAMA_BASE_URL
        self._http = httpx.AsyncClient(base_url=self._base, timeout=120)

    async def complete(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: int = settings.DEFAULT_MAX_TOKENS,
        temperature: float = settings.DEFAULT_TEMPERATURE,
        system: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
    ) -> CompletionResult:
        payload: Dict[str, Any] = {
            "model": model or self.DEFAULT_MODEL,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        if system:
            payload["system"] = system

        resp = await self._http.post("/api/chat", json=payload)
        resp.raise_for_status()
        data = resp.json()
        content = data.get("message", {}).get("content", "")
        return CompletionResult(
            content=content,
            model=model or self.DEFAULT_MODEL,
            input_tokens=data.get("prompt_eval_count", 0),
            output_tokens=data.get("eval_count", 0),
        )

    async def stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: int = settings.DEFAULT_MAX_TOKENS,
        temperature: float = settings.DEFAULT_TEMPERATURE,
        system: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
    ) -> AsyncIterator[str]:
        import json as _json
        payload: Dict[str, Any] = {
            "model": model or self.DEFAULT_MODEL,
            "messages": messages,
            "stream": True,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        if system:
            payload["system"] = system

        async with self._http.stream("POST", "/api/chat", json=payload) as resp:
            async for line in resp.aiter_lines():
                if line:
                    data = _json.loads(line)
                    delta = data.get("message", {}).get("content", "")
                    if delta:
                        yield delta

    async def embed(self, text: str) -> List[float]:
        resp = await self._http.post(
            "/api/embeddings", json={"model": "nomic-embed-text", "prompt": text}
        )
        resp.raise_for_status()
        return resp.json()["embedding"]


# ── Factory ───────────────────────────────────────────────────────────────────

class AIProviderFactory:
    _registry: Dict[str, type[AIProvider]] = {
        "anthropic": AnthropicProvider,
        "openai": OpenAIProvider,
        "groq": GroqProvider,
        "google": GoogleProvider,
        "ollama": OllamaProvider,
    }
    _instances: Dict[str, AIProvider] = {}

    @classmethod
    def register(cls, name: str, provider_cls: type[AIProvider]) -> None:
        cls._registry[name] = provider_cls

    @classmethod
    def get(cls, name: Optional[str] = None) -> AIProvider:
        provider_name = name or settings.DEFAULT_AI_PROVIDER
        if provider_name not in cls._instances:
            if provider_name not in cls._registry:
                raise ValueError(f"Unknown AI provider: {provider_name}")
            cls._instances[provider_name] = cls._registry[provider_name]()
        return cls._instances[provider_name]

    @classmethod
    def list_providers(cls) -> List[str]:
        return list(cls._registry.keys())
