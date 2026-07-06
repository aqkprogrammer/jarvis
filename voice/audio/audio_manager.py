"""
Audio manager for JARVIS.
Handles microphone selection, capture, VAD, and streaming.
"""

from __future__ import annotations

import asyncio
import logging
import queue
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator, Callable, Optional

import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class MicrophoneInfo:
    index: int
    name: str
    max_input_channels: int
    default_sample_rate: float
    is_default: bool = False


@dataclass
class VADConfig:
    enabled: bool = True
    threshold: float = 0.02          # RMS energy threshold (0.0–1.0)
    speech_pad_ms: int = 300         # padding after speech ends
    silence_timeout_ms: int = 1500   # silence before considering utterance done
    min_speech_ms: int = 200         # ignore bursts shorter than this


class ListenMode(str, Enum):
    CONTINUOUS = "continuous"
    PUSH_TO_TALK = "push_to_talk"
    VAD = "vad"


@dataclass
class AudioConfig:
    sample_rate: int = 16000
    channels: int = 1
    chunk_size: int = 1024            # frames per read
    format_dtype: str = "int16"
    device_index: Optional[int] = None
    listen_mode: ListenMode = ListenMode.VAD
    vad: VADConfig = field(default_factory=VADConfig)
    websocket_stream_url: Optional[str] = None


# ---------------------------------------------------------------------------
# AudioManager
# ---------------------------------------------------------------------------


class AudioManager:
    """
    Manages audio capture from the microphone with VAD and streaming support.
    """

    def __init__(self, config: Optional[AudioConfig] = None) -> None:
        self.config = config or AudioConfig()
        self._stream = None
        self._pa = None
        self._capture_thread: Optional[threading.Thread] = None
        self._running = False
        self._audio_queue: queue.Queue[bytes] = queue.Queue(maxsize=200)
        self._ptt_active = False
        self._speech_callbacks: list[Callable[[bytes], None]] = []

    # ------------------------------------------------------------------
    # Device enumeration
    # ------------------------------------------------------------------

    @staticmethod
    def list_microphones() -> list[MicrophoneInfo]:
        """Return all available input devices."""
        try:
            import pyaudio  # type: ignore
        except ImportError:
            try:
                import sounddevice as sd  # type: ignore

                devices = sd.query_devices()
                result = []
                default_idx = sd.default.device[0]
                for i, d in enumerate(devices):
                    if d["max_input_channels"] > 0:
                        result.append(
                            MicrophoneInfo(
                                index=i,
                                name=d["name"],
                                max_input_channels=d["max_input_channels"],
                                default_sample_rate=d["default_samplerate"],
                                is_default=(i == default_idx),
                            )
                        )
                return result
            except ImportError:
                return []

        pa = pyaudio.PyAudio()
        mics = []
        default_idx = pa.get_default_input_device_info()["index"]
        for i in range(pa.get_device_count()):
            info = pa.get_device_info_by_index(i)
            if info["maxInputChannels"] > 0:
                mics.append(
                    MicrophoneInfo(
                        index=i,
                        name=info["name"],
                        max_input_channels=info["maxInputChannels"],
                        default_sample_rate=info["defaultSampleRate"],
                        is_default=(i == default_idx),
                    )
                )
        pa.terminate()
        return mics

    # ------------------------------------------------------------------
    # Start / stop
    # ------------------------------------------------------------------

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._capture_thread = threading.Thread(
            target=self._capture_loop, daemon=True, name="audio-capture"
        )
        self._capture_thread.start()
        logger.info("AudioManager started (mode=%s)", self.config.listen_mode)

    def stop(self) -> None:
        self._running = False
        if self._capture_thread:
            self._capture_thread.join(timeout=3)
        logger.info("AudioManager stopped")

    # ------------------------------------------------------------------
    # Push-to-talk control
    # ------------------------------------------------------------------

    def push_to_talk_start(self) -> None:
        """Begin recording in PTT mode."""
        self._ptt_active = True

    def push_to_talk_stop(self) -> None:
        """End recording in PTT mode."""
        self._ptt_active = False

    # ------------------------------------------------------------------
    # Callbacks
    # ------------------------------------------------------------------

    def on_speech(self, fn: Callable[[bytes], None]) -> None:
        """Register a callback to receive completed utterances."""
        self._speech_callbacks.append(fn)

    def _emit_speech(self, data: bytes) -> None:
        for cb in self._speech_callbacks:
            try:
                cb(data)
            except Exception as exc:
                logger.error("Speech callback error: %s", exc)

    # ------------------------------------------------------------------
    # Async audio stream
    # ------------------------------------------------------------------

    async def audio_stream(self) -> AsyncIterator[bytes]:
        """Yield raw audio chunks from the microphone queue."""
        loop = asyncio.get_event_loop()
        while self._running:
            try:
                chunk = await loop.run_in_executor(
                    None, lambda: self._audio_queue.get(timeout=0.5)
                )
                yield chunk
            except queue.Empty:
                continue

    # ------------------------------------------------------------------
    # Capture loop (runs in background thread)
    # ------------------------------------------------------------------

    def _capture_loop(self) -> None:
        try:
            import pyaudio  # type: ignore

            DTYPE_MAP = {"int16": pyaudio.paInt16, "float32": pyaudio.paFloat32}
            fmt = DTYPE_MAP.get(self.config.format_dtype, pyaudio.paInt16)
            pa = pyaudio.PyAudio()
            stream = pa.open(
                rate=self.config.sample_rate,
                channels=self.config.channels,
                format=fmt,
                input=True,
                frames_per_buffer=self.config.chunk_size,
                input_device_index=self.config.device_index,
            )
            self._read_and_process(stream, pa)
        except ImportError:
            try:
                import sounddevice as sd  # type: ignore

                self._sounddevice_loop(sd)
            except ImportError:
                logger.error("Neither pyaudio nor sounddevice is installed")
                self._running = False

    def _read_and_process(self, stream, pa) -> None:
        vad = self.config.vad
        speech_buffer: list[bytes] = []
        silence_ms = 0
        speaking = False
        ms_per_chunk = (self.config.chunk_size / self.config.sample_rate) * 1000

        try:
            while self._running:
                raw = stream.read(self.config.chunk_size, exception_on_overflow=False)
                pcm = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
                rms = float(np.sqrt(np.mean(pcm ** 2)))

                mode = self.config.listen_mode
                if mode == ListenMode.CONTINUOUS:
                    self._audio_queue.put_nowait(raw)

                elif mode == ListenMode.PUSH_TO_TALK:
                    if self._ptt_active:
                        speech_buffer.append(raw)
                    elif speech_buffer:
                        self._emit_speech(b"".join(speech_buffer))
                        speech_buffer.clear()

                elif mode == ListenMode.VAD:
                    if not vad.enabled:
                        self._audio_queue.put_nowait(raw)
                        continue

                    is_speech = rms >= vad.threshold

                    if is_speech:
                        silence_ms = 0
                        if not speaking:
                            speaking = True
                            logger.debug("Speech start detected (rms=%.4f)", rms)
                        speech_buffer.append(raw)
                    else:
                        if speaking:
                            silence_ms += ms_per_chunk
                            speech_buffer.append(raw)  # include trailing silence
                            if silence_ms >= vad.silence_timeout_ms:
                                data = b"".join(speech_buffer)
                                min_bytes = int(vad.min_speech_ms / 1000 * self.config.sample_rate * 2)
                                if len(data) >= min_bytes:
                                    self._emit_speech(data)
                                    self._audio_queue.put_nowait(data)
                                speech_buffer.clear()
                                speaking = False
                                silence_ms = 0
                                logger.debug("Speech end detected")
        finally:
            stream.close()
            pa.terminate()

    def _sounddevice_loop(self, sd) -> None:
        import sounddevice as sd  # type: ignore

        def callback(indata, frames, time_info, status):
            if status:
                logger.warning("sounddevice status: %s", status)
            raw = indata.copy().tobytes()
            if not self._audio_queue.full():
                self._audio_queue.put_nowait(raw)

        with sd.InputStream(
            samplerate=self.config.sample_rate,
            channels=self.config.channels,
            dtype=self.config.format_dtype,
            blocksize=self.config.chunk_size,
            device=self.config.device_index,
            callback=callback,
        ):
            while self._running:
                time.sleep(0.1)

    # ------------------------------------------------------------------
    # WebSocket streaming
    # ------------------------------------------------------------------

    async def stream_to_websocket(self, ws_url: str) -> None:
        """Stream microphone audio to a WebSocket endpoint."""
        import aiohttp  # type: ignore

        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(ws_url) as ws:
                logger.info("Streaming audio to %s", ws_url)
                async for chunk in self.audio_stream():
                    await ws.send_bytes(chunk)
                    if ws.closed:
                        break

    # ------------------------------------------------------------------
    # Noise cancellation (basic spectral gating)
    # ------------------------------------------------------------------

    @staticmethod
    def apply_noise_gate(pcm: np.ndarray, threshold_rms: float = 0.01) -> np.ndarray:
        """Zero out frames below the RMS threshold (noise gate)."""
        rms = np.sqrt(np.mean(pcm ** 2))
        if rms < threshold_rms:
            return np.zeros_like(pcm)
        return pcm
