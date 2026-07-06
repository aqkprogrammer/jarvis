from __future__ import annotations

import base64
import io
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from agents.base.agent_types import AgentResult, AgentTask, AgentTool
from agents.base.base_agent import BaseAgent

logger = logging.getLogger(__name__)

_VISION_SYSTEM = """You are a precise vision analysis assistant. When given an image:
1. Describe what you see in detail.
2. Extract all visible text exactly as-is.
3. Identify UI elements and their layout if applicable.
4. Note any important visual patterns or anomalies.
Be structured and thorough."""


class VisionAgent(BaseAgent):
    """Vision agent: screenshot capture, OCR, image analysis via vision LLM."""

    def __init__(
        self,
        tesseract_cmd: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self._tesseract_cmd = tesseract_cmd
        self._register_tools()

    @property
    def name(self) -> str:
        return "vision"

    @property
    def description(self) -> str:
        return "Screen capture, OCR, image analysis, UI element detection, document reading."

    @property
    def capabilities(self) -> List[str]:
        return ["vision", "screenshot", "ocr", "image", "screen", "document", "text-extraction"]

    # ------------------------------------------------------------------

    def _register_tools(self) -> None:
        defs = [
            ("capture_screen", "Capture the current screen.", self._capture_screen,
             {"monitor": {"type": "integer", "default": 1}}),
            ("capture_region", "Capture a screen region.", self._capture_region,
             {"top": {"type": "integer"}, "left": {"type": "integer"},
              "width": {"type": "integer"}, "height": {"type": "integer"}}),
            ("ocr_image", "Extract text from an image via OCR.", self._ocr_image,
             {"image_b64": {"type": "string"}, "engine": {"type": "string", "default": "auto"}}),
            ("analyze_image", "Analyze image via vision LLM.", self._analyze_image,
             {"image_b64": {"type": "string"}, "prompt": {"type": "string", "default": ""}}),
            ("read_document", "Extract text from a document image/PDF.", self._read_document,
             {"path": {"type": "string"}}),
            ("detect_ui_elements", "Detect UI elements in a screenshot.", self._detect_ui_elements,
             {"image_b64": {"type": "string"}}),
        ]
        for name, desc, fn, schema in defs:
            t = AgentTool(name=name, description=desc, parameters_schema=schema)
            t.set_execute(fn)
            self.register_tool(t)

    # ------------------------------------------------------------------
    # Main execution
    # ------------------------------------------------------------------

    async def execute(self, task: AgentTask) -> AgentResult:
        try:
            action = task.context.get("action", "analyze")
            dispatch = {
                "screenshot": self._do_screenshot,
                "ocr": self._do_ocr,
                "analyze": self._do_analyze,
                "document": self._do_document,
                "ui_detect": self._do_ui_detect,
            }
            handler = dispatch.get(action, self._do_analyze)
            return await handler(task)
        except Exception as exc:
            logger.exception("VisionAgent failed for task %s", task.id)
            return AgentResult(task_id=task.id, success=False, error=str(exc))

    # ------------------------------------------------------------------
    # Action handlers
    # ------------------------------------------------------------------

    async def _do_screenshot(self, task: AgentTask) -> AgentResult:
        monitor = task.context.get("monitor", 1)
        b64 = await self._capture_screen(monitor=monitor)
        return AgentResult(task_id=task.id, success=True, output="Screenshot captured.",
                           artifacts={"screenshot_b64": b64})

    async def _do_ocr(self, task: AgentTask) -> AgentResult:
        image_b64 = task.context.get("image_b64")
        if not image_b64:
            image_b64 = await self._capture_screen()
        text = await self._ocr_image(image_b64=image_b64)
        return AgentResult(task_id=task.id, success=True, output=text)

    async def _do_analyze(self, task: AgentTask) -> AgentResult:
        image_b64 = task.context.get("image_b64")
        if not image_b64:
            image_b64 = await self._capture_screen()
        analysis = await self._analyze_image(image_b64=image_b64, prompt=task.goal)
        return AgentResult(task_id=task.id, success=True, output=analysis,
                           artifacts={"image_b64": image_b64[:50] + "…"})

    async def _do_document(self, task: AgentTask) -> AgentResult:
        path = task.context.get("path", "")
        text = await self._read_document(path=path)
        return AgentResult(task_id=task.id, success=True, output=text,
                           artifacts={"source": path})

    async def _do_ui_detect(self, task: AgentTask) -> AgentResult:
        image_b64 = task.context.get("image_b64")
        if not image_b64:
            image_b64 = await self._capture_screen()
        elements = await self._detect_ui_elements(image_b64=image_b64)
        return AgentResult(task_id=task.id, success=True, output=str(elements),
                           artifacts={"elements": elements})

    # ------------------------------------------------------------------
    # Tool implementations
    # ------------------------------------------------------------------

    async def _capture_screen(self, monitor: int = 1) -> str:
        try:
            import mss
            with mss.mss() as sct:
                monitors = sct.monitors
                idx = min(monitor, len(monitors) - 1)
                shot = sct.grab(monitors[idx])
                from mss.tools import to_png
                png_bytes = to_png(shot.rgb, shot.size)
                return base64.b64encode(png_bytes).decode()
        except ImportError:
            pass
        try:
            import pyautogui
            img = pyautogui.screenshot()
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return base64.b64encode(buf.getvalue()).decode()
        except ImportError:
            raise RuntimeError("Neither mss nor pyautogui is available for screen capture.")

    async def _capture_region(
        self, top: int, left: int, width: int, height: int
    ) -> str:
        try:
            import mss
            with mss.mss() as sct:
                region = {"top": top, "left": left, "width": width, "height": height}
                shot = sct.grab(region)
                from mss.tools import to_png
                png_bytes = to_png(shot.rgb, shot.size)
                return base64.b64encode(png_bytes).decode()
        except ImportError:
            raise RuntimeError("mss is required for region capture.")

    async def _ocr_image(self, image_b64: str, engine: str = "auto") -> str:
        image_bytes = base64.b64decode(image_b64)

        # Try pytesseract
        if engine in ("auto", "tesseract"):
            try:
                import pytesseract
                from PIL import Image
                if self._tesseract_cmd:
                    pytesseract.pytesseract.tesseract_cmd = self._tesseract_cmd
                img = Image.open(io.BytesIO(image_bytes))
                return pytesseract.image_to_string(img)
            except ImportError:
                logger.debug("pytesseract not available, trying EasyOCR.")

        # Try EasyOCR
        if engine in ("auto", "easyocr"):
            try:
                import easyocr
                import numpy as np
                from PIL import Image
                reader = easyocr.Reader(["en"], gpu=False)
                img = Image.open(io.BytesIO(image_bytes))
                result = reader.readtext(np.array(img))
                return "\n".join(text for _, text, _ in result)
            except ImportError:
                logger.debug("easyocr not available.")

        # Fall back to vision LLM
        return await self._analyze_image(
            image_b64=image_b64, prompt="Extract all visible text from this image verbatim."
        )

    async def _analyze_image(self, image_b64: str, prompt: str = "") -> str:
        if self._llm is None:
            raise RuntimeError("No LLM provider configured for image analysis.")
        user_prompt = prompt or "Describe this image in detail."
        return await self._llm.vision_complete(
            image_b64=image_b64,
            prompt=user_prompt,
            system=_VISION_SYSTEM,
        )

    async def _read_document(self, path: str) -> str:
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"Document not found: {path}")

        suffix = p.suffix.lower()
        if suffix == ".pdf":
            try:
                import pdfplumber
                texts = []
                with pdfplumber.open(path) as pdf:
                    for page in pdf.pages:
                        texts.append(page.extract_text() or "")
                return "\n\n".join(texts)
            except ImportError:
                pass
            try:
                import fitz  # PyMuPDF
                doc = fitz.open(path)
                return "\n\n".join(page.get_text() for page in doc)
            except ImportError:
                raise RuntimeError("Install pdfplumber or PyMuPDF for PDF reading.")

        if suffix in (".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"):
            image_bytes = p.read_bytes()
            b64 = base64.b64encode(image_bytes).decode()
            return await self._ocr_image(image_b64=b64)

        # Plain text fallback
        return p.read_text(encoding="utf-8", errors="replace")

    async def _detect_ui_elements(self, image_b64: str) -> List[Dict[str, Any]]:
        prompt = (
            "List all UI elements visible in this screenshot. "
            "For each, provide: type (button/input/text/image/etc), "
            "approximate position (top-left quadrant, top-right, etc), "
            "label or text if visible. "
            "Return as a JSON array."
        )
        raw = await self._analyze_image(image_b64=image_b64, prompt=prompt)
        import json, re
        # Try to extract JSON array
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
        return [{"raw_description": raw}]
