from __future__ import annotations

import asyncio
import base64
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from agents.base.agent_types import AgentResult, AgentTask, AgentTool
from agents.base.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class BrowserAgent(BaseAgent):
    """Browser automation agent using async Playwright."""

    def __init__(
        self,
        headless: bool = True,
        downloads_dir: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self._headless = headless
        self._downloads_dir = Path(downloads_dir or "/tmp/jarvis_downloads")
        self._downloads_dir.mkdir(parents=True, exist_ok=True)
        self._playwright: Any = None
        self._browser: Any = None
        self._context: Any = None
        self._pages: Dict[str, Any] = {}  # label -> Page
        self._active_page_label: Optional[str] = None
        self._register_tools()

    @property
    def name(self) -> str:
        return "browser"

    @property
    def description(self) -> str:
        return "Browser automation agent: navigate, click, fill forms, scrape, screenshot."

    @property
    def capabilities(self) -> List[str]:
        return ["browse", "navigate", "click", "scrape", "screenshot", "login", "download", "web"]

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def _ensure_browser(self) -> None:
        if self._browser is not None:
            return
        from playwright.async_api import async_playwright
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(headless=self._headless)
        self._context = await self._browser.new_context(
            downloads_path=str(self._downloads_dir),
            accept_downloads=True,
        )
        logger.info("Playwright browser launched (headless=%s)", self._headless)

    async def _ensure_page(self, label: str = "default") -> Any:
        await self._ensure_browser()
        if label not in self._pages:
            self._pages[label] = await self._context.new_page()
        self._active_page_label = label
        return self._pages[label]

    @property
    def _page(self) -> Any:
        label = self._active_page_label or "default"
        return self._pages.get(label)

    async def close(self) -> None:
        if self._context:
            await self._context.close()
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()
        self._browser = None
        self._context = None
        self._pages = {}

    # ------------------------------------------------------------------
    # Tools
    # ------------------------------------------------------------------

    def _register_tools(self) -> None:
        defs = [
            ("navigate", "Navigate to a URL.", self._navigate,
             {"url": {"type": "string"}, "tab": {"type": "string", "default": "default"}}),
            ("click", "Click a CSS selector.", self._click,
             {"selector": {"type": "string"}, "timeout": {"type": "integer", "default": 5000}}),
            ("fill", "Fill an input field.", self._fill,
             {"selector": {"type": "string"}, "value": {"type": "string"}}),
            ("get_text", "Extract text from an element.", self._get_text,
             {"selector": {"type": "string", "default": "body"}}),
            ("screenshot", "Capture a screenshot as base64 PNG.", self._screenshot,
             {"full_page": {"type": "boolean", "default": False}}),
            ("execute_js", "Execute JavaScript on the page.", self._execute_js,
             {"script": {"type": "string"}}),
            ("wait_for", "Wait for a selector to appear.", self._wait_for,
             {"selector": {"type": "string"}, "timeout": {"type": "integer", "default": 10000}}),
            ("get_cookies", "Get current cookies.", self._get_cookies, {}),
            ("set_cookies", "Set cookies.", self._set_cookies,
             {"cookies": {"type": "array"}}),
            ("new_tab", "Open a new browser tab.", self._new_tab,
             {"label": {"type": "string"}}),
            ("switch_tab", "Switch to a tab by label.", self._switch_tab,
             {"label": {"type": "string"}}),
            ("close_tab", "Close a tab.", self._close_tab,
             {"label": {"type": "string"}}),
            ("download", "Click a download link and save file.", self._download,
             {"selector": {"type": "string"}}),
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
            await self._ensure_page()
            action = task.context.get("action", "navigate_and_extract")
            dispatch = {
                "navigate_and_extract": self._do_extract,
                "login": self._do_login,
                "fill_form": self._do_fill_form,
                "screenshot": self._do_screenshot,
                "scrape": self._do_scrape,
            }
            handler = dispatch.get(action, self._do_extract)
            return await handler(task)
        except Exception as exc:
            logger.exception("BrowserAgent failed for task %s", task.id)
            return AgentResult(task_id=task.id, success=False, error=str(exc))

    # ------------------------------------------------------------------
    # Action handlers
    # ------------------------------------------------------------------

    async def _do_extract(self, task: AgentTask) -> AgentResult:
        url = task.context.get("url") or task.goal
        await self._navigate(url=url)
        text = await self._get_text(selector="body")
        screenshot_b64 = await self._screenshot()
        return AgentResult(
            task_id=task.id, success=True, output=text[:5000],
            artifacts={"url": url, "screenshot_b64": screenshot_b64[:100] + "…"},
        )

    async def _do_login(self, task: AgentTask) -> AgentResult:
        url = task.context.get("url", "")
        username_sel = task.context.get("username_selector", "#username")
        password_sel = task.context.get("password_selector", "#password")
        submit_sel = task.context.get("submit_selector", '[type=submit]')
        username = task.context.get("username", "")
        password = task.context.get("password", "")

        await self._navigate(url=url)
        await self._fill(selector=username_sel, value=username)
        await self._fill(selector=password_sel, value=password)
        await self._click(selector=submit_sel)
        await asyncio.sleep(2)
        current_url = self._page.url if self._page else ""
        return AgentResult(
            task_id=task.id, success=True,
            output=f"Login attempted; current URL: {current_url}",
        )

    async def _do_fill_form(self, task: AgentTask) -> AgentResult:
        url = task.context.get("url", "")
        fields: Dict[str, str] = task.context.get("fields", {})
        submit_sel = task.context.get("submit_selector", '[type=submit]')

        if url:
            await self._navigate(url=url)
        for selector, value in fields.items():
            await self._fill(selector=selector, value=value)
        if submit_sel:
            await self._click(selector=submit_sel)
        return AgentResult(task_id=task.id, success=True, output="Form submitted.")

    async def _do_screenshot(self, task: AgentTask) -> AgentResult:
        url = task.context.get("url")
        if url:
            await self._navigate(url=url)
        b64 = await self._screenshot(full_page=task.context.get("full_page", False))
        return AgentResult(task_id=task.id, success=True, output="Screenshot captured.",
                           artifacts={"screenshot_b64": b64})

    async def _do_scrape(self, task: AgentTask) -> AgentResult:
        url = task.context.get("url") or task.goal
        selector = task.context.get("selector", "body")
        await self._navigate(url=url)
        await self._wait_for(selector=selector)
        text = await self._get_text(selector=selector)
        return AgentResult(task_id=task.id, success=True, output=text,
                           artifacts={"url": url, "selector": selector})

    # ------------------------------------------------------------------
    # Playwright tool implementations
    # ------------------------------------------------------------------

    async def _navigate(self, url: str, tab: str = "default") -> str:
        page = await self._ensure_page(tab)
        await page.goto(url, wait_until="networkidle", timeout=30000)
        return f"Navigated to {url}"

    async def _click(self, selector: str, timeout: int = 5000) -> str:
        page = await self._ensure_page()
        await page.click(selector, timeout=timeout)
        return f"Clicked {selector}"

    async def _fill(self, selector: str, value: str) -> str:
        page = await self._ensure_page()
        await page.fill(selector, value)
        return f"Filled {selector}"

    async def _get_text(self, selector: str = "body") -> str:
        page = await self._ensure_page()
        el = await page.query_selector(selector)
        if el is None:
            return ""
        return await el.inner_text()

    async def _screenshot(self, full_page: bool = False) -> str:
        page = await self._ensure_page()
        data = await page.screenshot(full_page=full_page)
        return base64.b64encode(data).decode()

    async def _execute_js(self, script: str) -> Any:
        page = await self._ensure_page()
        return await page.evaluate(script)

    async def _wait_for(self, selector: str, timeout: int = 10000) -> str:
        page = await self._ensure_page()
        await page.wait_for_selector(selector, timeout=timeout)
        return f"Element '{selector}' appeared."

    async def _get_cookies(self) -> List[Dict[str, Any]]:
        if self._context is None:
            return []
        return await self._context.cookies()

    async def _set_cookies(self, cookies: List[Dict[str, Any]]) -> str:
        if self._context:
            await self._context.add_cookies(cookies)
        return f"Set {len(cookies)} cookies."

    async def _new_tab(self, label: str) -> str:
        await self._ensure_page(label)
        return f"Opened tab '{label}'."

    async def _switch_tab(self, label: str) -> str:
        if label not in self._pages:
            raise ValueError(f"Tab '{label}' does not exist.")
        self._active_page_label = label
        return f"Switched to tab '{label}'."

    async def _close_tab(self, label: str) -> str:
        page = self._pages.pop(label, None)
        if page:
            await page.close()
        return f"Closed tab '{label}'."

    async def _download(self, selector: str) -> str:
        page = await self._ensure_page()
        async with page.expect_download() as dl_info:
            await page.click(selector)
        download = await dl_info.value
        dest = self._downloads_dir / download.suggested_filename
        await download.save_as(str(dest))
        return f"Downloaded to {dest}"
