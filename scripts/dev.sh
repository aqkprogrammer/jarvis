#!/usr/bin/env bash
# =============================================================================
# JARVIS Dev Script — starts all services in development mode
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }

# ---------------------------------------------------------------------------
# Load environment
# ---------------------------------------------------------------------------
ENV_FILE="$PROJECT_ROOT/config/.env"
if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    log_ok "Loaded config/.env"
else
    log_warn "config/.env not found. Run scripts/setup.sh first."
fi

# Override to development
export ENVIRONMENT=development
export DEBUG=true
export LOG_LEVEL=DEBUG

# ---------------------------------------------------------------------------
# Trap for cleanup
# ---------------------------------------------------------------------------
PIDS=()
cleanup() {
    echo ""
    log_info "Shutting down JARVIS dev services..."
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    # Optionally stop Docker services
    # docker compose -f "$PROJECT_ROOT/deployment/docker/docker-compose.yml" stop
    log_ok "Done."
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Start infrastructure via Docker Compose
# ---------------------------------------------------------------------------
COMPOSE_FILE="$PROJECT_ROOT/deployment/docker/docker-compose.yml"
log_info "Starting infrastructure services (postgres, redis, qdrant)..."
docker compose -f "$COMPOSE_FILE" up -d postgres redis qdrant
log_ok "Infrastructure started"

# Wait for postgres readiness
log_info "Waiting for PostgreSQL..."
for i in {1..20}; do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U jarvis -d jarvis &>/dev/null; then
        log_ok "PostgreSQL ready"
        break
    fi
    sleep 2
done

# ---------------------------------------------------------------------------
# Activate virtual environment
# ---------------------------------------------------------------------------
VENV_DIR="$PROJECT_ROOT/.venv"
if [[ -d "$VENV_DIR" ]]; then
    # shellcheck disable=SC1090
    source "$VENV_DIR/bin/activate"
    log_ok "Virtual environment activated"
fi

# ---------------------------------------------------------------------------
# Run Alembic migrations
# ---------------------------------------------------------------------------
cd "$PROJECT_ROOT"
if command -v alembic &>/dev/null && [[ -f "alembic.ini" ]]; then
    log_info "Applying any pending migrations..."
    alembic upgrade head
fi

# ---------------------------------------------------------------------------
# Start FastAPI backend (hot-reload)
# ---------------------------------------------------------------------------
log_info "Starting FastAPI backend on :8000..."
uvicorn backend.app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --reload \
    --reload-dir "$PROJECT_ROOT/backend" \
    --log-level debug &
PIDS+=($!)
log_ok "Backend PID: ${PIDS[-1]}"

sleep 2

# ---------------------------------------------------------------------------
# Start Celery worker
# ---------------------------------------------------------------------------
log_info "Starting Celery worker..."
celery -A backend.app.services.celery_app worker \
    --loglevel=debug \
    --concurrency=2 \
    --queues=default,memory,agents,health \
    --hostname=dev-worker@%h &
PIDS+=($!)
log_ok "Celery worker PID: ${PIDS[-1]}"

# ---------------------------------------------------------------------------
# Start Celery beat (scheduler)
# ---------------------------------------------------------------------------
log_info "Starting Celery beat..."
celery -A backend.app.services.celery_app beat \
    --loglevel=info &
PIDS+=($!)
log_ok "Celery beat PID: ${PIDS[-1]}"

# ---------------------------------------------------------------------------
# Start Next.js frontend (hot-reload)
# ---------------------------------------------------------------------------
FRONTEND_DIR="$PROJECT_ROOT/frontend"
if [[ -d "$FRONTEND_DIR" ]] && [[ -f "$FRONTEND_DIR/package.json" ]]; then
    log_info "Starting Next.js frontend on :3000..."
    cd "$FRONTEND_DIR"
    npm run dev &
    PIDS+=($!)
    log_ok "Frontend PID: ${PIDS[-1]}"
    cd "$PROJECT_ROOT"
else
    log_warn "frontend/ not found. Skipping Next.js."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}=== JARVIS dev stack running ===${NC}"
echo ""
echo "  Backend:  http://localhost:8000"
echo "  API docs: http://localhost:8000/docs"
echo "  Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

# Wait for all background processes
wait
