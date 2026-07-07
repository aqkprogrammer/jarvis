# JARVIS — Just A Rather Very Intelligent System

A production-ready, full-stack AI assistant platform: FastAPI backend, Next.js 14 frontend, multi-agent orchestration, RAG document chat, visual workflow automation, voice, integrations, team workspaces, and a complete admin/observability layer — all deployable with Docker.

**Try it with zero setup:** the frontend ships with a full demo mode. If the backend isn't running, it automatically falls back to realistic static data — every page works offline.

```
Demo login →  demo@jarvis.ai / jarvis2025
```

---

## Table of Contents

- [Quick Start (60 seconds, demo mode)](#quick-start-60-seconds-demo-mode)
- [Features](#features)
- [Architecture](#architecture)
- [Full Local Setup (live backend)](#full-local-setup-live-backend)
- [Docker (full stack)](#docker-full-stack)
- [Make Targets](#make-targets)
- [Environment Variables](#environment-variables)
- [Using the Platform](#using-the-platform)
- [API Overview](#api-overview)
- [Project Structure](#project-structure)
- [Development Notes](#development-notes)
- [Troubleshooting](#troubleshooting)

---

## Quick Start (60 seconds, demo mode)

No database, no API keys, no backend — just Node 18+:

```bash
git clone https://github.com/aqkprogrammer/jarvis.git
cd jarvis/frontend
npm install --legacy-peer-deps
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app detects the backend is offline (3-second health probe), switches to **demo mode** (amber banner), and shows the demo credentials on the login screen with an auto-fill button:

| Field | Value |
|---|---|
| Email | `demo@jarvis.ai` |
| Password | `jarvis2025` |

Everything works against in-memory demo data: chat (with simulated streaming replies and reasoning traces), documents, workflows, schedules, integrations, workspaces, audit log, and the admin dashboard (the demo user is an admin). Click **Retry backend** in the banner any time to switch to live mode.

---

## Features

### Core AI
- **Multi-provider LLM support** — Anthropic Claude (default `claude-sonnet-4-6`), OpenAI, Groq, Google Gemini, Ollama (local), all behind one `AIProviderFactory`
- **Streaming chat** over WebSocket with reasoning traces (retrieval steps, model, token usage) on every reply
- **RAG document chat** — upload PDF/TXT/MD/CSV/DOCX → automatic chunking + embeddings in Qdrant → attach documents to any message and get cited answers
- **Artifacts panel** — preview HTML/SVG from code blocks in a sandboxed side panel
- **Code execution** — run Python/JavaScript code blocks from chat in an isolated subprocess sandbox (timeouts + output caps)

### Multi-Agent System
Planner, research, coding, browser (Playwright), vision, automation, memory, calendar, email, and security agents built on a ReAct-loop base agent, dispatched by a priority-queue orchestrator. Three memory layers: Redis (short-term), PostgreSQL (long-term), Qdrant (semantic).

### Automation
- **Visual workflow builder** — drag-and-drop canvas (React Flow): trigger → agent → condition → output nodes, per-node results, run history
- **Scheduled agents** — cron schedules targeting workflows or prompts, with live next-run preview and run-now
- **User API keys** — `jrv_...` keys (SHA-256 hashed at rest) for programmatic access via `X-API-Key`

### Integrations
- **GitHub** — browse repos, list PRs, one-click AI PR summaries, create issues
- **Slack / Discord / Notion** — send messages, create pages
- **Incoming webhooks** — public tokenized URLs that trigger workflows from any external system
- **Outgoing webhooks** — HMAC-SHA256-signed event notifications (workflow/schedule events)

### Collaboration & Mobile
- **Workspaces** — invite by email with tokenized links, admin/member roles, share conversations
- **Real-time presence** — live online indicators over WebSocket
- **PWA** — installable, offline shell, service worker caching, push scaffolding (VAPID)

### Admin & Observability
- **Cost tracker** — per-request token + USD cost across providers, monthly quotas (HTTP 429 on breach), daily/model/conversation breakdowns
- **Audit log** — every sensitive action recorded and searchable
- **Admin dashboard** — platform stats, user management, quota editing
- **Voice** — STT (Groq Whisper / local Whisper / AssemblyAI / Deepgram) + TTS (ElevenLabs / OpenAI / Piper), wake word

---

## Architecture

```
                    ┌──────────────────────────────┐
                    │      NGINX (reverse proxy)    │   ← Docker mode only
                    └───────────────┬──────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
      ┌───────▼───────┐    ┌───────▼────────┐    ┌───────▼───────┐
      │  Next.js 14    │    │    FastAPI      │    │  WebSockets    │
      │  (frontend)    │───▶│  /api/v1/*      │    │  /ws/chat/{id} │
      │  :3000         │    │  :8000          │    │  /ws/presence  │
      └───────────────┘    └───────┬────────┘    └───────────────┘
                                    │
        ┌──────────────┬────────────┼────────────┬──────────────┐
        │              │            │            │              │
  ┌─────▼─────┐ ┌──────▼─────┐ ┌────▼────┐ ┌─────▼─────┐ ┌─────▼─────┐
  │ PostgreSQL │ │   Redis    │ │ Qdrant  │ │  Celery   │ │ Scheduler │
  │  (data)   │ │ (cache/mq) │ │(vectors)│ │ (workers) │ │ (asyncio) │
  └───────────┘ └────────────┘ └─────────┘ └───────────┘ └───────────┘
```

- The frontend probes `GET /api/v1/health` on startup → live mode if reachable, demo mode otherwise.
- Chat messages are sent over `WS /ws/chat/{conversation_id}` and stream back token by token.
- Workflows/schedules run in-process (asyncio); heavy agent tasks can route through Celery.

---

## Full Local Setup (live backend)

### Prerequisites

| Tool | Version | Required for |
|---|---|---|
| Python | 3.11+ | backend |
| Node.js | 18+ | frontend |
| PostgreSQL | 15+ | backend (required) |
| Redis | 7+ | backend (required) |
| Qdrant | latest | RAG + semantic memory (optional but recommended) |
| Docker | latest | easiest way to run the three services above |

### 1. Clone + environment

```bash
git clone https://github.com/aqkprogrammer/jarvis.git
cd jarvis
cp config/.env.example .env
```

Edit `.env` — the minimum for a working live backend:

```bash
DATABASE_URL=postgresql+asyncpg://jarvis:jarvis@localhost:5432/jarvis_db
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=$(openssl rand -hex 32)     # paste the value, don't leave the command
ANTHROPIC_API_KEY=sk-ant-...           # or OPENAI_API_KEY / GROQ_API_KEY / GOOGLE_API_KEY
QDRANT_URL=http://localhost:6333       # optional; RAG/memory degrade gracefully without it
ADMIN_EMAIL=you@example.com            # this account is auto-granted admin on startup
```

### 2. Start infrastructure (one-liners via Docker)

```bash
docker run -d --name jarvis-pg    -e POSTGRES_USER=jarvis -e POSTGRES_PASSWORD=jarvis -e POSTGRES_DB=jarvis_db -p 5432:5432 postgres:15-alpine
docker run -d --name jarvis-redis -p 6379:6379 redis:7-alpine
docker run -d --name jarvis-qdrant -p 6333:6333 qdrant/qdrant   # optional
```

### 3. Backend

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

cd backend
uvicorn app.main:app --reload --port 8000
```

**Tables are created automatically on first startup** (SQLAlchemy `create_all` in dev). The raw SQL files in `database/schemas/` are reference documentation, not the boot path; Alembic scaffolding exists for production migrations (see [Development Notes](#development-notes)).

Verify: [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs) (Swagger) and `curl http://localhost:8000/api/v1/health` → `{"status":"ok"}`.

### 4. Frontend

```bash
cd frontend
npm install --legacy-peer-deps
cp .env.local.example .env.local 2>/dev/null || printf 'NEXT_PUBLIC_API_URL=http://localhost:8000\nNEXT_PUBLIC_WS_URL=ws://localhost:8000\n' > .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the banner should NOT appear (live mode).

### 5. Create your account

The login page is login-only; register via the API once:

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "username": "you", "password": "your-password"}'
```

If `ADMIN_EMAIL` in `.env` matches, this account becomes an **admin** on the next backend restart (Admin item appears in the sidebar).

### 6. Optional workers

```bash
# Celery worker (heavy agent tasks) — from repo root, venv active
make dev-worker
# Celery beat (periodic jobs)
make dev-beat
```

The built-in schedule runner (cron workflows/prompts) needs no extra process — it runs inside the API server.

---

## Docker (full stack)

Runs everything: PostgreSQL, Redis, Qdrant, backend, frontend, Celery worker + beat, Nginx, Prometheus, Grafana.

```bash
cp config/.env.example .env    # fill in SECRET_KEY + at least one AI key
docker compose -f deployment/docker/docker-compose.yml up --build -d
```

| Service | URL |
|---|---|
| App (via Nginx) | http://localhost |
| Backend API docs | http://localhost/api/v1/docs |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |

Stop: `docker compose -f deployment/docker/docker-compose.yml down` (add `-v` to wipe data).

---

## Make Targets

| Target | What it does |
|---|---|
| `make setup` | Full first-time setup: venv, backend + frontend deps |
| `make dev` | Backend + frontend dev servers together |
| `make dev-backend` / `make dev-frontend` | Each side alone |
| `make dev-worker` / `make dev-beat` | Celery worker / beat scheduler |
| `make test` / `make test-backend` / `make test-frontend` | Test suites |
| `make lint` / `make format` / `make typecheck` | Ruff + ESLint / formatters / mypy + tsc |
| `make migrate` / `make migrate-create` | Alembic upgrade / autogenerate revision |
| `make docker-up` / `make docker-down` / `make docker-logs` | Compose stack controls |
| `make db-reset` | Drop + recreate dev database |
| `make env-check` | Verify required env vars are set |
| `make help` | List everything |

---

## Environment Variables

Backend reads `.env` at the repo root (see `config/.env.example` for the full annotated list). The important ones:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql+asyncpg://user:pass@host:5432/db` |
| `REDIS_URL` | ✅ | cache, Celery broker |
| `SECRET_KEY` | ✅ | JWT signing — `openssl rand -hex 32` (startup fails in production with the default) |
| `ANTHROPIC_API_KEY` (or OpenAI/Groq/Google) | ✅ one | at least one LLM provider |
| `QDRANT_URL` | – | vector DB for RAG + semantic memory (features degrade without it) |
| `ADMIN_EMAIL` | – | auto-grant admin to this account on startup |
| `DEFAULT_MODEL` / `DEFAULT_PROVIDER` | – | defaults: `claude-sonnet-4-6` / `anthropic` |
| `ENABLE_CODE_EXECUTION` | – | gate the `/execute` sandbox (default `true`) |
| `ELEVENLABS_API_KEY`, `ASSEMBLYAI_API_KEY`, `DEEPGRAM_API_KEY` | – | voice providers |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | – | web push (`npx web-push generate-vapid-keys`) |
| `API_BASE_URL` | – | public base used in webhook/invite URLs (default `http://localhost:8000`) |

Frontend reads `frontend/.env.local`:

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | REST base |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000` | WebSocket base |

---

## Using the Platform

- **Chat + RAG** — upload files on the **Documents** page, then in chat click the paperclip to attach them; answers cite sources and show a collapsible REASONING trace. HTML/SVG code blocks get a **Preview** button (artifact panel); Python/JS blocks get **Run**.
- **Workflows** — build pipelines on the **Workflows** page (trigger → agent → condition → output), save, hit **Run**, watch per-node results in the drawer.
- **Schedules** — cron presets or custom expressions targeting a workflow or a raw prompt; toggle, run-now, and see last/next run.
- **API keys** — Settings → API Keys → generate; then:
  ```bash
  curl -X POST http://localhost:8000/api/v1/chat \
    -H "X-API-Key: jrv_..." -H "Content-Type: application/json" \
    -d '{"message": "Hello JARVIS", "stream": false}'
  ```
- **Integrations** — connect GitHub (PAT with `repo` scope) to get repo browsing + AI PR summaries; Slack/Discord/Notion for messaging and pages.
- **Webhooks** — *Incoming*: create a trigger linked to a workflow and POST anything to the generated `/api/v1/hooks/{token}` URL. *Outgoing*: subscribe a URL to events; payloads are HMAC-SHA256 signed (`X-Jarvis-Signature`) when you set a secret.
- **Workspaces** — create a team, copy invite links, share conversations; online members show in the header.
- **Admin** — visible to admin users: platform stats, user activation, admin grants, per-user monthly token quotas (empty = unlimited).
- **PWA** — in Chrome/Edge: Install app from the address bar; works offline with the demo shell.

---

## API Overview

Interactive docs: **Swagger** `http://localhost:8000/api/v1/docs` · **ReDoc** `/api/v1/redoc`

| Area | Endpoints |
|---|---|
| Auth | `POST /api/v1/auth/register` · `/login` · `/refresh` · `GET /me` |
| Chat | `POST /api/v1/chat` (REST, streaming or not) · `WS /ws/chat/{conversation_id}` · conversations CRUD under `/api/v1/chat/conversations` |
| Documents (RAG) | `POST /api/v1/documents/upload` · `GET /` · `POST /search` |
| Execution | `POST /api/v1/execute` |
| Memory | `GET/POST /api/v1/memory` + `/search` |
| Workflows | `GET/POST /api/v1/workflows` · `POST /{id}/run` · `GET /{id}/runs` |
| Schedules | `GET/POST /api/v1/schedules` · `/toggle` · `/run-now` |
| API keys | `GET/POST/DELETE /api/v1/apikeys` |
| Integrations | `GET/POST /api/v1/integrations` · `POST /{id}/action` |
| Webhooks | `/api/v1/webhooks/triggers` · `/outgoing` · public `POST /api/v1/hooks/{token}` |
| Workspaces | `/api/v1/workspaces` + members/invites/share · `WS /ws/presence` |
| Usage & costs | `GET /api/v1/usage/summary` · `/daily` · `/by-model` · `/top-conversations` |
| Audit | `GET /api/v1/audit` |
| Admin | `GET /api/v1/admin/stats` · `/users` · `/usage/daily` · `/audit` |
| Voice | `POST /api/v1/voice/transcribe` · `/synthesize` |
| Health | `GET /api/v1/health` (instant) · `GET /health` (deep: DB + Redis) |

---

## Project Structure

```
Jarvis/
├── backend/app/
│   ├── api/v1/endpoints/     # 19 routers: auth, chat, documents, workflows, admin…
│   ├── api/v1/websockets/    # chat + presence
│   ├── core/                 # config, security (JWT + API keys), database
│   ├── models/               # 17 SQLAlchemy models
│   ├── schemas/              # Pydantic contracts
│   ├── services/             # ai_provider, chat, documents, workflows, scheduler,
│   │                         # integrations, webhooks, usage, audit, memory, celery
│   └── workers/              # Celery tasks
├── frontend/src/
│   ├── app/(dashboard)/      # 13 pages: chat, documents, workflows, schedules,
│   │                         # integrations, workspace, memory, tasks, analytics,
│   │                         # audit, admin, settings
│   ├── components/           # chat, workflows, integrations, dashboard, ui…
│   ├── lib/                  # api.ts, mockApi.ts (demo mode), websocket.ts, cron.ts
│   ├── stores/               # Zustand: auth, chat, ui, workspace, artifact
│   └── hooks/                # useChat, useVoice, usePresence
├── agents/                   # ReAct agents (planner, research, coding, browser…)
├── memory/                   # short-term / long-term / semantic / episodic layers
├── voice/                    # STT, TTS, wake word
├── core/                     # orchestrator, event bus, security manager
├── database/schemas/         # reference SQL (001–006)
├── deployment/               # docker compose, nginx, prometheus
├── config/.env.example       # every env var, annotated
└── Makefile
```

---

## Development Notes

- **Verification gates**: `python3 -m compileall backend/app` · `cd frontend && npx tsc --noEmit && npx next build`
- **Demo-mode rule**: every new method in `frontend/src/lib/api.ts` must be mirrored in `mockApi.ts` (+ data in `mockData.ts`) so the app keeps working offline.
- **Migrations**: dev uses ORM `create_all` on startup. For production, generate the initial Alembic revision from the models: `alembic revision --autogenerate -m "initial"` then `alembic upgrade head` (config at `alembic.ini`, env in `database/migrations/`).
- **Schema files vs ORM**: `database/schemas/*.sql` are reference-style (UUID ids) and predate the ORM's integer PKs — don't provision from them directly; the ORM is the source of truth.
- **WebSocket protocol**: client sends `{"type":"message","content":...,"model":...,"document_ids":[...]}` to `/ws/chat/{id}?token=JWT`; server streams `{"type":"delta","delta":"..."}` frames and finishes with `{"type":"done","message_id":...}`.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Amber "DEMO MODE" banner with backend running | Backend not reachable at `NEXT_PUBLIC_API_URL` — check `curl http://localhost:8000/api/v1/health`, then click **Retry backend** |
| `SECRET_KEY` error on startup | You're in `ENVIRONMENT=production` with the default key — set a real one |
| Chat replies never stream | WebSocket blocked — verify `ws://localhost:8000/ws/chat/1?token=...` isn't being stripped by a proxy; in Docker, Nginx handles the upgrade headers |
| Document upload stuck "processing" | Qdrant not running (`QDRANT_URL`) or unsupported file type — check the document's error chip |
| "Run" on JS code returns 400 | Node.js isn't installed on the backend host (`node -e` is the JS sandbox) |
| HTTP 429 on chat | Monthly token quota exceeded — an admin can raise/clear it in Admin → users |
| Slack/GitHub actions fail | Re-run **Test connection** on the Integrations page; check token scopes (`repo` for GitHub) |
| Ports in use | 3000 (frontend), 8000 (backend), 5432/6379/6333 (infra) — stop conflicting services |

---

## License

MIT
