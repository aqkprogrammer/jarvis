"""
Wake word detection for JARVIS.
Supports Picovoice Porcupine and OpenWakeWord backends.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger(__name__)


class WakeWordBackend(str, Enum):
    PORCUPINE = "porcupine"
    OPENWAKEWORD = "openwakeword"


@dataclass
class WakeWordConfig:
    backend: WakeWordBackend = WakeWordBackend.OPENWAKEWORD
    wake_words: list[str] = field(default_factory=lambda: ["hey jarvis", "jarvis"])
    sensitivity: float = 0.5          # 0.0 – 1.0
    access_key: Optional[str] = None  # Picovoice access key
    model_paths: Optional[list[str]] = None  # custom .ppn or .tflite files
    sample_rate: int = 16000
    frame_length: int = 512
    audio_device_index: Optional[int] = None


@dataclass
class DetectionEvent:
    wake_word: str
    timestamp: float
    confidence: float = 1.0
    backend: str = ""


class WakeWordDetector:
    """
    Continuously listens for configured wake words in a background thread.
    Calls registered callbacks when a wake word is detected.
    """

    def __init__(self, config: Optional[WakeWordConfig] = None) -> None:
        self.config = config or WakeWordConfig()
        self._callbacks: list[Callable[[DetectionEvent], None]] = []
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._last_detection: Optional[DetectionEvent] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def add_callback(self, fn: Callable[[DetectionEvent], None]) -> None:
        """Register a callable to invoke on each detection."""
        self._callbacks.append(fn)

    def remove_callback(self, fn: Callable[[DetectionEvent], None]) -> None:
        self._callbacks = [c for c in self._callbacks if c is not fn]

    def start(self) -> None:
        """Start background listening thread."""
        if self._running:
            return
        self._stop_event.clear()
        self._running = True
        self._thread = threading.Thread(target=self._listen_loop, daemon=True, name="wake-word-detector")
        self._thread.start()
        logger.info("Wake word detector started (backend=%s)", self.config.backend)

    def stop(self) -> None:
        """Signal the listening thread to stop and wait for it."""
        if not self._running:
            return
        self._stop_event.set()
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("Wake word detector stopped")

    @property
    def is_running(self) -> bool:
        return self._running

    def update_sensitivity(self, sensitivity: float) -> None:
        """Adjust detection sensitivity (0.0–1.0) at runtime."""
        self.config.sensitivity = max(0.0, min(1.0, sensitivity))

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _notify(self, event: DetectionEvent) -> None:
        self._last_detection = event
        for cb in self._callbacks:
            try:
                cb(event)
            except Exception as exc:
                logger.error("Wake word callback error: %s", exc)

    def _listen_loop(self) -> None:
        backend = self.config.backend
        try:
            if backend == WakeWordBackend.PORCUPINE:
                self._porcupine_loop()
            else:
                self._openwakeword_loop()
        except Exception as exc:
            logger.error("Wake word detector loop crashed: %s", exc, exc_info=True)
            self._running = False

    # ------------------------------------------------------------------
    # Porcupine backend
    # ------------------------------------------------------------------

    def _porcupine_loop(self) -> None:
        try:
            import pvporcupine  # type: ignore
            import pyaudio  # type: ignore
        except ImportError as exc:
            raise RuntimeError(
                "pvporcupine and pyaudio are required for Porcupine backend.\n"
                "  pip install pvporcupine pyaudio"
            ) from exc

        if not self.config.access_key:
            raise ValueError("Picovoice access_key is required for Porcupine backend")

        keywords = self.config.wake_words
        sensitivities = [self.config.sensitivity] * len(keywords)

        porcupine = pvporcupine.create(
            access_key=self.config.access_key,
            keywords=keywords,
            sensitivities=sensitivities,
        )

        pa = pyaudio.PyAudio()
        stream = pa.open(
            rate=porcupine.sample_rate,
            channels=1,
            format=pyaudio.paInt16,
            input=True,
            frames_per_buffer=porcupine.frame_length,
            input_device_index=self.config.audio_device_index,
        )

        logger.info("Porcupine listening for: %s", keywords)
        try:
            while not self._stop_event.is_set():
                pcm_bytes = stream.read(porcupine.frame_length, exception_on_overflow=False)
                import struct

                pcm = struct.unpack_from(f"{porcupine.frame_length}h", pcm_bytes)
                keyword_index = porcupine.process(pcm)
                if keyword_index >= 0:
                    detected_word = keywords[keyword_index]
                    event = DetectionEvent(
                        wake_word=detected_word,
                        timestamp=time.time(),
                        backend=WakeWordBackend.PORCUPINE,
                    )
                    logger.info("Wake word detected: '%s'", detected_word)
                    self._notify(event)
        finally:
            stream.close()
            pa.terminate()
            porcupine.delete()

    # ------------------------------------------------------------------
    # OpenWakeWord backend
    # ------------------------------------------------------------------

    def _openwakeword_loop(self) -> None:
        try:
            import openwakeword  # type: ignore
            from openwakeword.model import Model  # type: ignore
            import numpy as np  # type: ignore
            import pyaudio  # type: ignore
        except ImportError as exc:
            raise RuntimeError(
                "openwakeword, numpy, and pyaudio are required.\n"
                "  pip install openwakeword numpy pyaudio"
            ) from exc

        openwakeword.utils.download_models()
        if self.config.model_paths:
            oww_model = Model(wakeword_models=self.config.model_paths, inference_framework="tflite")
        else:
            oww_model = Model(inference_framework="tflite")

        pa = pyaudio.PyAudio()
        stream = pa.open(
            rate=self.config.sample_rate,
            channels=1,
            format=pyaudio.paInt16,
            input=True,
            frames_per_buffer=self.config.frame_length,
            input_device_index=self.config.audio_device_index,
        )

        cooldown_seconds = 2.0
        last_trigger_time: dict[str, float] = {}

        logger.info("OpenWakeWord listening for wake words")
        try:
            while not self._stop_event.is_set():
                pcm_bytes = stream.read(self.config.frame_length, exception_on_overflow=False)
                pcm = np.frombuffer(pcm_bytes, dtype=np.int16)
                prediction = oww_model.predict(pcm)

                for model_name, score in prediction.items():
                    if score >= self.config.sensitivity:
                        now = time.time()
                        if now - last_trigger_time.get(model_name, 0) >= cooldown_seconds:
                            last_trigger_time[model_name] = now
                            event = DetectionEvent(
                                wake_word=model_name,
                                timestamp=now,
                                confidence=float(score),
                                backend=WakeWordBackend.OPENWAKEWORD,
                            )
                            logger.info("Wake word detected: '%s' (score=%.3f)", model_name, score)
                            self._notify(event)
        finally:
            stream.close()
            pa.terminate()

    # ------------------------------------------------------------------
    # Async convenience
    # ------------------------------------------------------------------

    async def wait_for_wake_word(self, timeout: Optional[float] = None) -> Optional[DetectionEvent]:
        """Async helper: wait until the next wake word detection."""
        loop = asyncio.get_event_loop()
        future: asyncio.Future[DetectionEvent] = loop.create_future()

        def _cb(event: DetectionEvent) -> None:
            if not future.done():
                loop.call_soon_threadsafe(future.set_result, event)

        self.add_callback(_cb)
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            return None
        finally:
            self.remove_callback(_cb)
