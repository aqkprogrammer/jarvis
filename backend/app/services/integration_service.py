"""Integration hub: outbound connectors for GitHub, Slack, Discord and Notion.

Each action reads plaintext credentials from the ``Integration.credentials``
JSONB column and talks to the provider with a short-lived ``httpx.AsyncClient``.
All transport/HTTP failures are normalised into ``IntegrationError`` (safe to
surface to users); bad requests (unknown action, missing params) raise
``ValueError``. Endpoints map both to HTTP 400.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx

from app.core.logging import get_logger
from app.models.integration import Integration
from app.services.ai_provider import AIProviderFactory, CompletionResult

logger = get_logger(__name__)

REQUEST_TIMEOUT_SECONDS = 10.0
SUPPORTED_PROVIDERS = ("github", "slack", "discord", "notion")

GITHUB_API = "https://api.github.com"
SLACK_API = "https://slack.com/api"
SLACK_WEBHOOK_PREFIX = "https://hooks.slack.com/"
NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

PR_SUMMARY_MAX_FILES = 30
PR_SUMMARY_MAX_PATCH_CHARS = 15000
NOTION_PARAGRAPH_CHAR_LIMIT = 2000
NOTION_MAX_BLOCKS = 100
DISCORD_CONTENT_CHAR_LIMIT = 2000

_PR_SUMMARY_SYSTEM = (
    "You are JARVIS, summarizing GitHub pull requests concisely for a busy engineer."
)


class IntegrationError(Exception):
    """A third-party integration call failed; the message is safe to show users."""


# ── HTTP helper ───────────────────────────────────────────────────────────────

async def _request(
    method: str,
    url: str,
    *,
    provider: str,
    headers: Optional[Dict[str, str]] = None,
    params: Optional[Dict[str, Any]] = None,
    json_body: Optional[Dict[str, Any]] = None,
) -> httpx.Response:
    """Perform one HTTP call, wrapping failures into friendly IntegrationErrors."""
    try:
        async with httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_SECONDS, follow_redirects=True
        ) as client:
            response = await client.request(
                method, url, headers=headers, params=params, json=json_body
            )
            response.raise_for_status()
            return response
    except httpx.HTTPStatusError as exc:
        detail = ""
        try:
            data = exc.response.json()
            detail = data.get("message") or data.get("error") or ""
        except Exception:
            detail = exc.response.text[:200]
        message = f"{provider} API returned {exc.response.status_code}"
        if detail:
            message = f"{message}: {detail}"
        raise IntegrationError(message) from exc
    except httpx.TimeoutException as exc:
        raise IntegrationError(
            f"{provider} request timed out after {REQUEST_TIMEOUT_SECONDS:.0f}s"
        ) from exc
    except httpx.HTTPError as exc:
        raise IntegrationError(f"{provider} request failed: {exc}") from exc


def _require(params: Dict[str, Any], key: str) -> Any:
    value = params.get(key)
    if value is None or value == "":
        raise ValueError(f"Missing required param: '{key}'")
    return value


# ── GitHub ────────────────────────────────────────────────────────────────────

def _github_headers(credentials: Dict[str, Any]) -> Dict[str, str]:
    token = (credentials or {}).get("token")
    if not token:
        raise IntegrationError("GitHub integration is missing a 'token' credential")
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def _github_test(integration: Integration) -> Dict[str, Any]:
    response = await _request(
        "GET",
        f"{GITHUB_API}/user",
        provider="github",
        headers=_github_headers(integration.credentials),
    )
    data = response.json()
    return {"account": data.get("login")}


async def _github_list_repos(integration: Integration) -> List[Dict[str, Any]]:
    response = await _request(
        "GET",
        f"{GITHUB_API}/user/repos",
        provider="github",
        headers=_github_headers(integration.credentials),
        params={"sort": "updated", "per_page": 30},
    )
    return [
        {
            "full_name": repo.get("full_name"),
            "description": repo.get("description"),
            "stars": repo.get("stargazers_count", 0),
            "updated_at": repo.get("updated_at"),
        }
        for repo in response.json()
    ]


async def _github_list_prs(integration: Integration, repo: str) -> List[Dict[str, Any]]:
    response = await _request(
        "GET",
        f"{GITHUB_API}/repos/{repo}/pulls",
        provider="github",
        headers=_github_headers(integration.credentials),
        params={"state": "open"},
    )
    return [
        {
            "number": pr.get("number"),
            "title": pr.get("title"),
            "user": (pr.get("user") or {}).get("login"),
            "created_at": pr.get("created_at"),
        }
        for pr in response.json()
    ]


async def _github_summarize_pr(
    integration: Integration, repo: str, number: int
) -> Dict[str, Any]:
    headers = _github_headers(integration.credentials)
    meta_response = await _request(
        "GET", f"{GITHUB_API}/repos/{repo}/pulls/{number}", provider="github", headers=headers
    )
    meta = meta_response.json()
    files_response = await _request(
        "GET",
        f"{GITHUB_API}/repos/{repo}/pulls/{number}/files",
        provider="github",
        headers=headers,
        params={"per_page": PR_SUMMARY_MAX_FILES},
    )
    files = files_response.json()[:PR_SUMMARY_MAX_FILES]

    patch_sections: List[str] = []
    remaining = PR_SUMMARY_MAX_PATCH_CHARS
    for changed_file in files:
        if remaining <= 0:
            break
        section = (
            f"--- {changed_file.get('filename')} "
            f"(+{changed_file.get('additions', 0)}/-{changed_file.get('deletions', 0)})\n"
            f"{changed_file.get('patch') or '(no textual diff)'}"
        )[:remaining]
        patch_sections.append(section)
        remaining -= len(section)

    prompt = (
        "Summarize this GitHub pull request.\n\n"
        f"Repository: {repo}\n"
        f"PR #{number}: {meta.get('title')}\n"
        f"Author: {(meta.get('user') or {}).get('login')}\n"
        f"Description:\n{(meta.get('body') or '(no description)')[:2000]}\n\n"
        f"Changed files ({meta.get('changed_files', len(files))} total, "
        f"first {len(files)} shown):\n\n"
        + "\n\n".join(patch_sections)
        + "\n\nProvide: 1) a one-paragraph overview, 2) key changes as bullet points, "
        "3) anything reviewers should watch out for."
    )

    provider = AIProviderFactory.get()
    result: CompletionResult = await provider.complete(
        messages=[{"role": "user", "content": prompt}],
        system=_PR_SUMMARY_SYSTEM,
    )
    return {
        "summary": result.content,
        "title": meta.get("title"),
        "number": meta.get("number", number),
        "files_changed": meta.get("changed_files", len(files)),
    }


async def _github_create_issue(
    integration: Integration, repo: str, title: str, body: str = ""
) -> Dict[str, Any]:
    response = await _request(
        "POST",
        f"{GITHUB_API}/repos/{repo}/issues",
        provider="github",
        headers=_github_headers(integration.credentials),
        json_body={"title": title, "body": body},
    )
    data = response.json()
    return {"number": data.get("number"), "url": data.get("html_url")}


# ── Slack ─────────────────────────────────────────────────────────────────────

async def _slack_test(integration: Integration) -> Dict[str, Any]:
    credentials = integration.credentials or {}
    bot_token = credentials.get("bot_token")
    webhook_url = credentials.get("webhook_url")

    if bot_token:
        response = await _request(
            "POST",
            f"{SLACK_API}/auth.test",
            provider="slack",
            headers={"Authorization": f"Bearer {bot_token}"},
        )
        data = response.json()
        if not data.get("ok"):
            raise IntegrationError(f"Slack auth failed: {data.get('error', 'unknown error')}")
        return {"team": data.get("team"), "bot_user": data.get("user")}

    if webhook_url:
        if not str(webhook_url).startswith(SLACK_WEBHOOK_PREFIX):
            raise IntegrationError(
                f"Slack webhook_url must start with {SLACK_WEBHOOK_PREFIX}"
            )
        return {"webhook": "configured"}

    raise IntegrationError("Slack integration needs a 'bot_token' or 'webhook_url' credential")


async def _slack_send_message(
    integration: Integration, text: str, channel: Optional[str] = None
) -> Dict[str, Any]:
    credentials = integration.credentials or {}
    config = integration.config or {}
    bot_token = credentials.get("bot_token")
    webhook_url = credentials.get("webhook_url")

    if bot_token:
        target = channel or config.get("default_channel")
        if not target:
            raise IntegrationError(
                "No Slack channel given and no default_channel configured"
            )
        response = await _request(
            "POST",
            f"{SLACK_API}/chat.postMessage",
            provider="slack",
            headers={"Authorization": f"Bearer {bot_token}"},
            json_body={"channel": target, "text": text},
        )
        data = response.json()
        if not data.get("ok"):
            raise IntegrationError(f"Slack send failed: {data.get('error', 'unknown error')}")
        return {"ok": True, "channel": data.get("channel"), "ts": data.get("ts")}

    if webhook_url:
        await _request("POST", webhook_url, provider="slack", json_body={"text": text})
        return {"ok": True, "via": "webhook"}

    raise IntegrationError("Slack integration needs a 'bot_token' or 'webhook_url' credential")


# ── Discord ───────────────────────────────────────────────────────────────────

def _discord_webhook_url(credentials: Dict[str, Any]) -> str:
    url = (credentials or {}).get("webhook_url")
    if not url:
        raise IntegrationError("Discord integration is missing a 'webhook_url' credential")
    return url


async def _discord_test(integration: Integration) -> Dict[str, Any]:
    url = _discord_webhook_url(integration.credentials)
    # Discord answers a GET on a valid webhook URL with the webhook's JSON.
    response = await _request("GET", url, provider="discord")
    data = response.json()
    return {"webhook_name": data.get("name"), "channel_id": data.get("channel_id")}


async def _discord_send_message(integration: Integration, content: str) -> Dict[str, Any]:
    url = _discord_webhook_url(integration.credentials)
    await _request(
        "POST",
        url,
        provider="discord",
        json_body={"content": content[:DISCORD_CONTENT_CHAR_LIMIT]},
    )
    return {"ok": True}


# ── Notion ────────────────────────────────────────────────────────────────────

def _notion_headers(credentials: Dict[str, Any]) -> Dict[str, str]:
    token = (credentials or {}).get("token")
    if not token:
        raise IntegrationError("Notion integration is missing a 'token' credential")
    return {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
    }


async def _notion_test(integration: Integration) -> Dict[str, Any]:
    response = await _request(
        "GET",
        f"{NOTION_API}/users/me",
        provider="notion",
        headers=_notion_headers(integration.credentials),
    )
    data = response.json()
    return {"bot": data.get("name")}


def _notion_paragraph_blocks(content: str) -> List[Dict[str, Any]]:
    """Split content into paragraph blocks of at most 2000 chars each."""
    chunks = [
        content[i : i + NOTION_PARAGRAPH_CHAR_LIMIT]
        for i in range(0, len(content), NOTION_PARAGRAPH_CHAR_LIMIT)
    ] or [""]
    return [
        {
            "object": "block",
            "type": "paragraph",
            "paragraph": {"rich_text": [{"type": "text", "text": {"content": chunk}}]},
        }
        for chunk in chunks[:NOTION_MAX_BLOCKS]
    ]


async def _notion_create_page(
    integration: Integration,
    title: str,
    content: str = "",
    parent_page_id: Optional[str] = None,
) -> Dict[str, Any]:
    parent = parent_page_id or (integration.config or {}).get("parent_page_id")
    if not parent:
        raise IntegrationError(
            "Notion integration needs a parent_page_id (in config or action params)"
        )
    payload = {
        "parent": {"page_id": parent},
        "properties": {
            "title": {"title": [{"type": "text", "text": {"content": title[:2000]}}]}
        },
        "children": _notion_paragraph_blocks(content),
    }
    response = await _request(
        "POST",
        f"{NOTION_API}/pages",
        provider="notion",
        headers=_notion_headers(integration.credentials),
        json_body=payload,
    )
    data = response.json()
    return {"id": data.get("id"), "url": data.get("url")}


# ── Dispatchers ───────────────────────────────────────────────────────────────

async def test_integration(integration: Integration) -> Dict[str, Any]:
    """Verify the integration's credentials against the provider's API.

    Returns provider-specific details on success; raises IntegrationError
    (or ValueError for an unknown provider) on failure.
    """
    provider = integration.provider
    if provider == "github":
        return await _github_test(integration)
    if provider == "slack":
        return await _slack_test(integration)
    if provider == "discord":
        return await _discord_test(integration)
    if provider == "notion":
        return await _notion_test(integration)
    raise ValueError(f"Unknown integration provider: {provider}")


async def run_action(integration: Integration, action: str, params: Dict[str, Any]) -> Any:
    """Route an action to the integration's provider.

    Supported actions:
      * github  – test, list_repos, list_prs(repo), summarize_pr(repo, number),
                  create_issue(repo, title, body?)
      * slack   – test, send_message(text, channel?)
      * discord – test, send_message(content)
      * notion  – test, create_page(title, content?, parent_page_id?)

    Raises ValueError for unknown providers/actions or missing params, and
    IntegrationError when the provider call itself fails.
    """
    params = params or {}
    provider = integration.provider

    if action == "test":
        return await test_integration(integration)

    if provider == "github":
        if action == "list_repos":
            return await _github_list_repos(integration)
        if action == "list_prs":
            return await _github_list_prs(integration, str(_require(params, "repo")))
        if action == "summarize_pr":
            try:
                number = int(_require(params, "number"))
            except (TypeError, ValueError):
                raise ValueError("Param 'number' must be an integer")
            return await _github_summarize_pr(
                integration, str(_require(params, "repo")), number
            )
        if action == "create_issue":
            return await _github_create_issue(
                integration,
                str(_require(params, "repo")),
                str(_require(params, "title")),
                str(params.get("body") or ""),
            )
    elif provider == "slack":
        if action == "send_message":
            return await _slack_send_message(
                integration, str(_require(params, "text")), params.get("channel")
            )
    elif provider == "discord":
        if action == "send_message":
            return await _discord_send_message(integration, str(_require(params, "content")))
    elif provider == "notion":
        if action == "create_page":
            return await _notion_create_page(
                integration,
                str(_require(params, "title")),
                str(params.get("content") or ""),
                params.get("parent_page_id"),
            )
    else:
        raise ValueError(f"Unknown integration provider: {provider}")

    raise ValueError(f"Unknown action '{action}' for provider '{provider}'")
