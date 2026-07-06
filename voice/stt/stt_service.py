"""
Speech-to-Text service for JARVIS.
Supports multiple providers with automatic fallback.
"""

from __future__ import annotations

import asyncio
import io
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncIterator, Callable, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class WordTimestamp:
    word: str
    start: float  # seconds
    end: float  # seconds
    confidence: float = 1.0
    speaker: Optional[str] = None


@dataclass
class TranscriptionResult:
    text: str
    language: str = "en"
    confidence: float = 1.0
    duration: float = 0.0
    words: list[WordTimestamp] = field(default_factory=list)
    speakers: list[str] = field(default_factory=list)
    provider: str = ""
    latency_ms: float = 0.0
    raw_response: Optional[dict] = None


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------


class STTProvider(ABC):
    """Abstract base class for all STT providers."""

    name: str = "base"

    @abstractmethod
    async def transcribe_file(
        self,
        path: str | Path,
        language: Optional[str] = None,
        diarize: bool = False,
    ) -> TranscriptionResult:
        """Transcribe an audio file at *path*."""

    @abstractmethod
    async def transcribe_bytes(
        self,
        data: bytes,
        sample_rate: int = 16000,
        language: Optional[str] = None,
        diarize: bool = False,
    ) -> TranscriptionResult:
        """Transcribe raw audio bytes."""

    @abstractmethod
    async def transcribe_stream(
        self,
        audio_chunks: AsyncIterator[bytes],
        sample_rate: int = 16000,
        language: Optional[str] = None,
    ) -> AsyncIterator[TranscriptionResult]:
        """Transcribe a stream of audio chunks, yielding partial results."""

    async def is_available(self) -> bool:
        """Return True if the provider is configured and reachable."""
        return True


# ---------------------------------------------------------------------------
# WhisperProvider (local)
# ---------------------------------------------------------------------------


class WhisperProvider(STTProvider):
    """Local Whisper inference via the openai-whisper package."""

    name = "whisper"

    def __init__(
        self,
        model_size: str = "base",
        device: str = "cpu",
        compute_type: str = "int8",
    ) -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self._model = None

    def _load_model(self):
        if self._model is None:
            try:
                import whisper  # type: ignore

                self._model = whisper.load_model(self.model_size, device=self.device)
                logger.info("Whisper model '%s' loaded on %s", self.model_size, self.device)
            except ImportError as exc:
                raise RuntimeError(
                    "openai-whisper is not installed. Run: pip install openai-whisper"
                ) from exc
        return self._model

    async def transcribe_file(
        self,
        path: str | Path,
        language: Optional[str] = None,
        diarize: bool = False,
    ) -> TranscriptionResult:
        t0 = time.perf_counter()
        model = await asyncio.get_event_loop().run_in_executor(None, self._load_model)
        options = {"task": "transcribe"}
        if language:
            options["language"] = language

        result = await asyncio.get_event_loop().run_in_executor(
            None, lambda: model.transcribe(str(path), **options, word_timestamps=True)
        )
        latency = (time.perf_counter() - t0) * 1000

        words = []
        for seg in result.get("segments", []):
            for w in seg.get("words", []):
                words.append(
                    WordTimestamp(
                        word=w["word"],
                        start=w["start"],
                        end=w["end"],
                        confidence=w.get("probability", 1.0),
                    )
                )

        return TranscriptionResult(
            text=result["text"].strip(),
            language=result.get("language", language or "en"),
            confidence=1.0,
            duration=result["segments"][-1]["end"] if result.get("segments") else 0.0,
            words=words,
            provider=self.name,
            latency_ms=latency,
            raw_response=result,
        )

    async def transcribe_bytes(
        self,
        data: bytes,
        sample_rate: int = 16000,
        language: Optional[str] = None,
        diarize: bool = False,
    ) -> TranscriptionResult:
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        try:
            return await self.transcribe_file(tmp_path, language=language, diarize=diarize)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    async def transcribe_stream(
        self,
        audio_chunks: AsyncIterator[bytes],
        sample_rate: int = 16000,
        language: Optional[str] = None,
    ) -> AsyncIterator[TranscriptionResult]:
        # Buffer all chunks then transcribe once (Whisper is not streaming-native)
        buffer = bytearray()
        async for chunk in audio_chunks:
            buffer.extend(chunk)
        result = await self.transcribe_bytes(bytes(buffer), sample_rate=sample_rate, language=language)
        yield result

    async def is_available(self) -> bool:
        try:
            import whisper  # noqa: F401

            return True
        except ImportError:
            return False


# ---------------------------------------------------------------------------
# GroqWhisperProvider
# ---------------------------------------------------------------------------


class GroqWhisperProvider(STTProvider):
    """Fast cloud STT via Groq's Whisper endpoint."""

    name = "groq-whisper"

    def __init__(self, api_key: str, model: str = "whisper-large-v3") -> None:
        self.api_key = api_key
        self.model = model
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from groq import AsyncGroq  # type: ignore

                self._client = AsyncGroq(api_key=self.api_key)
            except ImportError as exc:
                raise RuntimeError("groq package not installed. Run: pip install groq") from exc
        return self._client

    async def transcribe_file(
        self,
        path: str | Path,
        language: Optional[str] = None,
        diarize: bool = False,
    ) -> TranscriptionResult:
        t0 = time.perf_counter()
        client = self._get_client()
        with open(path, "rb") as f:
            audio_data = f.read()
        return await self.transcribe_bytes(audio_data, language=language, diarize=diarize)

    async def transcribe_bytes(
        self,
        data: bytes,
        sample_rate: int = 16000,
        language: Optional[str] = None,
        diarize: bool = False,
    ) -> TranscriptionResult:
        t0 = time.perf_counter()
        client = self._get_client()
        kwargs: dict = {
            "file": ("audio.wav", io.BytesIO(data), "audio/wav"),
            "model": self.model,
            "response_format": "verbose_json",
            "timestamp_granularities": ["word"],
        }
        if language:
            kwargs["language"] = language

        response = await client.audio.transcriptions.create(**kwargs)
        latency = (time.perf_counter() - t0) * 1000

        words = []
        for w in getattr(response, "words", []) or []:
            words.append(
                WordTimestamp(
                    word=w.word,
                    start=w.start,
                    end=w.end,
                )
            )

        return TranscriptionResult(
            text=response.text.strip(),
            language=getattr(response, "language", language or "en"),
            confidence=1.0,
            duration=getattr(response, "duration", 0.0),
            words=words,
            provider=self.name,
            latency_ms=latency,
        )

    async def transcribe_stream(
        self,
        audio_chunks: AsyncIterator[bytes],
        sample_rate: int = 16000,
        language: Optional[str] = None,
    ) -> AsyncIterator[TranscriptionResult]:
        buffer = bytearray()
        async for chunk in audio_chunks:
            buffer.extend(chunk)
        result = await self.transcribe_bytes(bytes(buffer), sample_rate=sample_rate, language=language)
        yield result

    async def is_available(self) -> bool:
        try:
            from groq import AsyncGroq  # noqa: F401

            return bool(self.api_key)
        except ImportError:
            return False


# ---------------------------------------------------------------------------
# AssemblyAIProvider
# ---------------------------------------------------------------------------


class AssemblyAIProvider(STTProvider):
    """Cloud STT via AssemblyAI with diarization support."""

    name = "assemblyai"
    _BASE_URL = "https://api.assemblyai.com/v2"

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def _headers(self) -> dict:
        return {"authorization": self.api_key, "content-type": "application/json"}

    async def _upload(self, data: bytes) -> str:
        import aiohttp  # type: ignore

        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self._BASE_URL}/upload",
                headers={"authorization": self.api_key},
                data=data,
            ) as resp:
                resp.raise_for_status()
                body = await resp.json()
                return body["upload_url"]

    async def _submit_and_poll(self, audio_url: str, language: Optional[str], diarize: bool) -> dict:
        import aiohttp  # type: ignore

        payload: dict = {
            "audio_url": audio_url,
            "word_boost": [],
            "format_text": True,
        }
        if language:
            payload["language_code"] = language
        else:
            payload["language_detection"] = True
        if diarize:
            payload["speaker_labels"] = True

        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self._BASE_URL}/transcript",
                json=payload,
                headers=self._headers(),
            ) as resp:
                resp.raise_for_status()
                body = await resp.json()
                transcript_id = body["id"]

            while True:
                await asyncio.sleep(2)
                async with session.get(
                    f"{self._BASE_URL}/transcript/{transcript_id}",
                    headers=self._headers(),
                ) as resp:
                    resp.raise_for_status()
                    body = await resp.json()
                if body["status"] == "completed":
                    return body
                if body["status"] == "error":
                    raise RuntimeError(f"AssemblyAI error: {body.get('error')}")

    async def transcribe_bytes(
        self,
        data: bytes,
        sample_rate: int = 16000,
        language: Optional[str] = None,
        diarize: bool = False,
    ) -> TranscriptionResult:
        t0 = time.perf_counter()
        upload_url = await self._upload(data)
        body = await self._submit_and_poll(upload_url, language, diarize)
        latency = (time.perf_counter() - t0) * 1000

        words = []
        speakers = set()
        for w in body.get("words", []):
            speaker = w.get("speaker")
            if speaker:
                speakers.add(speaker)
            words.append(
                WordTimestamp(
                    word=w["text"],
                    start=w["start"] / 1000,
                    end=w["end"] / 1000,
                    confidence=w.get("confidence", 1.0),
                    speaker=speaker,
                )
            )

        return TranscriptionResult(
            text=body.get("text", "").strip(),
            language=body.get("language_code", language or "en"),
            confidence=body.get("confidence", 1.0),
            duration=(body.get("audio_duration") or 0),
            words=words,
            speakers=sorted(speakers),
            provider=self.name,
            latency_ms=latency,
            raw_response=body,
        )

    async def transcribe_file(
        self,
        path: str | Path,
        language: Optional[str] = None,
        diarize: bool = False,
    ) -> TranscriptionResult:
        data = Path(path).read_bytes()
        return await self.transcribe_bytes(data, language=language, diarize=diarize)

    async def transcribe_stream(
        self,
        audio_chunks: AsyncIterator[bytes],
        sample_rate: int = 16000,
        language: Optional[str] = None,
    ) -> AsyncIterator[TranscriptionResult]:
        buffer = bytearray()
        async for chunk in audio_chunks:
            buffer.extend(chunk)
        result = await self.transcribe_bytes(bytes(buffer), sample_rate=sample_rate, language=language)
        yield result

    async def is_available(self) -> bool:
        return bool(self.api_key)


# ---------------------------------------------------------------------------
# DeepgramProvider
# ---------------------------------------------------------------------------


class DeepgramProvider(STTProvider):
    """Real-time and batch STT via Deepgram."""

    name = "deepgram"

    def __init__(self, api_key: str, model: str = "nova-2") -> None:
        self.api_key = api_key
        self.model = model

    def _get_client(self):
        try:
            from deepgram import DeepgramClient, PrerecordedOptions  # type: ignore

            return DeepgramClient(self.api_key)
        except ImportError as exc:
            raise RuntimeError("deepgram-sdk not installed. Run: pip install deepgram-sdk") from exc

    async def transcribe_bytes(
        self,
        data: bytes,
        sample_rate: int = 16000,
        language: Optional[str] = None,
        diarize: bool = False,
    ) -> TranscriptionResult:
        from deepgram import DeepgramClient, PrerecordedOptions, BufferSource  # type: ignore

        t0 = time.perf_counter()
        client = DeepgramClient(self.api_key)
        options = PrerecordedOptions(
            model=self.model,
            smart_format=True,
            utterances=True,
            diarize=diarize,
            detect_language=language is None,
            language=language,
            words=True,
            punctuate=True,
        )
        source = BufferSource(buffer=data)
        response = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: client.listen.prerecorded.v("1").transcribe_file(source, options),
        )
        latency = (time.perf_counter() - t0) * 1000

        result_obj = response.results.channels[0].alternatives[0]
        words = []
        speakers = set()
        for w in result_obj.words or []:
            speaker = getattr(w, "speaker", None)
            if speaker is not None:
                speakers.add(str(speaker))
            words.append(
                WordTimestamp(
                    word=w.word,
                    start=w.start,
                    end=w.end,
                    confidence=w.confidence,
                    speaker=str(speaker) if speaker is not None else None,
                )
            )

        detected_lang = (
            response.results.channels[0].detected_language or language or "en"
        )

        return TranscriptionResult(
            text=result_obj.transcript.strip(),
            language=detected_lang,
            confidence=result_obj.confidence,
            words=words,
            speakers=sorted(speakers),
            provider=self.name,
            latency_ms=latency,
        )

    async def transcribe_file(
        self,
        path: str | Path,
        language: Optional[str] = None,
        diarize: bool = False,
    ) -> TranscriptionResult:
        data = Path(path).read_bytes()
        return await self.transcribe_bytes(data, language=language, diarize=diarize)

    async def transcribe_stream(
        self,
        audio_chunks: AsyncIterator[bytes],
        sample_rate: int = 16000,
        language: Optional[str] = None,
    ) -> AsyncIterator[TranscriptionResult]:
        """Stream transcription using Deepgram's live API."""
        try:
            from deepgram import DeepgramClient, LiveOptions, LiveTranscriptionEvents  # type: ignore
        except ImportError as exc:
            raise RuntimeError("deepgram-sdk not installed") from exc

        client = DeepgramClient(self.api_key)
        options = LiveOptions(
            model=self.model,
            language=language or "en",
            smart_format=True,
            interim_results=True,
            utterance_end_ms="1000",
            vad_events=True,
        )

        result_queue: asyncio.Queue[TranscriptionResult] = asyncio.Queue()
        connection = client.listen.asynclive.v("1")

        async def on_message(self_inner, result, **kwargs):
            transcript = result.channel.alternatives[0].transcript
            if transcript:
                await result_queue.put(
                    TranscriptionResult(
                        text=transcript,
                        language=language or "en",
                        provider="deepgram",
                    )
                )

        connection.on(LiveTranscriptionEvents.Transcript, on_message)
        await connection.start(options)

        async def send_chunks():
            async for chunk in audio_chunks:
                await connection.send(chunk)
            await connection.finish()

        asyncio.create_task(send_chunks())

        while True:
            try:
                result = await asyncio.wait_for(result_queue.get(), timeout=10.0)
                yield result
            except asyncio.TimeoutError:
                break

    async def is_available(self) -> bool:
        return bool(self.api_key)


# ---------------------------------------------------------------------------
# STTService — orchestrator with fallback
# ---------------------------------------------------------------------------


class STTService:
    """
    Orchestrates multiple STT providers with automatic fallback.

    Usage:
        service = STTService(primary=groq_provider, fallbacks=[whisper_provider])
        result = await service.transcribe_file("audio.wav")
    """

    def __init__(
        self,
        primary: STTProvider,
        fallbacks: Optional[list[STTProvider]] = None,
        on_transcription: Optional[Callable[[TranscriptionResult], None]] = None,
    ) -> None:
        self.primary = primary
        self.fallbacks = fallbacks or []
        self.on_transcription = on_transcription
        self._providers = [primary] + self.fallbacks

    async def _run_with_fallback(self, method: str, *args, **kwargs) -> TranscriptionResult:
        last_error: Exception | None = None
        for provider in self._providers:
            try:
                fn = getattr(provider, method)
                result = await fn(*args, **kwargs)
                if self.on_transcription:
                    self.on_transcription(result)
                return result
            except Exception as exc:
                logger.warning("Provider %s failed (%s): %s", provider.name, method, exc)
                last_error = exc
        raise RuntimeError(f"All STT providers failed. Last error: {last_error}") from last_error

    async def transcribe_file(
        self,
        path: str | Path,
        language: Optional[str] = None,
        diarize: bool = False,
    ) -> TranscriptionResult:
        return await self._run_with_fallback("transcribe_file", path, language=language, diarize=diarize)

    async def transcribe_bytes(
        self,
        data: bytes,
        sample_rate: int = 16000,
        language: Optional[str] = None,
        diarize: bool = False,
    ) -> TranscriptionResult:
        return await self._run_with_fallback(
            "transcribe_bytes", data, sample_rate=sample_rate, language=language, diarize=diarize
        )

    async def transcribe_stream(
        self,
        audio_chunks: AsyncIterator[bytes],
        sample_rate: int = 16000,
        language: Optional[str] = None,
    ) -> AsyncIterator[TranscriptionResult]:
        """Stream using primary provider; falls back to batch on error."""
        try:
            async for result in self.primary.transcribe_stream(audio_chunks, sample_rate=sample_rate, language=language):
                if self.on_transcription:
                    self.on_transcription(result)
                yield result
        except Exception as exc:
            logger.warning("Primary provider stream failed: %s. Using fallback batch.", exc)
            if self.fallbacks:
                buffer = bytearray()

                async def _drain():
                    async for c in audio_chunks:
                        buffer.extend(c)

                await _drain()
                result = await self.fallbacks[0].transcribe_bytes(bytes(buffer), sample_rate=sample_rate, language=language)
                if self.on_transcription:
                    self.on_transcription(result)
                yield result
