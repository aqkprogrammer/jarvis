# =============================================================================
# JARVIS Makefile
# =============================================================================

.PHONY: setup dev test build docker-up docker-down migrate clean lint format \
        docker-build docker-logs docker-ps shell-backend shell-db help

# Detect docker compose command
DOCKER_COMPOSE := $(shell command -v docker-compose 2>/dev/null || echo "docker compose")
COMPOSE_FILE   := deployment/docker/docker-compose.yml
VENV           := .venv
PYTHON         := $(VENV)/bin/python
PIP            := $(VENV)/bin/pip
BACKEND_DIR    := backend
FRONTEND_DIR   := frontend

# Colors
GREEN  := \033[0;32m
YELLOW := \033[1;33m
BLUE   := \033[0;34m
NC     := \033[0m

## ─────────────────────────────────────────────────────────────────────────────
## Setup & Installation
## ─────────────────────────────────────────────────────────────────────────────

##@ Setup

setup:  ## Run the full setup script (checks prereqs, installs deps, inits DB)
	@echo "$(BLUE)Running setup...$(NC)"
	@bash scripts/setup.sh

install-backend:  ## Install backend Python dependencies only
	@echo "$(BLUE)Installing backend dependencies...$(NC)"
	@$(PIP) install --upgrade pip
	@if [ -f pyproject.toml ]; then \
		$(VENV)/bin/poetry install --no-interaction; \
	elif [ -f requirements.txt ]; then \
		$(PIP) install -r requirements.txt; \
	fi

install-frontend:  ## Install frontend Node.js dependencies only
	@echo "$(BLUE)Installing frontend dependencies...$(NC)"
	@cd $(FRONTEND_DIR) && npm ci

## ─────────────────────────────────────────────────────────────────────────────
## Development
## ─────────────────────────────────────────────────────────────────────────────

##@ Development

dev:  ## Start all services in development mode (hot-reload)
	@echo "$(GREEN)Starting JARVIS dev stack...$(NC)"
	@bash scripts/dev.sh

dev-backend:  ## Start only the FastAPI backend with hot-reload
	@echo "$(BLUE)Starting backend...$(NC)"
	@$(VENV)/bin/uvicorn backend.app.main:app \
		--host 0.0.0.0 --port 8000 --reload \
		--reload-dir backend --log-level debug

dev-frontend:  ## Start only the Next.js frontend
	@echo "$(BLUE)Starting frontend...$(NC)"
	@cd $(FRONTEND_DIR) && npm run dev

dev-worker:  ## Start Celery worker in dev mode
	@echo "$(BLUE)Starting Celery worker...$(NC)"
	@$(VENV)/bin/celery -A backend.app.services.celery_app worker \
		--loglevel=debug --concurrency=2 --queues=default,memory,agents,health

dev-beat:  ## Start Celery beat scheduler
	@echo "$(BLUE)Starting Celery beat...$(NC)"
	@$(VENV)/bin/celery -A backend.app.services.celery_app beat --loglevel=info

## ─────────────────────────────────────────────────────────────────────────────
## Testing
## ─────────────────────────────────────────────────────────────────────────────

##@ Testing

test:  ## Run all tests
	@echo "$(BLUE)Running tests...$(NC)"
	@$(VENV)/bin/pytest tests/ -v --tb=short

test-backend:  ## Run backend tests only
	@$(VENV)/bin/pytest tests/backend/ -v --tb=short

test-frontend:  ## Run frontend tests only
	@cd $(FRONTEND_DIR) && npm test -- --watchAll=false

test-coverage:  ## Run tests with coverage report
	@$(VENV)/bin/pytest tests/ --cov=backend --cov-report=html --cov-report=term-missing
	@echo "$(GREEN)Coverage report: htmlcov/index.html$(NC)"

test-integration:  ## Run integration tests (requires running services)
	@$(VENV)/bin/pytest tests/integration/ -v --tb=short -m integration

## ─────────────────────────────────────────────────────────────────────────────
## Build
## ─────────────────────────────────────────────────────────────────────────────

##@ Build

build:  ## Build all Docker images
	@echo "$(BLUE)Building Docker images...$(NC)"
	@$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) build

build-backend:  ## Build backend Docker image only
	@docker build -f deployment/docker/Dockerfile.backend \
		--target production \
		-t jarvis-backend:latest .

build-frontend:  ## Build frontend Docker image only
	@docker build -f deployment/docker/Dockerfile.frontend \
		--target production \
		-t jarvis-frontend:latest .

## ─────────────────────────────────────────────────────────────────────────────
## Docker
## ─────────────────────────────────────────────────────────────────────────────

##@ Docker

docker-up:  ## Start all Docker services
	@echo "$(GREEN)Starting Docker services...$(NC)"
	@$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) up -d
	@echo "$(GREEN)Services started. Run 'make docker-logs' to view logs.$(NC)"

docker-down:  ## Stop all Docker services
	@echo "$(YELLOW)Stopping Docker services...$(NC)"
	@$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) down

docker-down-volumes:  ## Stop Docker services and remove volumes (DESTRUCTIVE)
	@echo "$(YELLOW)WARNING: This will delete all data volumes!$(NC)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ]
	@$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) down -v

docker-restart:  ## Restart all Docker services
	@$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) restart

docker-logs:  ## Tail logs from all services
	@$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) logs -f --tail=100

docker-ps:  ## Show running Docker containers
	@$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) ps

docker-pull:  ## Pull latest base images
	@$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) pull

## ─────────────────────────────────────────────────────────────────────────────
## Database
## ─────────────────────────────────────────────────────────────────────────────

##@ Database

migrate:  ## Apply pending Alembic migrations
	@echo "$(BLUE)Running migrations...$(NC)"
	@$(VENV)/bin/alembic upgrade head

migrate-down:  ## Rollback last migration
	@$(VENV)/bin/alembic downgrade -1

migrate-create:  ## Create a new migration (usage: make migrate-create MSG="description")
	@$(VENV)/bin/alembic revision --autogenerate -m "$(MSG)"

migrate-history:  ## Show migration history
	@$(VENV)/bin/alembic history --verbose

migrate-current:  ## Show current migration state
	@$(VENV)/bin/alembic current

db-reset:  ## Drop and recreate the database (DESTRUCTIVE)
	@echo "$(YELLOW)WARNING: This will drop all data!$(NC)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ]
	@$(VENV)/bin/alembic downgrade base
	@$(VENV)/bin/alembic upgrade head
	@echo "$(GREEN)Database reset complete$(NC)"

shell-db:  ## Open a psql shell in the database container
	@$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) exec postgres \
		psql -U jarvis -d jarvis

## ─────────────────────────────────────────────────────────────────────────────
## Code Quality
## ─────────────────────────────────────────────────────────────────────────────

##@ Code Quality

lint:  ## Run all linters
	@echo "$(BLUE)Running linters...$(NC)"
	@$(VENV)/bin/ruff check backend/ voice/ plugins/ core/ --fix
	@$(VENV)/bin/mypy backend/ --ignore-missing-imports --no-error-summary
	@if [ -d $(FRONTEND_DIR) ]; then cd $(FRONTEND_DIR) && npm run lint; fi

format:  ## Auto-format all code
	@echo "$(BLUE)Formatting code...$(NC)"
	@$(VENV)/bin/ruff format backend/ voice/ plugins/ core/
	@$(VENV)/bin/ruff check backend/ voice/ plugins/ core/ --fix
	@if [ -d $(FRONTEND_DIR) ]; then cd $(FRONTEND_DIR) && npm run format; fi

typecheck:  ## Run mypy type checker
	@$(VENV)/bin/mypy backend/ --ignore-missing-imports

## ─────────────────────────────────────────────────────────────────────────────
## Utilities
## ─────────────────────────────────────────────────────────────────────────────

##@ Utilities

shell-backend:  ## Open a shell in the backend container
	@$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) exec jarvis-backend bash

shell:  ## Open Python REPL with app context
	@$(VENV)/bin/python -c "import asyncio; from backend.app.main import app; print('App loaded'); import IPython; IPython.embed()"

clean:  ## Remove all build artifacts, caches, and temp files
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	@find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@find . -type f -name "*.pyo" -delete 2>/dev/null || true
	@rm -rf .pytest_cache .mypy_cache .ruff_cache htmlcov .coverage coverage.xml
	@rm -rf dist build *.egg-info
	@if [ -d $(FRONTEND_DIR) ]; then cd $(FRONTEND_DIR) && rm -rf .next out; fi
	@echo "$(GREEN)Clean complete$(NC)"

env-check:  ## Validate .env configuration
	@$(PYTHON) -c "import os; required=['DATABASE_URL','REDIS_URL','SECRET_KEY','ANTHROPIC_API_KEY']; missing=[k for k in required if not os.getenv(k)]; [print('Missing env vars:', missing) or __import__('sys').exit(1)] if missing else print('All required env vars present')"

## ─────────────────────────────────────────────────────────────────────────────
## Help
## ─────────────────────────────────────────────────────────────────────────────

help:  ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)

.DEFAULT_GOAL := help
