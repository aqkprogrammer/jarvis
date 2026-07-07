from __future__ import annotations

from typing import Any, List, Optional
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────────────────────────────
    APP_NAME: str = "JARVIS"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"  # development | production | test
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"
    API_BASE_URL: str = "http://localhost:8000"  # public base URL, e.g. for webhook URLs
    # user with this email is auto-granted admin (is_superuser) on startup
    ADMIN_EMAIL: Optional[str] = None

    # ── Security ──────────────────────────────────────────────────────────────
    SECRET_KEY: str = "change-me-in-production-use-secrets-generate-urandom-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 h
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://jarvis:jarvis@localhost:5432/jarvis"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 40
    DATABASE_POOL_TIMEOUT: int = 30

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_POOL_MAX_CONNECTIONS: int = 50
    CACHE_DEFAULT_TTL: int = 300  # seconds

    # ── Qdrant ────────────────────────────────────────────────────────────────
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: Optional[str] = None
    QDRANT_COLLECTION_MEMORIES: str = "jarvis_memories"
    QDRANT_COLLECTION_DOCS: str = "jarvis_documents"
    VECTOR_DIMENSION: int = 384  # all-MiniLM-L6-v2

    # ── AI Providers ──────────────────────────────────────────────────────────
    ANTHROPIC_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    GOOGLE_API_KEY: Optional[str] = None
    OLLAMA_BASE_URL: str = "http://localhost:11434"

    DEFAULT_AI_PROVIDER: str = "anthropic"
    DEFAULT_MODEL: str = "claude-sonnet-4-6"
    DEFAULT_MAX_TOKENS: int = 4096
    DEFAULT_TEMPERATURE: float = 0.7

    # ── Voice ─────────────────────────────────────────────────────────────────
    ELEVENLABS_API_KEY: Optional[str] = None
    ELEVENLABS_VOICE_ID: str = "21m00Tcm4TlvDq8ikWAM"  # Rachel
    WHISPER_MODEL: str = "base"  # tiny | base | small | medium | large
    ASSEMBLYAI_API_KEY: Optional[str] = None
    DEEPGRAM_API_KEY: Optional[str] = None

    # ── CORS / Hosts ──────────────────────────────────────────────────────────
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
    ]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = ["*"]
    CORS_ALLOW_HEADERS: List[str] = ["*"]
    ALLOWED_HOSTS: List[str] = ["*"]

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_BURST: int = 100

    # ── Celery ────────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    CELERY_TASK_ALWAYS_EAGER: bool = False  # set True in tests
    CELERY_TASK_TIME_LIMIT: int = 300
    CELERY_TASK_SOFT_TIME_LIMIT: int = 270

    # ── Code Execution ────────────────────────────────────────────────────────
    ENABLE_CODE_EXECUTION: bool = True

    # ── Web Push (VAPID) ──────────────────────────────────────────────────────
    # generate with: npx web-push generate-vapid-keys
    VAPID_PUBLIC_KEY: Optional[str] = None
    VAPID_PRIVATE_KEY: Optional[str] = None

    # ── Feature Flags ─────────────────────────────────────────────────────────
    FEATURE_MEMORY_ENABLED: bool = True
    FEATURE_VOICE_ENABLED: bool = True
    FEATURE_AGENTS_ENABLED: bool = True
    FEATURE_COMPUTER_USE_ENABLED: bool = False  # requires extra deps
    FEATURE_WEB_SEARCH_ENABLED: bool = True
    FEATURE_CODE_EXECUTION_ENABLED: bool = False  # sandboxed

    # ── Observability ─────────────────────────────────────────────────────────
    PROMETHEUS_ENABLED: bool = True
    OPENTELEMETRY_ENABLED: bool = False
    OPENTELEMETRY_ENDPOINT: Optional[str] = None
    LOG_LEVEL: str = "INFO"
    LOG_JSON: bool = False  # True in production

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str, info: Any) -> str:
        if (
            info.data.get("ENVIRONMENT") == "production"
            and v == "change-me-in-production-use-secrets-generate-urandom-32"
        ):
            raise ValueError("SECRET_KEY must be changed in production")
        return v

    @field_validator("ENVIRONMENT")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        allowed = {"development", "production", "test"}
        if v not in allowed:
            raise ValueError(f"ENVIRONMENT must be one of {allowed}")
        return v

    @model_validator(mode="after")
    def set_production_defaults(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            self.LOG_JSON = True
            self.DEBUG = False
        return self

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def is_test(self) -> bool:
        return self.ENVIRONMENT == "test"


settings = Settings()
