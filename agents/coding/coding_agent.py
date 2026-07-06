from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from agents.base.agent_types import AgentResult, AgentTask, AgentTool
from agents.base.base_agent import BaseAgent

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = ["python", "javascript", "typescript", "go", "rust", "java", "csharp", "sql"]

_CODE_SYSTEM = """You are an expert software engineer. Produce clean, production-quality code.
Always include:
- Type hints/annotations
- Docstrings / JSDoc comments
- Error handling
- No placeholder TODOs unless explicitly requested
Return ONLY the code block when asked to generate code."""


class CodingAgent(BaseAgent):
    """Coding agent: generation, review, refactoring, bug-fixing, git ops, test execution."""

    def __init__(self, workspace_dir: Optional[str] = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._workspace = Path(workspace_dir or tempfile.mkdtemp(prefix="jarvis_coding_"))
        self._workspace.mkdir(parents=True, exist_ok=True)
        self._register_tools()

    @property
    def name(self) -> str:
        return "coding"

    @property
    def description(self) -> str:
        return "Code generation, review, debugging, refactoring, git ops, and test execution."

    @property
    def capabilities(self) -> List[str]:
        return [
            "code", "generate", "debug", "refactor", "review", "test",
            "git", "repository", "python", "javascript", "typescript",
            "rust", "go", "java", "sql",
        ]

    # ------------------------------------------------------------------
    # Tools
    # ------------------------------------------------------------------

    def _register_tools(self) -> None:
        tools_config = [
            ("read_file", "Read a file from the workspace.", self._read_file,
             {"path": {"type": "string"}}),
            ("write_file", "Write content to a file in the workspace.", self._write_file,
             {"path": {"type": "string"}, "content": {"type": "string"}}),
            ("list_files", "List files in a directory.", self._list_files,
             {"directory": {"type": "string", "default": "."}}),
            ("run_command", "Run a shell command in the workspace (sandboxed).", self._run_command,
             {"command": {"type": "string"}, "timeout": {"type": "integer", "default": 30}}),
            ("git_status", "Get git status.", self._git_status, {}),
            ("git_diff", "Get git diff.", self._git_diff,
             {"staged": {"type": "boolean", "default": False}}),
            ("git_commit", "Commit staged changes.", self._git_commit,
             {"message": {"type": "string"}}),
            ("git_branch", "List or create branches.", self._git_branch,
             {"create": {"type": "string", "default": ""}}),
            ("analyze_code", "Analyze code for issues.", self._analyze_code,
             {"code": {"type": "string"}, "language": {"type": "string"}}),
        ]
        for name, desc, fn, schema in tools_config:
            t = AgentTool(name=name, description=desc, parameters_schema=schema)
            t.set_execute(fn)
            self.register_tool(t)

    # ------------------------------------------------------------------
    # Main execution
    # ------------------------------------------------------------------

    async def execute(self, task: AgentTask) -> AgentResult:
        try:
            action = task.context.get("action", "generate")
            dispatch = {
                "generate": self._do_generate,
                "review": self._do_review,
                "fix": self._do_fix,
                "refactor": self._do_refactor,
                "test": self._do_test,
                "analyze": self._do_analyze,
            }
            handler = dispatch.get(action, self._do_generate)
            return await handler(task)
        except Exception as exc:
            logger.exception("CodingAgent failed for task %s", task.id)
            return AgentResult(task_id=task.id, success=False, error=str(exc))

    # ------------------------------------------------------------------
    # Action handlers
    # ------------------------------------------------------------------

    async def _do_generate(self, task: AgentTask) -> AgentResult:
        language = task.context.get("language", "python")
        messages = [
            {"role": "system", "content": _CODE_SYSTEM},
            {"role": "user", "content": f"Language: {language}\n\nTask: {task.goal}"},
        ]
        code = await self._llm_chat(messages)
        code = self._strip_fences(code)

        filename = task.context.get("filename", f"output.{self._ext(language)}")
        file_path = self._workspace / filename
        file_path.write_text(code, encoding="utf-8")

        return AgentResult(
            task_id=task.id,
            success=True,
            output=code,
            artifacts={"file": str(file_path), "language": language, "lines": code.count("\n") + 1},
            thoughts=self.get_thoughts(),
        )

    async def _do_review(self, task: AgentTask) -> AgentResult:
        code = task.context.get("code", "")
        language = task.context.get("language", "python")
        messages = [
            {"role": "system", "content": "You are a senior code reviewer. Identify bugs, security issues, performance problems, and style violations. Be specific with line references."},
            {"role": "user", "content": f"Language: {language}\n\nCode to review:\n```{language}\n{code}\n```"},
        ]
        review = await self._llm_chat(messages)
        return AgentResult(task_id=task.id, success=True, output=review,
                           artifacts={"language": language})

    async def _do_fix(self, task: AgentTask) -> AgentResult:
        code = task.context.get("code", "")
        error = task.context.get("error", "")
        language = task.context.get("language", "python")
        messages = [
            {"role": "system", "content": _CODE_SYSTEM},
            {"role": "user", "content": (
                f"Fix the following {language} code.\n"
                f"Error: {error}\n\n"
                f"Code:\n```{language}\n{code}\n```\n\n"
                "Return ONLY the fixed code."
            )},
        ]
        fixed = await self._llm_chat(messages)
        fixed = self._strip_fences(fixed)
        return AgentResult(task_id=task.id, success=True, output=fixed,
                           artifacts={"language": language, "original_error": error})

    async def _do_refactor(self, task: AgentTask) -> AgentResult:
        code = task.context.get("code", "")
        instructions = task.context.get("instructions", "Improve readability and maintainability.")
        language = task.context.get("language", "python")
        messages = [
            {"role": "system", "content": _CODE_SYSTEM},
            {"role": "user", "content": (
                f"Refactor this {language} code.\n"
                f"Instructions: {instructions}\n\n"
                f"Code:\n```{language}\n{code}\n```\n\n"
                "Return ONLY the refactored code."
            )},
        ]
        refactored = await self._llm_chat(messages)
        refactored = self._strip_fences(refactored)
        return AgentResult(task_id=task.id, success=True, output=refactored)

    async def _do_test(self, task: AgentTask) -> AgentResult:
        code = task.context.get("code", "")
        language = task.context.get("language", "python")
        if language == "python" and code:
            with tempfile.NamedTemporaryFile(suffix=".py", delete=False, mode="w") as f:
                f.write(code)
                tmp_path = f.name
            try:
                proc = await asyncio.create_subprocess_exec(
                    "python", "-m", "py_compile", tmp_path,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
                success = proc.returncode == 0
                return AgentResult(
                    task_id=task.id, success=success,
                    output=stdout.decode() if success else stderr.decode(),
                    artifacts={"syntax_check": success},
                )
            finally:
                os.unlink(tmp_path)
        return AgentResult(task_id=task.id, success=True, output="Test execution not supported for this language/context.")

    async def _do_analyze(self, task: AgentTask) -> AgentResult:
        directory = task.context.get("directory", str(self._workspace))
        files = await self._list_files(directory=directory)
        messages = [
            {"role": "system", "content": "You are a software architect. Analyze the repository structure and provide insights on architecture, patterns, and improvements."},
            {"role": "user", "content": f"Repository structure:\n{files}\n\nGoal: {task.goal}"},
        ]
        analysis = await self._llm_chat(messages)
        return AgentResult(task_id=task.id, success=True, output=analysis,
                           artifacts={"directory": directory})

    # ------------------------------------------------------------------
    # Tool implementations
    # ------------------------------------------------------------------

    async def _read_file(self, path: str) -> str:
        full_path = self._workspace / path
        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        return full_path.read_text(encoding="utf-8")

    async def _write_file(self, path: str, content: str) -> str:
        full_path = self._workspace / path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content, encoding="utf-8")
        return f"Written {len(content)} chars to {path}"

    async def _list_files(self, directory: str = ".") -> str:
        target = self._workspace / directory
        if not target.exists():
            return "Directory not found."
        lines = []
        for p in sorted(target.rglob("*")):
            if ".git" in p.parts:
                continue
            rel = p.relative_to(self._workspace)
            lines.append(("  " * (len(rel.parts) - 1)) + p.name + ("/" if p.is_dir() else ""))
        return "\n".join(lines[:500])

    async def _run_command(self, command: str, timeout: int = 30) -> str:
        BLOCKED = ["rm -rf /", "sudo", "curl | sh", "wget | sh"]
        for blocked in BLOCKED:
            if blocked in command:
                raise PermissionError(f"Blocked dangerous command pattern: '{blocked}'")
        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=str(self._workspace),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            raise TimeoutError(f"Command timed out after {timeout}s")
        out = stdout.decode(errors="replace")
        err = stderr.decode(errors="replace")
        return f"STDOUT:\n{out}\nSTDERR:\n{err}\nEXIT: {proc.returncode}"

    async def _git_status(self) -> str:
        return await self._run_command("git status --short")

    async def _git_diff(self, staged: bool = False) -> str:
        flag = "--cached" if staged else ""
        return await self._run_command(f"git diff {flag}")

    async def _git_commit(self, message: str) -> str:
        await self._run_command("git add -A")
        return await self._run_command(f'git commit -m "{message}"')

    async def _git_branch(self, create: str = "") -> str:
        if create:
            return await self._run_command(f"git checkout -b {create}")
        return await self._run_command("git branch")

    async def _analyze_code(self, code: str, language: str) -> str:
        messages = [
            {"role": "system", "content": "Analyze this code for bugs, security issues, and style. Be concise."},
            {"role": "user", "content": f"```{language}\n{code}\n```"},
        ]
        return await self._llm_chat(messages)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _strip_fences(text: str) -> str:
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.startswith("```")]
            text = "\n".join(lines)
        return text.strip()

    @staticmethod
    def _ext(language: str) -> str:
        return {
            "python": "py", "javascript": "js", "typescript": "ts",
            "go": "go", "rust": "rs", "java": "java", "csharp": "cs", "sql": "sql",
        }.get(language, "txt")
