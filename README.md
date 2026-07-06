# JARVIS — Just A Rather Very Intelligent System

A production-ready, full-stack AI assistant platform built with FastAPI, Next.js 14, and a multi-agent architecture. JARVIS provides a powerful conversational AI interface with voice capabilities, persistent memory, browser automation, vision processing, and an extensible plugin system — all deployable via Docker.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
  - [Local Development](#local-development)
  - [Docker (Full Stack)](#docker-full-stack)
- [Environment Variables](#environment-variables)
- [Demo Mode](#demo-mode)
- [API Reference](#api-reference)
- [Agent System](#agent-system)
- [Memory System](#memory-system)
- [Voice System](#voice-system)
- [Deployment](#deployment)

---

## Features

### Core AI
- **Multi-provider LLM support** — Anthropic Claude (default), OpenAI GPT-4o, Groq, Google Gemini, Ollama (local)
- **Streaming responses** via WebSocket for real-time token-by-token output
- **Context-aware conversations** with full message history
- **RAG document chat** — upload PDF/TXT/MD/CSV/DOCX, automatic chunking + embedding into Qdrant, attach documents to any chat message and get cited answers
- **Artifacts panel** — preview HTML/SVG output from code blocks in a sandboxed side panel with copy/download
- **Code execution sandbox** — run Python/JavaScript code blocks directly from chat with isolated subprocess execution, timeouts, and output capture
- **Reasoning traces** — collapsible step-by-step trace (retrieval, model, token usage) on every assistant message

### Multi-Agent System
| Agent | Role |
|---|---|
| **Orchestrator** | Priority-queue dispatcher — routes tasks to the best available agent |
| **Planner** | Breaks complex goals into ordered sub-tasks |
| **Research** | Web search + document analysis |
| **Coding** | Code generation, review, debugging, test writing |
| **Browser** | Headless Playwright automation |
| **Vision** | Image analysis, OCR, screenshot understanding |
| **Automation** | System-level task execution |
| **Memory** | Stores and retrieves episodic + semantic memories |
| **Calendar** | Google Calendar read/write |
| **Email** | Gmail/IMAP read/compose |
| **Security** | Input sanitisation, threat detection |

### Memory Layers
- **Short-term** — Redis session cache (per-conversation context)
- **Long-term** — PostgreSQL persistent storage
- **Semantic** — Qdrant/Chroma vector database for similarity search

### Voice
- **STT**: Groq Whisper, local OpenAI Whisper, AssemblyAI, Deepgram
- **TTS**: ElevenLabs, OpenAI TTS, Piper (offline)
- **Wake word** detection
- **Continuous listening** mode

### Frontend
- **Dashboard** with real-time analytics
- **Chat** interface with streaming, markdown rendering, code highlighting
- **Memory browser** — search, filter, create, delete memories
- **Task manager** — create and track long-running agent tasks
- **Agent monitor** — live status of all agents
- **Settings** — API keys, voice configuration, appearance

### Automation Platform
- **Visual workflow builder** — drag-and-drop pipeline canvas (React Flow): trigger → agent → condition → output nodes, per-node run results with durations
- **Scheduled agents** — cron-style schedules ("summarise my inbox every weekday at 9am") targeting workflows or prompts, with run history and next-run preview
- **User API keys** — generate `jrv_...` keys in Settings, call chat/RAG endpoints programmatically via `X-API-Key` header

### Integrations
- **GitHub** — connect with a PAT, browse repos, list open PRs, one-click AI PR summaries, create issues from JARVIS
- **Slack & Discord** — send messages via bot token or webhook, quick-send panel
- **Notion** — create pages from chat or workflows
- **Incoming webhooks** — public `hooks/{token}` URLs that trigger workflows from any external system
- **Outgoing webhooks** — HMAC-SHA256 signed event notifications (workflow.completed/failed, schedule.completed) to any URL

### Collaboration & Mobile
- **Multi-user workspaces** — create workspaces, invite by email with tokenized links, admin/member roles, share conversations with your team
- **Real-time presence** — live online indicators for workspace members via WebSocket
- **PWA** — installable app with offline shell, service worker caching, and push notification scaffolding (VAPID)

### Infrastructure
- **Authentication** — JWT access + refresh tokens, bcrypt passwords
- **Background jobs** — Celery + Redis with celery-redbeat scheduler
- **Observability** — Prometheus metrics, structured logging
- **Rate limiting**, request validation, CORS
- **Docker Compose** full-stack deployment with Nginx reverse proxy

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      NGINX (reverse proxy)               │
└──────────────────┬──────────────────────────────────────┘
                   │
       ┌───────────┴───────────┐
       │                       │
┌──────▼──────┐       ┌────────▼────────┐
│  Next.js 14  │       │   FastAPI       │
│  (frontend)  │       │   (backend)     │
│  Port 3000   │       │   Port 8000     │
└─────────────┘       └────────┬────────┘
                               │
              ┌────────────────┼──────────────────┐
              │                │                  │
      ┌───────▼───┐   ┌────────▼───┐   ┌──────────▼───┐
      │ PostgreSQL │   │   Redis    │   │    Qdrant    │
      │  (data)   │   │ (cache/mq) │   │  (vectors)   │
      └───────────┘   └────────────┘   └──────────────┘
```

**Request flow:**
1. Browser → Nginx → Next.js (SSR/static assets)
2. API calls → Nginx → FastAPI (`/api/v1/*`)
3. Real-time chat → WebSocket (`/ws/chat/{conversation_id}`)
4. Long-running agent tasks → Celery worker (via Redis broker)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion |
| State management | Zustand + Immer |
| API client | TanStack Query (React Query) + Axios |
| Backend | FastAPI (Python 3.11), async SQLAlchemy, Pydantic v2 |
| Database | PostgreSQL 15 |
| Cache / Queue | Redis 7 |
| Vector DB | Qdrant |
| Task queue | Celery + celery-redbeat |
| Migrations | Alembic |
| Auth | JWT (python-jose), bcrypt (passlib) |
| AI SDKs | anthropic, openai, groq, google-generativeai |
| Voice (STT) | groq-whisper, openai-whisper, assemblyai, deepgram |
| Voice (TTS) | elevenlabs, openai-tts, piper-tts |
| Browser automation | Playwright |
| Vision / OCR | Pillow, EasyOCR, pdfplumber |
| Monitoring | Prometheus, prometheus-fastapi-instrumentator |
| Reverse proxy | Nginx |
| Containers | Docker + Docker Compose |

---

## Project Structure

```
Jarvis/
├── backend/                  # FastAPI application
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── endpoints/    # auth, chat, memory, tasks, agents, voice
│   │   │   └── websockets/   # real-time chat WebSocket
│   │   ├── core/             # config, security, database
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/         # AI provider, memory, celery, tasks
│   │   └── workers/          # Celery task definitions
│   └── requirements.txt
├── frontend/                 # Next.js 14 application
│   └── src/
│       ├── app/              # App Router pages
│       │   ├── (dashboard)/  # Protected dashboard pages
│       │   └── page.tsx      # Login page
│       ├── components/       # Reusable UI components
│       ├── hooks/            # Custom React hooks (useVoice, useWebSocket…)
│       ├── lib/              # api.ts, mockApi.ts, mockData.ts, backendCheck.ts
│       ├── stores/           # Zustand stores (auth, chat, ui, agents…)
│       └── types/            # TypeScript interfaces
├── agents/                   # Agent implementations
│   ├── base/                 # BaseAgent + ReAct loop
│   ├── planner/ research/ coding/ browser/ vision/
│   ├── automation/ memory/ calendar/ email/ security/
│   └── orchestrator (in core/)
├── memory/                   # Memory layer implementations
│   ├── short_term/           # Redis session memory
│   ├── long_term/            # PostgreSQL memory
│   ├── semantic/             # Qdrant vector store
│   └── episodic/             # Episodic memory (PostgreSQL)
├── voice/                    # Voice pipeline
│   ├── stt/                  # Speech-to-text providers
│   ├── tts/                  # Text-to-speech providers
│   └── audio/                # Audio manager + wake word
├── core/
│   ├── orchestrator/         # Agent orchestrator with priority queue
│   ├── event_bus/            # Async event bus
│   └── security/             # Security manager
├── plugins/                  # Plugin system
├── database/
│   ├── schemas/              # Raw SQL schema (001_initial.sql)
│   └── migrations/           # Alembic migration env
├── deployment/
│   ├── docker/               # Dockerfiles + docker-compose.yml
│   ├── nginx/                # Nginx config
│   └── monitoring/           # Prometheus config
├── config/
│   └── .env.example          # All environment variables documented
├── scripts/
│   ├── setup.sh              # One-shot environment setup
│   └── dev.sh                # Start all dev services
├── Makefile                  # Developer shortcuts
└── alembic.ini
```

---

## Prerequisites

| Tool | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| Docker + Docker Compose | Latest |
| PostgreSQL | 15+ (or via Docker) |
| Redis | 7+ (or via Docker) |

---

## Quick Start

### Local Development

**1. Clone and configure**

```bash
git clone https://github.com/aqkprogrammer/jarvis.git
cd jarvis
cp config/.env.example .env
# Edit .env and add your API keys (see Environment Variables below)
```

**2. Backend setup**

```bash
# Create and activate virtual environment
python3.11 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r backend/requirements.txt

# Run database migrations
alembic upgrade head

# Start FastAPI server
cd backend
uvicorn app.main:app --reload --port 8000
```

**3. Frontend setup**

```bash
cd frontend
npm install
npm run dev
# Runs at http://localhost:3000
```

**4. Background worker** (optional — required for long-running agent tasks)

```bash
# In a separate terminal, from project root
celery -A backend.app.services.celery_app.celery worker --loglevel=info
```

**5. Open the app**

Navigate to [http://localhost:3000](http://localhost:3000)

---

### Docker (Full Stack)

Run the entire stack (backend, frontend, PostgreSQL, Redis, Qdrant, Nginx, Celery worker) with one command:

```bash
cp config/.env.example .env
# Edit .env with your API keys

docker compose -f deployment/docker/docker-compose.yml up --build
```

Services:
| Service | URL |
|---|---|
| Frontend | http://localhost |
| Backend API | http://localhost/api/v1 |
| API docs (Swagger) | http://localhost/api/v1/docs |
| Prometheus metrics | http://localhost:9090 |

To stop: `docker compose -f deployment/docker/docker-compose.yml down`

---

### Makefile Shortcuts

```bash
make setup        # Full first-time setup (venv, deps, migrations)
make dev          # Start backend + frontend dev servers
make backend      # Backend only
make frontend     # Frontend only
make worker       # Celery worker
make migrate      # Run Alembic migrations
make test         # Run all tests
make lint         # Ruff + ESLint
make docker-up    # docker compose up
make docker-down  # docker compose down
make env-check    # Verify all required env vars are set
```

---

## Environment Variables

Copy `config/.env.example` to `.env` and fill in values. Key variables:

```bash
# ── Database ──────────────────────────────────
DATABASE_URL=postgresql+asyncpg://jarvis:password@localhost:5432/jarvis_db

# ── Redis ─────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── Security ──────────────────────────────────
SECRET_KEY=<generate with: openssl rand -hex 32>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# ── AI Providers (add the ones you want to use) ──
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
GOOGLE_API_KEY=AIza...

# ── Voice ─────────────────────────────────────
ELEVENLABS_API_KEY=...
ASSEMBLYAI_API_KEY=...         # optional
DEEPGRAM_API_KEY=...           # optional

# ── Vector DB ─────────────────────────────────
QDRANT_URL=http://localhost:6333

# ── Frontend ──────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:8000
```

See `config/.env.example` for the full list with descriptions.

---

## Demo Mode

The frontend detects whether the backend is reachable on startup (3-second health check). If the backend is **offline**, it automatically activates **Demo Mode**:

- All API calls are handled by an in-memory mock with pre-populated data
- An amber banner is displayed at the top of the dashboard
- A "Retry backend" button re-checks connectivity and switches to live mode if successful

**Demo credentials:**
| Field | Value |
|---|---|
| Email | `demo@jarvis.ai` |
| Password | `jarvis2025` |

The login page shows an auto-fill button when demo mode is active — no manual typing needed.

---

## API Reference

The FastAPI backend auto-generates interactive docs:

- **Swagger UI**: `http://localhost:8000/api/v1/docs`
- **ReDoc**: `http://localhost:8000/api/v1/redoc`

Key endpoint groups:

| Prefix | Description |
|---|---|
| `POST /api/v1/auth/login` | Get JWT tokens |
| `GET /api/v1/auth/me` | Current user |
| `GET/POST /api/v1/conversations` | Conversation CRUD |
| `WS /ws/chat/{conv_id}` | Streaming chat WebSocket |
| `GET/POST /api/v1/memory` | Memory CRUD + search |
| `GET/POST /api/v1/tasks` | Agent task management |
| `GET /api/v1/agents` | Agent status |
| `POST /api/v1/voice/transcribe` | STT upload |
| `POST /api/v1/voice/synthesize` | TTS generation |
| `POST /api/v1/documents/upload` | Upload document for RAG (PDF/TXT/MD/CSV/DOCX) |
| `GET/DELETE /api/v1/documents` | List / delete documents |
| `POST /api/v1/documents/search` | Semantic search over document chunks |
| `POST /api/v1/execute` | Sandboxed Python/JavaScript execution |
| `GET/POST /api/v1/workflows` | Workflow CRUD + `POST /{id}/run` execution |
| `GET/POST /api/v1/schedules` | Cron schedules + toggle + run-now |
| `GET/POST /api/v1/apikeys` | User API key management (`X-API-Key` auth) |
| `GET/POST /api/v1/integrations` | Integration CRUD + `POST /{id}/action` dispatch |
| `GET/POST /api/v1/webhooks/triggers` | Incoming webhook trigger management |
| `POST /api/v1/hooks/{token}` | Public webhook receiver (triggers workflows) |
| `GET/POST /api/v1/webhooks/outgoing` | Outgoing webhook management |
| `GET/POST /api/v1/workspaces` | Workspaces, members, invites, shared conversations |
| `WS /ws/presence` | Real-time workspace presence |
| `POST /api/v1/push/subscribe` | Web push subscription management |

---

## Agent System

Agents use a **ReAct (Reason + Act)** loop:

```
Thought → Action → Observation → Thought → … → Final Answer
```

The **Orchestrator** receives tasks from the API and dispatches them via a priority queue. Each agent declares its capabilities and the orchestrator selects the best match.

To add a custom agent:

```python
# agents/custom/my_agent.py
from agents.base.base_agent import BaseAgent

class MyAgent(BaseAgent):
    async def execute(self, task: str, context: dict) -> str:
        # your logic
        return result
```

Register it in the orchestrator config and it becomes available immediately.

---

## Memory System

```
User message
     │
     ▼
Short-term (Redis)      ← Fast, session-scoped, expires
     │
     ▼
Long-term (PostgreSQL)  ← Persistent, structured, queryable
     │
     ▼
Semantic (Qdrant)       ← Embedding-based similarity search
```

Memories have 5 importance levels (1–5) and support tagging, search, and access-count tracking. The memory agent automatically saves and retrieves relevant context during conversations.

---

## Voice System

```
Microphone → AudioManager → STT Provider → Text → LLM
                                                    │
Speaker    ← AudioManager ← TTS Provider ← Text ←─┘
```

- Wake word activates listening
- Silence detection ends the recording
- Configurable STT and TTS providers per user in Settings

---

## Deployment

### Production checklist

- [ ] Set `SECRET_KEY` to a random 64-char hex string
- [ ] Set `ENVIRONMENT=production` in `.env`
- [ ] Configure a real domain in `deployment/nginx/nginx.conf`
- [ ] Add TLS certificates to `deployment/nginx/certs/`
- [ ] Set strong database password
- [ ] Enable Prometheus alerting rules
- [ ] Configure backup for PostgreSQL and Qdrant volumes

### Scaling

- Backend is stateless — scale horizontally behind Nginx
- Celery workers scale independently with `--concurrency`
- Redis Sentinel or Cluster for HA
- Qdrant supports distributed mode for large vector collections

---

## License

MIT — see [LICENSE](LICENSE) for details.
