from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from agents.base.agent_types import AgentResult, AgentTask, AgentTool
from agents.base.base_agent import BaseAgent

logger = logging.getLogger(__name__)

_SYNTHESIS_PROMPT = """You are a meticulous research analyst. Given the following search results,
produce a comprehensive, well-structured synthesis. Include:
1. Key findings
2. Supporting evidence with citations
3. Conflicting information (if any)
4. Confidence assessment

Format with clear headings. Cite sources as [Source N].
"""


@dataclass
class SearchResult:
    url: str
    title: str
    snippet: str
    full_text: str = ""
    credibility_score: float = 0.5
    source_domain: str = ""


class ResearchAgent(BaseAgent):
    """Research agent: multi-source web research with synthesis and fact verification."""

    TRUSTED_DOMAINS = {
        "wikipedia.org", "arxiv.org", "nature.com", "science.org",
        "pubmed.ncbi.nlm.nih.gov", "gov", "edu", "bbc.com",
        "reuters.com", "apnews.com", "nytimes.com",
    }

    def __init__(self, search_client: Any = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._search_client = search_client
        self._register_tools()

    @property
    def name(self) -> str:
        return "research"

    @property
    def description(self) -> str:
        return "Multi-source research agent with synthesis and credibility scoring."

    @property
    def capabilities(self) -> List[str]:
        return ["research", "search", "summarize", "fact-check", "web", "information"]

    # ------------------------------------------------------------------

    def _register_tools(self) -> None:
        search_tool = AgentTool(
            name="web_search",
            description="Search the web for information.",
            parameters_schema={
                "query": {"type": "string"},
                "num_results": {"type": "integer", "default": 5},
            },
        )
        search_tool.set_execute(self._web_search)

        fetch_tool = AgentTool(
            name="fetch_page",
            description="Fetch the text content of a URL.",
            parameters_schema={"url": {"type": "string"}},
        )
        fetch_tool.set_execute(self._fetch_page)

        self.register_tool(search_tool)
        self.register_tool(fetch_tool)

    # ------------------------------------------------------------------
    # Main execution
    # ------------------------------------------------------------------

    async def execute(self, task: AgentTask) -> AgentResult:
        try:
            query = task.goal
            num_sources = int(task.context.get("num_sources", 5))

            # Step 1: search
            raw_results = await self._web_search(query=query, num_results=num_sources)

            # Step 2: score credibility
            scored = [self._score_credibility(r) for r in raw_results]
            scored.sort(key=lambda r: r.credibility_score, reverse=True)

            # Step 3: fetch full text for top sources
            top = scored[:3]
            fetch_tasks = [self._fetch_and_enrich(r) for r in top]
            enriched = await asyncio.gather(*fetch_tasks, return_exceptions=True)
            sources = [r for r in enriched if isinstance(r, SearchResult)]

            # Step 4: synthesize
            synthesis = await self._synthesize(query, sources)

            # Step 5: verify key claims
            facts = self._extract_facts(synthesis)
            verified = await self._verify_facts(facts, sources)

            return AgentResult(
                task_id=task.id,
                success=True,
                output=synthesis,
                artifacts={
                    "sources": [
                        {
                            "url": r.url,
                            "title": r.title,
                            "credibility": r.credibility_score,
                            "domain": r.source_domain,
                        }
                        for r in sources
                    ],
                    "raw_results": len(raw_results),
                    "verified_facts": verified,
                    "citations": self._build_citations(sources),
                },
                thoughts=self.get_thoughts(),
            )
        except Exception as exc:
            logger.exception("ResearchAgent failed for task %s", task.id)
            return AgentResult(task_id=task.id, success=False, error=str(exc))

    # ------------------------------------------------------------------
    # Search & fetch
    # ------------------------------------------------------------------

    async def _web_search(self, query: str, num_results: int = 5) -> List[SearchResult]:
        if self._search_client:
            raw = await self._search_client.search(query, num_results=num_results)
            return [
                SearchResult(
                    url=item.get("url", ""),
                    title=item.get("title", ""),
                    snippet=item.get("snippet", ""),
                    source_domain=urlparse(item.get("url", "")).netloc,
                )
                for item in raw
            ]
        # Stub: return empty list when no client configured
        logger.warning("No search client configured; returning empty results.")
        return []

    async def _fetch_page(self, url: str) -> str:
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    html = await resp.text()
            # Strip tags crudely
            text = re.sub(r"<[^>]+>", " ", html)
            text = re.sub(r"\s+", " ", text).strip()
            return text[:8000]
        except Exception as exc:
            logger.warning("Failed to fetch %s: %s", url, exc)
            return ""

    async def _fetch_and_enrich(self, result: SearchResult) -> SearchResult:
        result.full_text = await self._fetch_page(result.url)
        return result

    # ------------------------------------------------------------------
    # Credibility
    # ------------------------------------------------------------------

    def _score_credibility(self, result: SearchResult) -> SearchResult:
        domain = urlparse(result.url).netloc.lower().lstrip("www.")
        result.source_domain = domain
        score = 0.4
        for trusted in self.TRUSTED_DOMAINS:
            if domain.endswith(trusted):
                score = 0.85
                break
        if domain.endswith(".gov") or domain.endswith(".edu"):
            score = 0.9
        result.credibility_score = score
        return result

    # ------------------------------------------------------------------
    # Synthesis
    # ------------------------------------------------------------------

    async def _synthesize(self, query: str, sources: List[SearchResult]) -> str:
        if not sources:
            return f"No sources found for query: {query}"

        sources_text = "\n\n".join(
            f"[Source {i+1}] {r.title} ({r.url})\n{r.full_text or r.snippet}"
            for i, r in enumerate(sources)
        )
        messages = [
            {"role": "system", "content": _SYNTHESIS_PROMPT},
            {
                "role": "user",
                "content": f"Query: {query}\n\nSources:\n{sources_text}",
            },
        ]
        return await self._llm_chat(messages)

    # ------------------------------------------------------------------
    # Fact verification (lightweight)
    # ------------------------------------------------------------------

    def _extract_facts(self, text: str) -> List[str]:
        sentences = re.split(r"(?<=[.!?])\s+", text)
        return [s.strip() for s in sentences if len(s) > 40][:10]

    async def _verify_facts(
        self, facts: List[str], sources: List[SearchResult]
    ) -> List[Dict[str, Any]]:
        verified: List[Dict[str, Any]] = []
        source_corpus = " ".join(r.full_text or r.snippet for r in sources).lower()
        for fact in facts:
            keywords = [w for w in fact.lower().split() if len(w) > 5][:4]
            hits = sum(1 for kw in keywords if kw in source_corpus)
            confidence = hits / max(len(keywords), 1)
            verified.append({"fact": fact, "confidence": round(confidence, 2)})
        return verified

    def _build_citations(self, sources: List[SearchResult]) -> List[str]:
        return [f"[{i+1}] {r.title}. {r.url}" for i, r in enumerate(sources)]
