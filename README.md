# JARVIS — Just A Rather Very Intelligent System

A full-stack AI assistant platform: FastAPI backend, Next.js 14 frontend,
multi-agent orchestration, RAG document chat, visual workflow automation, voice,
third-party integrations, team workspaces, and an admin/observability layer.

The whole stack — app, datastores, workers, reverse proxy and monitoring — runs
from a single `docker compose` command.

---

## Table of Contents

- [Quick Start (Docker)](#quick-start-docker)
- [Features](#features)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Demo Mode (no backend)](#demo-mode-no-backend)
- [Local Development (without Docker)](#local-development-without-docker)
- [Make Targets](#make-targets)
- [Using the Platform](#using-the-platform)
- [API Overview](#api-overview)
- [Project Structure](#project-structure)
- [Container Notes](#container-notes)
- [Development Notes](#development-notes)
- [Troubleshooting](#troubleshooting)

---

## Quick Start (Docker)

Requires Docker Desktop (or Docker Engine + Compose v2). Nothing else — no Python,
no Node, no local Postgres.

**1 — Configure**

```bash
git clone https://github.com/aqkprogrammer/jarvis.git
cd jarvis
cp config/.env.example .env
```

Edit `.env` and set these three:

```bash
SECRET_KEY=<paste the output of: openssl rand -hex 32>
ANTHROPIC_API_KEY=sk-ant-...      # or OPENAI_API_KEY / GROQ_API_KEY / GOOGLE_API_KEY
ADMIN_EMAIL=you@example.com       # this account is auto-granted admin on startup
```

Then point the datastore URLs at the compose service names (not `localhost` —
the backend resolves these over the compose network):

```bash
DATABASE_URL=postgresql+asyncpg://jarvis:jarvis_secret@postgres:5432/jarvis
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2
QDRANT_URL=http://qdrant:6333
NEXT_PUBLIC_API_URL=http://localhost
NEXT_PUBLIC_WS_URL=ws://localhost
```

**2 — Build and start**

Run from the repo root. `--env-file` is required: Compose resolves `.env` relative
to the compose file's directory, not your shell's working directory.

```bash
docker compose --env-file .env -f deployment/docker/docker-compose.yml up --build -d
```

Or simply `make docker-up` (it passes `--env-file .env` for you).

First build takes roughly 10 minutes and produces a ~2.5 GB backend image —
`sentence-transformers` pulls in PyTorch. On first use the backend also downloads
the `all-MiniLM-L6-v2` embedding model (~90 MB) inside the container.

**3 — Wait for health, then open the app**

```bash
docker compose --env-file .env -f deployment/docker/docker-compose.yml ps
```

All ten services should report `healthy` (Prometheus and Grafana report `Up`;
they ship no healthcheck). Then open **http://localhost**.

**4 — Create your account**

The login screen is login-only; register once via the API:

```bash
curl -X POST http://localhost/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","username":"you","password":"your-password"}'
```

If the email matches `ADMIN_EMAIL`, restart the backend once to be granted admin:

```bash
docker compose --env-file .env -f deployment/docker/docker-compose.yml restart jarvis-backend
```

### Service URLs

| Service | URL |
|---|---|
| **App (via Nginx)** | **http://localhost** |
| Frontend (direct) | http://localhost:3000 |
| Backend API (direct) | http://localhost:8000 |
| Swagger / ReDoc | http://localhost:8000/docs · `/redoc` |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (`admin` / `admin`) |
| Qdrant dashboard | http://localhost:6333/dashboard |

Postgres (5432), Redis (6379) and Qdrant (6333/6334) are published on `127.0.0.1`
only — reachable from your machine, not from the LAN.

### Everyday commands

```bash
make docker-up        # start (build if needed)
make docker-logs      # tail all logs
make docker-ps        # service status
make docker-down      # stop, keep data
make shell-db         # psql into the database
make shell-backend    # bash inside the backend container
```

To wipe all data volumes: append `-v` to the `down` command.

After changing backend Python code, rebuild that image:

```bash
docker compose --env-file .env -f deployment/docker/docker-compose.yml up -d --build jarvis-backend
```

`NEXT_PUBLIC_*` values are baked into the browser bundle at build time, so
changing them requires `--build` on `jarvis-frontend`.


## Features

### Core AI
- **Multi-provider LLM support** — Anthropic Claude (default `claude-sonnet-4-6`), OpenAI, Groq, Google Gemini, Ollama (local), all behind one `AIProviderFactory`
- **Streaming chat** over WebSocket with reasoning traces (retrieval steps, model, token usage) on every reply
- **RAG document chat** — upload PDF/TXT/MD/CSV/DOCX → automatic chunking + embeddings in Qdrant → attach documents to any message and get cited answers
- **Artifacts panel** — preview HTML/SVG from code blocks in a sandboxed side panel
- **Code execution** — run Python/JavaScript code blocks from chat in an isolated subprocess sandbox (timeouts + output caps)

### Multi-Agent System
Planner, research, coding, browser (Playwright), vision, automation, memory, calendar, email, and security agents built on a ReAct-loop base agent, dispatched by a priority-queue orchestrator. Three memory layers: Redis (short-term), PostgreSQL (long-term), Qdrant (semantic).

> The default Docker image leaves out the browser, desktop-control and local-Whisper
> dependencies, so those specific agents need extra packages — see
> [Container Notes](#container-notes). Everything else in this list works out of the box.

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

The Compose stack runs ten containers:

```
                          browser
                             │  :80
                   ┌─────────▼──────────┐
                   │       NGINX        │   /        → frontend
                   │  (reverse proxy)   │   /api/v1/ → backend
                   └────┬──────────┬────┘   /ws/     → backend (upgrade)
                        │          │
            ┌───────────▼──┐   ┌───▼──────────────┐
            │  Next.js 14  │   │     FastAPI      │
            │   :3000      │   │  :8000  + /ws/*  │
            └──────────────┘   └───┬──────────────┘
                                   │
     ┌──────────────┬──────────────┼──────────────┬────────────────┐
     │              │              │              │                │
┌────▼─────┐  ┌─────▼────┐   ┌─────▼────┐   ┌─────▼─────┐   ┌──────▼──────┐
│ Postgres │  │  Redis   │   │  Qdrant  │   │  Celery   │   │  Celery     │
│  (data)  │  │ (cache/  │   │ (vectors)│   │  worker   │   │  beat       │
│          │  │  broker) │   │          │   │           │   │  (RedBeat)  │
└──────────┘  └──────────┘   └──────────┘   └───────────┘   └─────────────┘

        Prometheus ──scrapes──▶ FastAPI /metrics ──▶ Grafana :3001
```

- The frontend probes `GET /api/v1/health` on startup → live mode if reachable, demo mode otherwise.
- Chat messages are sent over `WS /ws/chat/{conversation_id}` and stream back token by token.
- Workflows and schedules run in-process on asyncio inside the API server; only heavy
  agent tasks route through Celery. Celery beat uses RedBeat, which stores its
  schedule on the broker database.
- Postgres, Redis and Qdrant sit on an internal-only Docker network; the backend,
  frontend, workers, Nginx and the monitoring pair are additionally on an external
  bridge so they can publish ports and reach the internet.

---

## Configuration

Everything is driven by a single `.env` at the repo root — the backend reads it
directly, and Compose interpolates it into the container environment.
`config/.env.example` is the annotated full list. The ones that matter:

| Variable | Required | Purpose |
|---|---|---|
| `SECRET_KEY` | ✅ | JWT signing — `openssl rand -hex 32`. Startup fails in production with the default. |
| `DATABASE_URL` | ✅ | `postgresql+asyncpg://user:pass@host:5432/db` |
| `REDIS_URL` | ✅ | cache + rate limiting |
| `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` / `GROQ_API_KEY` / `GOOGLE_API_KEY`) | ✅ one | at least one LLM provider, or chat returns a provider error |
| `QDRANT_URL` | – | vector store for RAG + semantic memory; those features degrade gracefully without it |
| `ADMIN_EMAIL` | – | auto-grants admin to this account on startup |
| `ENVIRONMENT` | – | `development` (default) builds the schema from the ORM and enables `/docs`; `production` does neither |
| `DEFAULT_AI_PROVIDER` / `DEFAULT_MODEL` | – | defaults: `anthropic` / `claude-sonnet-4-6` |
| `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | – | default to Redis DB 1 / 2 |
| `WEB_CONCURRENCY` | – | gunicorn workers (default 2 in Compose). Each loads PyTorch, so this is the main memory lever. |
| `ENABLE_CODE_EXECUTION` | – | gates the `/execute` sandbox (default `true`) |
| `ELEVENLABS_API_KEY`, `ASSEMBLYAI_API_KEY`, `DEEPGRAM_API_KEY` | – | voice providers |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | – | web push — `npx web-push generate-vapid-keys` |
| `API_BASE_URL` | – | public base used to build webhook and invite URLs |
| `CORS_ORIGINS`, `ALLOWED_HOSTS` | – | comma-separated **or** a JSON array; both forms are accepted |

**Choosing a provider.** `DEFAULT_AI_PROVIDER` selects which provider serves a
request that does not name one, and `DEFAULT_MODEL` selects the model for that
provider. The chat model picker sends an explicit provider alongside the model,
so you can mix providers in one deployment as long as each has a key. Example
for Gemini:

```bash
GOOGLE_API_KEY=...            # the Gemini API key
DEFAULT_AI_PROVIDER=google
DEFAULT_MODEL=gemini-3.6-flash
```

Model ids go stale as vendors retire them — a retired id fails with
`404 ... is no longer available`. List what your key can actually reach with:

```bash
docker compose --env-file .env -f deployment/docker/docker-compose.yml \
  exec jarvis-backend python -c "import google.generativeai as genai; \
from app.core.config import settings; genai.configure(api_key=settings.GOOGLE_API_KEY); \
print([m.name for m in genai.list_models()])"
```

**Frontend URLs.** `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` must be an
**origin**, not a path — `frontend/src/lib/api.ts` appends `/api/v1/...` itself.
Use `http://localhost` / `ws://localhost` behind the Compose Nginx, or
`http://localhost:8000` / `ws://localhost:8000` when running the backend directly.
They are compiled into the browser bundle, so a change needs an image rebuild.

**Host ports.** Override any published port via `.env`: `BACKEND_PORT`,
`FRONTEND_PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `QDRANT_HTTP_PORT`,
`PROMETHEUS_PORT`, `GRAFANA_PORT`, `NGINX_PORT`.

---

## Demo Mode (no backend)

The frontend ships with a complete in-memory demo dataset. If it cannot reach the
backend within a 3-second health probe it switches to demo mode (amber banner) and
every page keeps working — chat with simulated streaming, documents, workflows,
schedules, integrations, workspaces, audit log and the admin dashboard.

```bash
cd frontend
npm ci
npm run dev
```

Open http://localhost:3000 and sign in with the credentials shown on the login
screen (there is an auto-fill button):

| Field | Value |
|---|---|
| Email | `demo@jarvis.ai` |
| Password | `jarvis2025` |

Click **Retry backend** in the banner to switch to live mode once a backend is up.

---

## Local Development (without Docker)

Use this when you want hot-reload on the Python side. Requires Python 3.11+ and
Node 18+.

**1 — Infrastructure.** Start just the datastores in Docker and leave the app on
your host:

```bash
docker compose --env-file .env -f deployment/docker/docker-compose.yml up -d postgres redis qdrant
```

**2 — Point `.env` at localhost** (these override the compose-network hostnames):

```bash
DATABASE_URL=postgresql+asyncpg://jarvis:jarvis_secret@localhost:5432/jarvis
REDIS_URL=redis://localhost:6379/0
QDRANT_URL=http://localhost:6333
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

**3 — Backend:**

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
make dev-backend
```

Run it from the **repo root**, not from `backend/`. Modules are launched as
`backend.app.*` but import each other as `app.*`, so both the repo root and
`backend/` must be importable — `make dev-backend` sets `PYTHONPATH=.:backend`
for you. The raw equivalent is:

```bash
PYTHONPATH=.:backend uvicorn backend.app.main:app --reload --port 8000
```

Tables are created from the ORM on first startup (`create_all`, dev only).
Verify with `curl http://localhost:8000/api/v1/health` and open
http://localhost:8000/docs.

**4 — Frontend:**

```bash
cd frontend
npm ci
npm run dev
```

**5 — Optional workers.** The cron scheduler for workflows and prompts runs
in-process inside the API server, so these are only needed for heavy agent tasks:

```bash
make dev-worker    # Celery worker
make dev-beat      # Celery beat (RedBeat scheduler)
```

`make dev` starts the backend and frontend together.

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
| `make docker-up` / `make docker-down` / `make docker-logs` / `make docker-ps` | Compose stack controls (all pass `--env-file .env`) |
| `make build` | Build both Docker images |
| `make shell-backend` / `make shell-db` | Shell into the backend container / psql |
| `make db-reset` | Drop + recreate dev database |
| `make env-check` | Verify required env vars are set |
| `make help` | List everything |

---

## Using the Platform

- **Chat + RAG** — upload files on the **Documents** page, then in chat click the paperclip to attach them; answers cite sources and show a collapsible REASONING trace. HTML/SVG code blocks get a **Preview** button (artifact panel); Python/JS blocks get **Run**.
- **Workflows** — build pipelines on the **Workflows** page (trigger → agent → condition → output), save, hit **Run**, watch per-node results in the drawer.
- **Schedules** — cron presets or custom expressions targeting a workflow or a raw prompt; toggle, run-now, and see last/next run.
- **API keys** — Settings → API Keys → generate; then:
  ```bash
  curl -X POST http://localhost/api/v1/chat \
    -H "X-API-Key: jrv_..." -H "Content-Type: application/json" \
    -d '{"message": "Hello JARVIS", "stream": false}'
  ```
  (use `http://localhost:8000` instead when running the backend directly)
- **Integrations** — connect GitHub (PAT with `repo` scope) to get repo browsing + AI PR summaries; Slack/Discord/Notion for messaging and pages.
- **Webhooks** — *Incoming*: create a trigger linked to a workflow and POST anything to the generated `/api/v1/hooks/{token}` URL. *Outgoing*: subscribe a URL to events; payloads are HMAC-SHA256 signed (`X-Jarvis-Signature`) when you set a secret.
- **Workspaces** — create a team, copy invite links, share conversations; online members show in the header.
- **Admin** — visible to admin users: platform stats, user activation, admin grants, per-user monthly token quotas (empty = unlimited).
- **PWA** — in Chrome/Edge: Install app from the address bar; works offline with the demo shell.

---

## API Overview

Interactive docs: **Swagger** http://localhost:8000/docs · **ReDoc** http://localhost:8000/redoc
(both are disabled when `ENVIRONMENT=production`). Routes are served under
`/api/v1`, and through Nginx the prefix is preserved — `http://localhost/api/v1/...`.

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

## Container Notes

Details worth knowing before you change the deployment.

- **Schema provisioning.** The backend runs with `ENVIRONMENT=development`, so
  SQLAlchemy's `create_all()` builds the schema from the ORM models on startup.
  `database/schemas/*.sql` is deliberately **not** mounted as a Postgres init
  script — it has drifted from the models (UUID vs. integer primary keys, missing
  `is_superuser` and `monthly_token_quota`). Reconcile that SQL, or generate an
  Alembic baseline, before switching to `ENVIRONMENT=production`.
- **Backend dependencies.** The image installs
  `deployment/docker/requirements.backend.txt`, not `backend/requirements.txt`.
  It omits packages that cannot work headless (`pyautogui`, `mss`) or that
  duplicate an installed capability (`easyocr`, `chromadb`, `openai-whisper`,
  `playwright`); the file header records each exclusion and why. Add them back
  there if you need those agents. Torch is installed from the CPU wheel index —
  the default aarch64 wheels drag in ~4 GB of CUDA libraries.
- **Import path.** The image sets `PYTHONPATH=/app:/app/backend` for the same
  `backend.app.*` vs `app.*` reason described under local development.
- **Nginx.** Compose mounts `deployment/nginx/nginx.local.conf` (HTTP only), which
  preserves the `/api` prefix the backend actually serves on and resolves upstreams
  through Docker's DNS at request time so restarting a container doesn't strand
  Nginx on a stale IP. The production `nginx.conf` redirects `:80 → :443` and needs
  certificates under `/etc/nginx/certs`; switch to it with `NGINX_CONF=nginx.conf`
  once you have TLS.
- **Networks.** `jarvis-internal` is marked `internal: true`. Docker configures no
  NAT for such a network, so any service that publishes a host port or calls an
  external API must *also* be attached to `jarvis-external`.
- **Known gap.** The sidebar's **Agents** entry points at `/agents`, for which no
  page exists under `frontend/src/app/(dashboard)/` — it renders a 404. The backend
  endpoint (`GET /api/v1/agents`) and the `AgentStatus` component are both present
  and unused, so that page still needs to be built. Every other sidebar destination
  works against the live backend.

---

## Development Notes

- **Verification gates**: `python3 -m compileall backend/app` · `cd frontend && npx tsc --noEmit && npx next build`. The frontend Docker build runs `tsc` as part of `next build`, so a type error fails the image build.
- **Import path**: backend modules are launched as `backend.app.*` but import each other as `app.*`. Anything that starts them must put both the repo root and `backend/` on `PYTHONPATH` (`make dev-backend` and the Docker image both do).
- **Demo-mode rule**: every new method in `frontend/src/lib/api.ts` must be mirrored in `mockApi.ts` (+ data in `mockData.ts`) so the app keeps working offline.
- **Migrations**: dev uses ORM `create_all` on startup. For production, generate the initial Alembic revision from the models: `alembic revision --autogenerate -m "initial"` then `alembic upgrade head` (config at `alembic.ini`, env in `database/migrations/`).
- **Schema files vs ORM**: `database/schemas/*.sql` are reference-style (UUID ids) and predate the ORM's integer PKs — don't provision from them directly; the ORM is the source of truth.
- **WebSocket protocol**: client sends `{"type":"message","content":...,"model":...,"document_ids":[...]}` to `/ws/chat/{id}?token=JWT`; server streams `{"type":"delta","delta":"..."}` frames and finishes with `{"type":"done","message_id":...}`.

---

## Troubleshooting

First stop for anything Docker-related:

```bash
docker compose --env-file .env -f deployment/docker/docker-compose.yml ps
docker compose --env-file .env -f deployment/docker/docker-compose.yml logs jarvis-backend
```

| Symptom | Cause / fix |
|---|---|
| `required variable SECRET_KEY is missing a value` | You ran `docker compose` without `--env-file .env`, or from a directory where Compose can't see it. Run from the repo root with the flag, or use `make docker-up`. |
| `SECRET_KEY` error on backend startup | `ENVIRONMENT=production` with the default key — set a real one (`openssl rand -hex 32`) |
| Amber "DEMO MODE" banner with the backend running | The browser can't reach `NEXT_PUBLIC_API_URL`. Check `curl http://localhost/api/v1/health`, then click **Retry backend**. Remember these URLs are baked in at build time — changing them needs `--build`. |
| `502 Bad Gateway` from Nginx | The backend is still starting (give it ~40 s) or crash-looping — check its logs. |
| Chat returns a provider error on the first message | No LLM key in `.env`, or `DEFAULT_AI_PROVIDER` names a provider you have no key for. Fix `.env`, then `up -d jarvis-backend celery-worker`. |
| `404 ... model is no longer available` | The configured `DEFAULT_MODEL` was retired by the vendor — list current ids with the snippet under [Configuration](#configuration). |
| `429 You exceeded your current quota` | Provider rate limit, not a JARVIS error. Gemini quotas are per model, so switching model in the chat picker usually works immediately. |
| Chat replies never stream | WebSocket blocked. Verify the upgrade reaches `/ws/chat/{id}?token=...`; the bundled Nginx config already forwards the upgrade headers. |
| Document upload stuck "processing" | Qdrant unreachable (`QDRANT_URL`) or an unsupported file type — check the document's error chip |
| "Run" on a JS code block returns 400 | Node.js isn't available to the backend (`node -e` is the JS sandbox); it is not installed in the backend image |
| HTTP 429 on chat | Monthly token quota exceeded — an admin can raise or clear it in Admin → Users |
| Admin item missing from the sidebar | The account isn't a superuser. Set `ADMIN_EMAIL` to its email and restart the backend. |
| `/agents` shows a 404 | Known gap — that page was never built; see [Container Notes](#container-notes) |
| Ports already in use | 80 (Nginx), 3000, 8000, 5432, 6379, 6333, 9090, 3001. Override any of them via the `*_PORT` variables in `.env`. |
| Backend OOM-killed during heavy use | Each gunicorn worker loads PyTorch. Lower `WEB_CONCURRENCY`, or raise Docker Desktop's memory limit. |

---

## License

MIT
