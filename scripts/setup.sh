#!/usr/bin/env bash
# =============================================================================
# JARVIS Setup Script
# Checks prerequisites, installs dependencies, initializes the database
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_success() { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()         { log_error "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
check_command() {
    local cmd="$1"
    local friendly="${2:-$1}"
    local install_hint="${3:-}"
    if ! command -v "$cmd" &>/dev/null; then
        if [[ -n "$install_hint" ]]; then
            die "$friendly not found. $install_hint"
        else
            die "$friendly not found. Please install it first."
        fi
    fi
    log_success "$friendly found: $(command -v "$cmd")"
}

check_version() {
    local cmd="$1"
    local version_arg="${2:---version}"
    local min_major="$3"
    local min_minor="${4:-0}"
    local version
    version=$("$cmd" "$version_arg" 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
    local major minor
    major=$(echo "$version" | cut -d. -f1)
    minor=$(echo "$version" | cut -d. -f2)
    if (( major < min_major )) || (( major == min_major && minor < min_minor )); then
        die "$cmd version $version is too old. Required: >=$min_major.$min_minor"
    fi
    log_success "$cmd version $version (>= $min_major.$min_minor required)"
}

echo ""
echo -e "${BOLD}=== JARVIS Setup ===${NC}"
echo ""

log_info "Checking prerequisites..."

check_command python3 "Python 3" "Install from https://python.org"
check_version python3 "--version" 3 11

check_command node "Node.js" "Install from https://nodejs.org"
check_version node "--version" 20 0

check_command npm "npm"
check_command docker "Docker" "Install from https://docker.com"
check_command docker compose "docker compose" || check_command docker-compose "docker-compose"
check_command git "git"

log_success "All prerequisites satisfied"
echo ""

# ---------------------------------------------------------------------------
# Create .env if missing
# ---------------------------------------------------------------------------
ENV_FILE="$PROJECT_ROOT/config/.env"
ENV_EXAMPLE="$PROJECT_ROOT/config/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
    log_info "Creating config/.env from .env.example..."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    # Generate a random SECRET_KEY
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|REPLACE_WITH_64_CHAR_RANDOM_HEX_STRING|$SECRET_KEY|g" "$ENV_FILE"
        sed -i '' "s|REPLACE_WITH_RANDOM_STRING|$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")|g" "$ENV_FILE"
    else
        sed -i "s|REPLACE_WITH_64_CHAR_RANDOM_HEX_STRING|$SECRET_KEY|g" "$ENV_FILE"
        sed -i "s|REPLACE_WITH_RANDOM_STRING|$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")|g" "$ENV_FILE"
    fi
    log_success "Created config/.env (please review and fill in your API keys)"
else
    log_info "config/.env already exists, skipping"
fi

# Load env vars for setup
set -a
# shellcheck disable=SC1090
source "$ENV_FILE" 2>/dev/null || true
set +a

# ---------------------------------------------------------------------------
# Python virtual environment
# ---------------------------------------------------------------------------
VENV_DIR="$PROJECT_ROOT/.venv"
if [[ ! -d "$VENV_DIR" ]]; then
    log_info "Creating Python virtual environment at .venv..."
    python3 -m venv "$VENV_DIR"
    log_success "Virtual environment created"
else
    log_info "Virtual environment already exists"
fi

# Activate
# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"
log_success "Virtual environment activated"

# ---------------------------------------------------------------------------
# Backend dependencies
# ---------------------------------------------------------------------------
log_info "Installing backend Python dependencies..."
pip install --quiet --upgrade pip setuptools wheel

if [[ -f "$PROJECT_ROOT/pyproject.toml" ]]; then
    if command -v poetry &>/dev/null; then
        cd "$PROJECT_ROOT"
        poetry install --no-interaction
    else
        pip install --quiet -e ".[dev]"
    fi
elif [[ -f "$PROJECT_ROOT/requirements.txt" ]]; then
    pip install --quiet -r "$PROJECT_ROOT/requirements.txt"
    if [[ -f "$PROJECT_ROOT/requirements-dev.txt" ]]; then
        pip install --quiet -r "$PROJECT_ROOT/requirements-dev.txt"
    fi
else
    log_warn "No pyproject.toml or requirements.txt found. Skipping backend deps."
fi
log_success "Backend dependencies installed"

# ---------------------------------------------------------------------------
# Frontend dependencies
# ---------------------------------------------------------------------------
FRONTEND_DIR="$PROJECT_ROOT/frontend"
if [[ -d "$FRONTEND_DIR" ]]; then
    log_info "Installing frontend Node.js dependencies..."
    cd "$FRONTEND_DIR"
    npm ci --silent
    cd "$PROJECT_ROOT"
    log_success "Frontend dependencies installed"
else
    log_warn "frontend/ directory not found. Skipping Node.js deps."
fi

# ---------------------------------------------------------------------------
# Docker services
# ---------------------------------------------------------------------------
COMPOSE_FILE="$PROJECT_ROOT/deployment/docker/docker-compose.yml"
if [[ -f "$COMPOSE_FILE" ]]; then
    log_info "Starting infrastructure services (postgres, redis, qdrant)..."
    docker compose -f "$COMPOSE_FILE" up -d postgres redis qdrant
    log_info "Waiting for services to be healthy..."
    sleep 10

    # Wait for postgres
    for i in {1..30}; do
        if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U jarvis -d jarvis &>/dev/null; then
            log_success "PostgreSQL is ready"
            break
        fi
        echo -n "."
        sleep 2
    done
    echo ""
fi

# ---------------------------------------------------------------------------
# Database migrations
# ---------------------------------------------------------------------------
cd "$PROJECT_ROOT"
if command -v alembic &>/dev/null && [[ -f "alembic.ini" ]]; then
    log_info "Running database migrations..."
    alembic upgrade head
    log_success "Database migrations applied"
else
    log_warn "alembic not configured. Applying raw SQL schema..."
    if [[ -n "${DATABASE_URL:-}" ]]; then
        SYNC_URL="${DATABASE_URL_SYNC:-${DATABASE_URL/+asyncpg/}}"
        psql "$SYNC_URL" -f "$PROJECT_ROOT/database/schemas/001_initial.sql" 2>/dev/null \
            && log_success "SQL schema applied" \
            || log_warn "Could not apply SQL schema automatically. Run manually."
    fi
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}=== JARVIS setup complete! ===${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit ${BLUE}config/.env${NC} and fill in your API keys"
echo "  2. Run ${BLUE}make dev${NC} to start all services"
echo "  3. Visit ${BLUE}http://localhost:3000${NC}"
echo ""
