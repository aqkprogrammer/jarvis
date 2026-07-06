from __future__ import annotations

import asyncio
import os
import shutil
import signal
import sys
import tempfile
import time

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.logging import get_logger
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter()
logger = get_logger(__name__)

MAX_OUTPUT_CHARS = 10_000
TRUNCATION_MARKER = "\n... [output truncated]"


# ── Schemas ────────────────────────────────────────────────────────────────────

class ExecuteRequest(BaseModel):
    language: str = Field(..., pattern="^(python|javascript)$")
    code: str = Field(..., min_length=1, max_length=100_000)
    timeout_seconds: int = Field(10, ge=1, le=30)


class ExecuteResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int
    truncated: bool


# ── Helpers ────────────────────────────────────────────────────────────────────

def _truncate(text: str) -> tuple[str, bool]:
    if len(text) > MAX_OUTPUT_CHARS:
        return text[:MAX_OUTPUT_CHARS] + TRUNCATION_MARKER, True
    return text, False


def _build_command(payload: ExecuteRequest) -> list[str]:
    if payload.language == "python":
        # -I: isolated mode (no user site-packages, no env-based sys.path injection)
        return [sys.executable, "-I", "-c", payload.code]

    node = shutil.which("node")
    if not node:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="JavaScript execution is unavailable: 'node' runtime not found on the server",
        )
    return [node, "-e", payload.code]


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("", response_model=ExecuteResponse)
async def execute_code(
    payload: ExecuteRequest,
    current_user: User = Depends(get_current_user),
):
    if not settings.ENABLE_CODE_EXECUTION:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Code execution is disabled on this server",
        )

    cmd = _build_command(payload)
    workdir = tempfile.mkdtemp(prefix="jarvis_exec_")
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin")}

    start = time.monotonic()
    timed_out = False
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            stdin=asyncio.subprocess.DEVNULL,
            cwd=workdir,
            env=env,
            start_new_session=True,  # own process group so we can kill the whole tree
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(), timeout=payload.timeout_seconds
            )
        except asyncio.TimeoutError:
            timed_out = True
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass
            stdout_bytes, stderr_bytes = await proc.communicate()

        duration_ms = int((time.monotonic() - start) * 1000)

        stdout_text = stdout_bytes.decode("utf-8", errors="replace")
        stderr_text = stderr_bytes.decode("utf-8", errors="replace")
        if timed_out:
            stderr_text = (
                stderr_text
                + f"\nExecution timed out after {payload.timeout_seconds}s and was killed."
            ).strip()

        stdout, stdout_truncated = _truncate(stdout_text)
        stderr, stderr_truncated = _truncate(stderr_text)
        exit_code = proc.returncode if proc.returncode is not None else -1

        logger.info(
            "code_executed",
            user_id=current_user.id,
            language=payload.language,
            exit_code=exit_code,
            duration_ms=duration_ms,
            timed_out=timed_out,
        )
        return ExecuteResponse(
            stdout=stdout,
            stderr=stderr,
            exit_code=exit_code,
            duration_ms=duration_ms,
            truncated=stdout_truncated or stderr_truncated,
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
