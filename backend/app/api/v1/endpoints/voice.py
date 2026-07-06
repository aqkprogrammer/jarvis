"""
Voice API endpoints for JARVIS.
Handles STT, TTS, WebSocket streaming, and voice settings.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(tags=["voice"])


# ---------------------------------------------------------------------------
# Dependency stubs — replace with real DI in your app factory
# ---------------------------------------------------------------------------

def get_stt_service():
    """Dependency: returns the application's STTService instance."""
    return None


def get_tts_service():
    """Dependency: returns the application's TTSService instance."""
    return None


def get_current_user():
    """Dependency: returns the authenticated user."""
    from app.core.security import get_current_user as _get_current_user  # type: ignore

    return _get_current_user


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class TranscribeResponse(BaseModel):
    text: str
    language: str
    confidence: float
    duration: float
    words: list[dict] = Field(default_factory=list)
    speakers: list[str] = Field(default_factory=list)
    provider: str
    latency_ms: float


class SynthesizeRequest(BaseModel):
    text: str = Field(..., max_length=5000)
    voice_id: str = "default"
    speed: float = Field(1.0, ge=0.25, le=4.0)
    pitch: float = 0.0
    format: str = "mp3"
    ssml: bool = False
    language: Optional[str] = None


class VoiceSettingsRequest(BaseModel):
    stt_provider: Optional[str] = None
    tts_provider: Optional[str] = None
    default_voice_id: Optional[str] = None
    default_speed: Optional[float] = None
    wake_word_enabled: Optional[bool] = None
    language: Optional[str] = None


class VoiceSettingsResponse(BaseModel):
    stt_provider: str
    tts_provider: str
    default_voice_id: str
    default_speed: float
    wake_word_enabled: bool
    language: str


# ---------------------------------------------------------------------------
# POST /voice/transcribe
# ---------------------------------------------------------------------------


@router.post(
    "/transcribe",
    response_model=TranscribeResponse,
    summary="Transcribe an uploaded audio file",
)
async def transcribe_audio(
    file: UploadFile = File(..., description="Audio file (wav, mp3, ogg, webm, m4a)"),
    language: Optional[str] = Form(None, description="ISO 639-1 language code, e.g. 'en'"),
    diarize: bool = Form(False, description="Enable speaker diarization"),
    stt_service=Depends(get_stt_service),
    user=Depends(get_current_user),
):
    """
    Upload an audio file and receive a transcription.

    - **file**: Audio in any common format (wav, mp3, webm, etc.)
    - **language**: Optional language hint (auto-detected if omitted)
    - **diarize**: Enable speaker diarization (slower, not all providers)
    """
    ALLOWED_TYPES = {
        "audio/wav", "audio/wave", "audio/mpeg", "audio/mp3",
        "audio/ogg", "audio/webm", "audio/mp4", "audio/m4a",
        "audio/x-m4a", "video/webm",
    }
    if file.content_type and file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported media type: {file.content_type}",
        )

    MAX_SIZE = 25 * 1024 * 1024  # 25 MB
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio file exceeds 25 MB limit",
        )

    try:
        result = await stt_service.transcribe_bytes(data, language=language, diarize=diarize)
    except Exception as exc:
        logger.error("Transcription failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcription failed: {exc}",
        )

    return TranscribeResponse(
        text=result.text,
        language=result.language,
        confidence=result.confidence,
        duration=result.duration,
        words=[
            {
                "word": w.word,
                "start": w.start,
                "end": w.end,
                "confidence": w.confidence,
                "speaker": w.speaker,
            }
            for w in result.words
        ],
        speakers=result.speakers,
        provider=result.provider,
        latency_ms=result.latency_ms,
    )


# ---------------------------------------------------------------------------
# POST /voice/synthesize
# ---------------------------------------------------------------------------


@router.post(
    "/synthesize",
    summary="Synthesize speech from text",
    response_class=Response,
)
async def synthesize_speech(
    request: SynthesizeRequest,
    stream: bool = Query(False, description="Return a streaming response"),
    tts_service=Depends(get_tts_service),
    user=Depends(get_current_user),
):
    """
    Convert text to speech.

    Returns audio bytes in the requested format (mp3, wav, opus).
    Set **stream=true** to get a chunked streaming response.
    """
    from voice.tts.tts_service import AudioFormat, SynthesisOptions  # type: ignore

    try:
        fmt = AudioFormat(request.format)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid format '{request.format}'. Choose: mp3, wav, opus, flac",
        )

    options = SynthesisOptions(
        voice_id=request.voice_id,
        speed=request.speed,
        pitch=request.pitch,
        format=fmt,
        ssml=request.ssml,
        language=request.language,
    )

    CONTENT_TYPE_MAP = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "opus": "audio/ogg; codecs=opus",
        "flac": "audio/flac",
        "pcm": "audio/pcm",
    }
    content_type = CONTENT_TYPE_MAP.get(request.format, "audio/mpeg")

    if stream:
        async def _generate():
            async for chunk in tts_service.synthesize_stream(request.text, options):
                yield chunk

        return StreamingResponse(_generate(), media_type=content_type)

    try:
        audio_bytes = await tts_service.synthesize(request.text, options)
    except Exception as exc:
        logger.error("Synthesis failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Synthesis failed: {exc}",
        )

    return Response(
        content=audio_bytes,
        media_type=content_type,
        headers={"Content-Length": str(len(audio_bytes))},
    )


# ---------------------------------------------------------------------------
# GET /voice/voices
# ---------------------------------------------------------------------------


@router.get(
    "/voices",
    summary="List available TTS voices",
)
async def list_voices(
    provider: Optional[str] = Query(None, description="Filter by provider name"),
    tts_service=Depends(get_tts_service),
    user=Depends(get_current_user),
):
    """Return all available TTS voices, optionally filtered by provider."""
    try:
        voices = await tts_service.list_voices()
    except Exception as exc:
        logger.error("Failed to list voices: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    if provider:
        voices = [v for v in voices if v.get("provider", "").lower() == provider.lower()]

    return {"voices": voices, "count": len(voices)}


# ---------------------------------------------------------------------------
# POST /voice/settings
# ---------------------------------------------------------------------------


@router.post(
    "/settings",
    response_model=VoiceSettingsResponse,
    summary="Update voice settings for the current user",
)
async def update_voice_settings(
    settings: VoiceSettingsRequest,
    user=Depends(get_current_user),
):
    """
    Persist voice preferences for the current user.
    Changes take effect on the next request.
    """
    # In a real implementation, persist to the users.preferences JSONB column
    current = {
        "stt_provider": "groq-whisper",
        "tts_provider": "elevenlabs",
        "default_voice_id": "default",
        "default_speed": 1.0,
        "wake_word_enabled": True,
        "language": "en",
    }
    if settings.stt_provider is not None:
        current["stt_provider"] = settings.stt_provider
    if settings.tts_provider is not None:
        current["tts_provider"] = settings.tts_provider
    if settings.default_voice_id is not None:
        current["default_voice_id"] = settings.default_voice_id
    if settings.default_speed is not None:
        current["default_speed"] = settings.default_speed
    if settings.wake_word_enabled is not None:
        current["wake_word_enabled"] = settings.wake_word_enabled
    if settings.language is not None:
        current["language"] = settings.language

    # TODO: await db.execute(update_user_preferences(user.id, current))
    logger.info("Updated voice settings for user %s", getattr(user, "id", "unknown"))
    return VoiceSettingsResponse(**current)


# ---------------------------------------------------------------------------
# WebSocket /ws/voice — bidirectional STT + TTS
# ---------------------------------------------------------------------------


@router.websocket("/ws/voice")
async def websocket_voice(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    diarize: bool = Query(False),
):
    """
    Bidirectional voice WebSocket.

    Client → Server: raw audio bytes (PCM 16-bit 16kHz mono)
    Server → Client: JSON messages with transcriptions and TTS audio

    Message protocol:
      Server sends: {"type": "transcript", "text": "...", "final": true/false, ...}
      Server sends: {"type": "tts_chunk", "data": "<base64>", "format": "mp3"}
      Server sends: {"type": "error", "message": "..."}
      Client sends: binary audio chunks
      Client sends: {"type": "tts_request", "text": "...", "voice_id": "..."}
    """
    await websocket.accept()
    logger.info("Voice WebSocket connected")

    # Dependency resolution for WebSocket context
    stt_service = None
    tts_service = None

    audio_buffer: list[bytes] = []
    silence_threshold = 1024 * 2  # ~0.1s of silence indicator

    import base64

    async def handle_text_message(msg: dict) -> None:
        """Handle JSON control messages from the client."""
        msg_type = msg.get("type")
        if msg_type == "tts_request":
            text = msg.get("text", "")
            if not text:
                return
            from voice.tts.tts_service import SynthesisOptions, AudioFormat  # type: ignore

            options = SynthesisOptions(
                voice_id=msg.get("voice_id", "default"),
                speed=msg.get("speed", 1.0),
                format=AudioFormat.MP3,
            )
            try:
                async for chunk in tts_service.synthesize_stream(text, options):
                    await websocket.send_json(
                        {
                            "type": "tts_chunk",
                            "data": base64.b64encode(chunk).decode(),
                            "format": "mp3",
                        }
                    )
                await websocket.send_json({"type": "tts_done"})
            except Exception as exc:
                await websocket.send_json({"type": "error", "message": str(exc)})

        elif msg_type == "end_utterance":
            # Transcribe buffered audio
            if audio_buffer:
                data = b"".join(audio_buffer)
                audio_buffer.clear()
                try:
                    result = await stt_service.transcribe_bytes(data, language=language, diarize=diarize)
                    await websocket.send_json(
                        {
                            "type": "transcript",
                            "text": result.text,
                            "language": result.language,
                            "confidence": result.confidence,
                            "final": True,
                            "words": [
                                {"word": w.word, "start": w.start, "end": w.end}
                                for w in result.words
                            ],
                            "speakers": result.speakers,
                        }
                    )
                except Exception as exc:
                    await websocket.send_json({"type": "error", "message": str(exc)})

    try:
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break

            if "bytes" in message and message["bytes"]:
                audio_buffer.append(message["bytes"])
                # Auto-flush every 10 MB to prevent OOM
                total = sum(len(c) for c in audio_buffer)
                if total > 10 * 1024 * 1024:
                    logger.warning("Audio buffer overflow; auto-transcribing")
                    data = b"".join(audio_buffer)
                    audio_buffer.clear()
                    try:
                        result = await stt_service.transcribe_bytes(data, language=language)
                        await websocket.send_json(
                            {"type": "transcript", "text": result.text, "final": False}
                        )
                    except Exception as exc:
                        await websocket.send_json({"type": "error", "message": str(exc)})

            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                    await handle_text_message(payload)
                except json.JSONDecodeError:
                    await websocket.send_json({"type": "error", "message": "Invalid JSON"})

    except WebSocketDisconnect:
        logger.info("Voice WebSocket disconnected")
    except Exception as exc:
        logger.error("Voice WebSocket error: %s", exc, exc_info=True)
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        logger.info("Voice WebSocket session ended")
