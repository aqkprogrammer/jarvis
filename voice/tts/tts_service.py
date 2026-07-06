"""
Text-to-Speech service for JARVIS.
Supports ElevenLabs, OpenAI TTS, and Piper (offline).
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import subprocess
import tempfile
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import AsyncIterator, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enums / options
# ---------------------------------------------------------------------------


class AudioFormat(str, Enum):
    MP3 = "mp3"
    WAV = "wav"
    OPUS = "opus"
    FLAC = "flac"
    PCM = "pcm"


@dataclass
class SynthesisOptions:
    voice_id: str = "default"
    speed: float = 1.0          # 0.25 – 4.0
    pitch: float = 0.0          # semitones, provider-dependent
    format: AudioFormat = AudioFormat.MP3
    sample_rate: int = 22050
    ssml: bool = False          # treat text as SSML if True
    stability: float = 0.5      # ElevenLabs-specific
    similarity_boost: float = 0.75  # ElevenLabs-specific
    language: Optional[str] = None


# ---------------------------------------------------------------------------
# Simple disk cache
# ---------------------------------------------------------------------------


class _AudioCache:
    def __init__(self, cache_dir: Optional[Path] = None, max_entries: int = 500) -> None:
        self.cache_dir = cache_dir or Path(tempfile.gettempdir()) / "jarvis_tts_cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.max_entries = max_entries

    def _key(self, text: str, options: SynthesisOptions) -> str:
        digest = hashlib.sha256(
            f"{text}|{options.voice_id}|{options.speed}|{options.pitch}|{options.format}".encode()
        ).hexdigest()
        return digest

    def get(self, text: str, options: SynthesisOptions) -> Optional[bytes]:
        path = self.cache_dir / (self._key(text, options) + f".{options.format.value}")
        if path.exists():
            return path.read_bytes()
        return None

    def put(self, text: str, options: SynthesisOptions, data: bytes) -> None:
        key = self._key(text, options)
        path = self.cache_dir / (key + f".{options.format.value}")
        path.write_bytes(data)
        self._evict_if_needed()

    def _evict_if_needed(self) -> None:
        entries = sorted(self.cache_dir.iterdir(), key=lambda p: p.stat().st_mtime)
        while len(entries) > self.max_entries:
            entries.pop(0).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------


class TTSProvider(ABC):
    """Abstract base class for TTS providers."""

    name: str = "base"

    @abstractmethod
    async def synthesize(self, text: str, options: SynthesisOptions) -> bytes:
        """Return complete audio as bytes."""

    @abstractmethod
    async def synthesize_stream(
        self, text: str, options: SynthesisOptions
    ) -> AsyncIterator[bytes]:
        """Yield audio chunks as they become available."""

    async def list_voices(self) -> list[dict]:
        """Return available voices as a list of dicts."""
        return []

    async def is_available(self) -> bool:
        return True


# ---------------------------------------------------------------------------
# ElevenLabs
# ---------------------------------------------------------------------------


class ElevenLabsProvider(TTSProvider):
    """High-quality TTS via ElevenLabs API."""

    name = "elevenlabs"
    _BASE_URL = "https://api.elevenlabs.io/v1"

    _FORMAT_MAP = {
        AudioFormat.MP3: "mp3_44100_128",
        AudioFormat.OPUS: "opus_48000_32",
        AudioFormat.PCM: "pcm_22050",
    }

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def _headers(self) -> dict:
        return {"xi-api-key": self.api_key, "Content-Type": "application/json"}

    async def synthesize(self, text: str, options: SynthesisOptions) -> bytes:
        import aiohttp  # type: ignore

        voice_id = options.voice_id if options.voice_id != "default" else "21m00Tcm4TlvDq8ikWAM"
        output_format = self._FORMAT_MAP.get(options.format, "mp3_44100_128")

        payload = {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": options.stability,
                "similarity_boost": options.similarity_boost,
                "speed": options.speed,
            },
        }
        if options.ssml:
            payload["text"] = text  # ElevenLabs handles inline SSML

        url = f"{self._BASE_URL}/text-to-speech/{voice_id}?output_format={output_format}"
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=self._headers()) as resp:
                resp.raise_for_status()
                return await resp.read()

    async def synthesize_stream(
        self, text: str, options: SynthesisOptions
    ) -> AsyncIterator[bytes]:
        import aiohttp  # type: ignore

        voice_id = options.voice_id if options.voice_id != "default" else "21m00Tcm4TlvDq8ikWAM"
        output_format = self._FORMAT_MAP.get(options.format, "mp3_44100_128")

        payload = {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": options.stability,
                "similarity_boost": options.similarity_boost,
                "speed": options.speed,
            },
        }
        url = f"{self._BASE_URL}/text-to-speech/{voice_id}/stream?output_format={output_format}"
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=self._headers()) as resp:
                resp.raise_for_status()
                async for chunk in resp.content.iter_chunked(4096):
                    yield chunk

    async def list_voices(self) -> list[dict]:
        import aiohttp  # type: ignore

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self._BASE_URL}/voices", headers=self._headers()
            ) as resp:
                resp.raise_for_status()
                data = await resp.json()
                return [
                    {
                        "id": v["voice_id"],
                        "name": v["name"],
                        "description": v.get("description", ""),
                        "preview_url": v.get("preview_url", ""),
                        "labels": v.get("labels", {}),
                        "provider": self.name,
                    }
                    for v in data.get("voices", [])
                ]

    async def is_available(self) -> bool:
        return bool(self.api_key)


# ---------------------------------------------------------------------------
# OpenAI TTS
# ---------------------------------------------------------------------------


class OpenAITTSProvider(TTSProvider):
    """TTS via OpenAI's tts-1 / tts-1-hd models."""

    name = "openai-tts"

    _VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
    _FORMAT_MAP = {
        AudioFormat.MP3: "mp3",
        AudioFormat.OPUS: "opus",
        AudioFormat.WAV: "wav",
        AudioFormat.FLAC: "flac",
        AudioFormat.PCM: "pcm",
    }

    def __init__(self, api_key: str, model: str = "tts-1") -> None:
        self.api_key = api_key
        self.model = model
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from openai import AsyncOpenAI  # type: ignore

                self._client = AsyncOpenAI(api_key=self.api_key)
            except ImportError as exc:
                raise RuntimeError("openai package not installed") from exc
        return self._client

    async def synthesize(self, text: str, options: SynthesisOptions) -> bytes:
        client = self._get_client()
        voice = options.voice_id if options.voice_id in self._VOICES else "nova"
        fmt = self._FORMAT_MAP.get(options.format, "mp3")

        response = await client.audio.speech.create(
            model=self.model,
            voice=voice,
            input=text,
            response_format=fmt,
            speed=max(0.25, min(4.0, options.speed)),
        )
        return response.content

    async def synthesize_stream(
        self, text: str, options: SynthesisOptions
    ) -> AsyncIterator[bytes]:
        client = self._get_client()
        voice = options.voice_id if options.voice_id in self._VOICES else "nova"
        fmt = self._FORMAT_MAP.get(options.format, "mp3")

        async with client.audio.speech.with_streaming_response.create(
            model=self.model,
            voice=voice,
            input=text,
            response_format=fmt,
            speed=max(0.25, min(4.0, options.speed)),
        ) as response:
            async for chunk in response.iter_bytes(chunk_size=4096):
                yield chunk

    async def list_voices(self) -> list[dict]:
        return [{"id": v, "name": v.capitalize(), "provider": self.name} for v in self._VOICES]

    async def is_available(self) -> bool:
        return bool(self.api_key)


# ---------------------------------------------------------------------------
# Piper (offline)
# ---------------------------------------------------------------------------


class PiperProvider(TTSProvider):
    """Offline TTS using Piper via subprocess."""

    name = "piper"

    def __init__(
        self,
        piper_bin: str = "piper",
        model_path: Optional[str] = None,
        models_dir: Optional[str] = None,
    ) -> None:
        self.piper_bin = piper_bin
        self.model_path = model_path
        self.models_dir = Path(models_dir) if models_dir else Path.home() / ".local" / "share" / "piper"

    def _build_cmd(self, options: SynthesisOptions) -> list[str]:
        model = self.model_path or str(self.models_dir / f"{options.voice_id}.onnx")
        cmd = [
            self.piper_bin,
            "--model", model,
            "--output-raw",
        ]
        if options.speed != 1.0:
            cmd += ["--length-scale", str(1.0 / options.speed)]
        return cmd

    async def synthesize(self, text: str, options: SynthesisOptions) -> bytes:
        cmd = self._build_cmd(options)
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate(input=text.encode())
        if proc.returncode != 0:
            raise RuntimeError(f"Piper error: {stderr.decode()}")
        return stdout

    async def synthesize_stream(
        self, text: str, options: SynthesisOptions
    ) -> AsyncIterator[bytes]:
        cmd = self._build_cmd(options)
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        proc.stdin.write(text.encode())
        await proc.stdin.drain()
        proc.stdin.close()

        while True:
            chunk = await proc.stdout.read(4096)
            if not chunk:
                break
            yield chunk
        await proc.wait()

    async def list_voices(self) -> list[dict]:
        voices = []
        if self.models_dir.exists():
            for onnx_file in self.models_dir.glob("*.onnx"):
                voices.append({"id": onnx_file.stem, "name": onnx_file.stem, "provider": self.name})
        return voices

    async def is_available(self) -> bool:
        try:
            proc = await asyncio.create_subprocess_exec(
                self.piper_bin, "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()
            return proc.returncode == 0
        except FileNotFoundError:
            return False


# ---------------------------------------------------------------------------
# TTSService — orchestrator with caching
# ---------------------------------------------------------------------------


class TTSService:
    """
    Orchestrates TTS providers with caching and automatic fallback.

    Usage:
        service = TTSService(primary=elevenlabs_provider, cache=True)
        audio_bytes = await service.synthesize("Hello, world!")
    """

    def __init__(
        self,
        primary: TTSProvider,
        fallbacks: Optional[list[TTSProvider]] = None,
        cache: bool = True,
        cache_dir: Optional[Path] = None,
    ) -> None:
        self.primary = primary
        self.fallbacks = fallbacks or []
        self._providers = [primary] + self.fallbacks
        self._cache = _AudioCache(cache_dir) if cache else None

    async def synthesize(
        self,
        text: str,
        options: Optional[SynthesisOptions] = None,
    ) -> bytes:
        options = options or SynthesisOptions()

        if self._cache:
            cached = self._cache.get(text, options)
            if cached:
                logger.debug("TTS cache hit for %d chars", len(text))
                return cached

        last_error: Exception | None = None
        for provider in self._providers:
            try:
                data = await provider.synthesize(text, options)
                if self._cache:
                    self._cache.put(text, options, data)
                return data
            except Exception as exc:
                logger.warning("TTS provider %s failed: %s", provider.name, exc)
                last_error = exc

        raise RuntimeError(f"All TTS providers failed. Last: {last_error}") from last_error

    async def synthesize_stream(
        self,
        text: str,
        options: Optional[SynthesisOptions] = None,
    ) -> AsyncIterator[bytes]:
        options = options or SynthesisOptions()
        # Streaming doesn't use cache — too complex to reassemble consistently
        for provider in self._providers:
            try:
                async for chunk in provider.synthesize_stream(text, options):
                    yield chunk
                return
            except Exception as exc:
                logger.warning("TTS stream provider %s failed: %s", provider.name, exc)
        raise RuntimeError("All TTS streaming providers failed")

    async def list_voices(self) -> list[dict]:
        all_voices = []
        for provider in self._providers:
            try:
                voices = await provider.list_voices()
                all_voices.extend(voices)
            except Exception as exc:
                logger.warning("Could not list voices from %s: %s", provider.name, exc)
        return all_voices
