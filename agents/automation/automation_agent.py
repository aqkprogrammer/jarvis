from __future__ import annotations

import asyncio
import logging
import os
import platform
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from agents.base.agent_types import AgentResult, AgentTask, AgentTool
from agents.base.base_agent import BaseAgent

logger = logging.getLogger(__name__)

PLATFORM = platform.system()  # "Darwin", "Linux", "Windows"


class AutomationAgent(BaseAgent):
    """Desktop automation: mouse, keyboard, clipboard, window management, file ops."""

    # Commands blocked for safety
    BLOCKED_COMMANDS = {
        "rm -rf /", "format", "del /f /s /q c:\\", "mkfs",
        ":(){:|:&};:", "sudo rm -rf",
    }

    def __init__(self, safe_mode: bool = True, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._safe_mode = safe_mode
        self._register_tools()

    @property
    def name(self) -> str:
        return "automation"

    @property
    def description(self) -> str:
        return "Desktop automation: mouse, keyboard, clipboard, window, files, system commands."

    @property
    def capabilities(self) -> List[str]:
        return [
            "automate", "click", "type", "keyboard", "mouse",
            "clipboard", "window", "application", "file", "system",
        ]

    # ------------------------------------------------------------------

    def _register_tools(self) -> None:
        defs = [
            ("mouse_move", "Move mouse to coordinates.", self._mouse_move,
             {"x": {"type": "integer"}, "y": {"type": "integer"}}),
            ("mouse_click", "Click at coordinates.", self._mouse_click,
             {"x": {"type": "integer"}, "y": {"type": "integer"},
              "button": {"type": "string", "default": "left"},
              "clicks": {"type": "integer", "default": 1}}),
            ("mouse_drag", "Drag from one position to another.", self._mouse_drag,
             {"from_x": {"type": "integer"}, "from_y": {"type": "integer"},
              "to_x": {"type": "integer"}, "to_y": {"type": "integer"}}),
            ("keyboard_type", "Type a string.", self._keyboard_type,
             {"text": {"type": "string"}, "interval": {"type": "number", "default": 0.0}}),
            ("keyboard_hotkey", "Press a hotkey combination.", self._keyboard_hotkey,
             {"keys": {"type": "array", "items": {"type": "string"}}}),
            ("clipboard_copy", "Copy text to clipboard.", self._clipboard_copy,
             {"text": {"type": "string"}}),
            ("clipboard_paste", "Get clipboard contents.", self._clipboard_paste, {}),
            ("launch_app", "Launch an application.", self._launch_app,
             {"app": {"type": "string"}, "args": {"type": "array", "default": []}}),
            ("run_shell", "Run a shell command.", self._run_shell,
             {"command": {"type": "string"}, "timeout": {"type": "integer", "default": 30}}),
            ("list_windows", "List open application windows.", self._list_windows, {}),
            ("focus_window", "Bring a window to front by title.", self._focus_window,
             {"title": {"type": "string"}}),
            ("file_copy", "Copy a file or directory.", self._file_copy,
             {"src": {"type": "string"}, "dst": {"type": "string"}}),
            ("file_move", "Move a file or directory.", self._file_move,
             {"src": {"type": "string"}, "dst": {"type": "string"}}),
            ("file_delete", "Delete a file (with safety check).", self._file_delete,
             {"path": {"type": "string"}}),
            ("file_read", "Read file content.", self._file_read,
             {"path": {"type": "string"}}),
            ("file_write", "Write content to a file.", self._file_write,
             {"path": {"type": "string"}, "content": {"type": "string"}}),
            ("get_screen_size", "Get screen resolution.", self._get_screen_size, {}),
            ("scroll", "Scroll at position.", self._scroll,
             {"x": {"type": "integer"}, "y": {"type": "integer"},
              "clicks": {"type": "integer", "default": 3},
              "direction": {"type": "string", "default": "down"}}),
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
            steps: List[Dict[str, Any]] = task.context.get("steps", [])
            if steps:
                return await self._execute_steps(task, steps)

            # Single-action shortcut
            action = task.context.get("action", "")
            tool = self.get_tool(action)
            if tool:
                params = {k: v for k, v in task.context.items() if k != "action"}
                result = await tool.execute(**params)
                return AgentResult(task_id=task.id, success=True, output=str(result))

            # LLM-planned automation
            return await self._llm_plan_and_execute(task)
        except Exception as exc:
            logger.exception("AutomationAgent failed for task %s", task.id)
            return AgentResult(task_id=task.id, success=False, error=str(exc))

    async def _execute_steps(
        self, task: AgentTask, steps: List[Dict[str, Any]]
    ) -> AgentResult:
        results = []
        for i, step in enumerate(steps):
            tool_name = step.get("tool")
            params = step.get("params", {})
            tool = self.get_tool(tool_name)
            if tool is None:
                results.append({"step": i, "error": f"Unknown tool: {tool_name}"})
                continue
            try:
                out = await tool.execute(**params)
                results.append({"step": i, "tool": tool_name, "result": str(out)})
                await asyncio.sleep(step.get("delay", 0))
            except Exception as exc:
                results.append({"step": i, "tool": tool_name, "error": str(exc)})
                if step.get("abort_on_error", False):
                    break
        return AgentResult(task_id=task.id, success=True, output=str(results), artifacts={"steps": results})

    async def _llm_plan_and_execute(self, task: AgentTask) -> AgentResult:
        import json
        tools_desc = "\n".join(
            f"- {t.name}: {t.description}" for t in self._tools.values()
        )
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a desktop automation planner. Given a goal, produce a JSON array of steps.\n"
                    f"Available tools:\n{tools_desc}\n\n"
                    "Format: [{\"tool\": \"tool_name\", \"params\": {...}, \"delay\": 0.5}]"
                ),
            },
            {"role": "user", "content": f"Goal: {task.goal}"},
        ]
        raw = await self._llm_chat(messages)
        raw = raw.strip()
        import re
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if not match:
            return AgentResult(task_id=task.id, success=False, error="LLM did not return a valid steps array.")
        steps = json.loads(match.group())
        return await self._execute_steps(task, steps)

    # ------------------------------------------------------------------
    # Safety check
    # ------------------------------------------------------------------

    def _check_safe(self, operation: str, target: str = "") -> None:
        if not self._safe_mode:
            return
        combined = f"{operation} {target}".lower()
        for blocked in self.BLOCKED_COMMANDS:
            if blocked in combined:
                raise PermissionError(f"Blocked dangerous operation: '{blocked}'")

    # ------------------------------------------------------------------
    # Tool implementations
    # ------------------------------------------------------------------

    async def _mouse_move(self, x: int, y: int) -> str:
        import pyautogui
        pyautogui.moveTo(x, y, duration=0.2)
        return f"Mouse moved to ({x}, {y})"

    async def _mouse_click(self, x: int, y: int, button: str = "left", clicks: int = 1) -> str:
        import pyautogui
        pyautogui.click(x, y, button=button, clicks=clicks, interval=0.1)
        return f"Clicked {button} {clicks}x at ({x}, {y})"

    async def _mouse_drag(self, from_x: int, from_y: int, to_x: int, to_y: int) -> str:
        import pyautogui
        pyautogui.drag(from_x, from_y, to_x, to_y, duration=0.5, button="left")
        return f"Dragged from ({from_x},{from_y}) to ({to_x},{to_y})"

    async def _keyboard_type(self, text: str, interval: float = 0.0) -> str:
        import pyautogui
        pyautogui.typewrite(text, interval=interval)
        return f"Typed {len(text)} characters"

    async def _keyboard_hotkey(self, keys: List[str]) -> str:
        import pyautogui
        pyautogui.hotkey(*keys)
        return f"Pressed hotkey: {'+'.join(keys)}"

    async def _clipboard_copy(self, text: str) -> str:
        try:
            import pyperclip
            pyperclip.copy(text)
        except ImportError:
            if PLATFORM == "Darwin":
                proc = subprocess.run(["pbcopy"], input=text.encode(), check=True)
            elif PLATFORM == "Linux":
                proc = subprocess.run(["xclip", "-selection", "clipboard"], input=text.encode(), check=True)
            else:
                raise RuntimeError("pyperclip not installed.")
        return "Copied to clipboard."

    async def _clipboard_paste(self) -> str:
        try:
            import pyperclip
            return pyperclip.paste()
        except ImportError:
            if PLATFORM == "Darwin":
                result = subprocess.run(["pbpaste"], capture_output=True)
                return result.stdout.decode()
            raise RuntimeError("pyperclip not installed.")

    async def _launch_app(self, app: str, args: List[str] = []) -> str:
        self._check_safe("launch", app)
        if PLATFORM == "Darwin":
            cmd = ["open", "-a", app] + args
        elif PLATFORM == "Linux":
            cmd = [app] + args
        else:  # Windows
            cmd = ["start", app] + args
        subprocess.Popen(cmd)
        return f"Launched: {app}"

    async def _run_shell(self, command: str, timeout: int = 30) -> str:
        self._check_safe(command)
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return f"EXIT {proc.returncode}\nSTDOUT: {stdout.decode()}\nSTDERR: {stderr.decode()}"

    async def _list_windows(self) -> str:
        if PLATFORM == "Darwin":
            script = 'tell application "System Events" to get name of every process whose background only is false'
            result = subprocess.run(["osascript", "-e", script], capture_output=True)
            return result.stdout.decode()
        elif PLATFORM == "Linux":
            result = subprocess.run(["wmctrl", "-l"], capture_output=True)
            return result.stdout.decode()
        return "Window listing not supported on this platform."

    async def _focus_window(self, title: str) -> str:
        if PLATFORM == "Darwin":
            script = f'tell application "{title}" to activate'
            subprocess.run(["osascript", "-e", script])
            return f"Focused: {title}"
        elif PLATFORM == "Linux":
            subprocess.run(["wmctrl", "-a", title])
            return f"Focused: {title}"
        return "Window focus not supported on this platform."

    async def _file_copy(self, src: str, dst: str) -> str:
        import shutil
        shutil.copy2(src, dst)
        return f"Copied {src} -> {dst}"

    async def _file_move(self, src: str, dst: str) -> str:
        import shutil
        self._check_safe("move", src)
        shutil.move(src, dst)
        return f"Moved {src} -> {dst}"

    async def _file_delete(self, path: str) -> str:
        self._check_safe("delete", path)
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"Not found: {path}")
        if p.is_dir():
            import shutil
            shutil.rmtree(path)
        else:
            p.unlink()
        return f"Deleted: {path}"

    async def _file_read(self, path: str) -> str:
        return Path(path).read_text(encoding="utf-8", errors="replace")

    async def _file_write(self, path: str, content: str) -> str:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"Wrote {len(content)} chars to {path}"

    async def _get_screen_size(self) -> str:
        try:
            import pyautogui
            w, h = pyautogui.size()
            return f"{w}x{h}"
        except ImportError:
            return "pyautogui not available."

    async def _scroll(
        self, x: int, y: int, clicks: int = 3, direction: str = "down"
    ) -> str:
        import pyautogui
        amount = -clicks if direction == "down" else clicks
        pyautogui.scroll(amount, x=x, y=y)
        return f"Scrolled {direction} {clicks} clicks at ({x},{y})"
