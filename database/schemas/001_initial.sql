-- =============================================================================
-- JARVIS Initial Database Schema
-- PostgreSQL 15+
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'user', 'readonly', 'service');
CREATE TYPE message_role AS ENUM ('system', 'user', 'assistant', 'function', 'tool');
CREATE TYPE memory_type AS ENUM ('episodic', 'semantic', 'procedural', 'working');
CREATE TYPE task_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled', 'retrying');
CREATE TYPE task_priority AS ENUM ('low', 'normal', 'high', 'critical');

-- =============================================================================
-- USERS
-- =============================================================================

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               VARCHAR(255) NOT NULL,
    username            VARCHAR(100) NOT NULL,
    hashed_password     VARCHAR(255) NOT NULL,
    role                user_role NOT NULL DEFAULT 'user',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    full_name           VARCHAR(255),
    avatar_url          TEXT,
    timezone            VARCHAR(64) DEFAULT 'UTC',
    preferences         JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- preferences schema:
    -- { "voice": { "tts_provider": "elevenlabs", "voice_id": "...", "speed": 1.0 },
    --   "stt_provider": "groq-whisper", "language": "en",
    --   "wake_word_enabled": true, "theme": "dark", "notifications": true }
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_users_email    ON users (LOWER(email));
CREATE UNIQUE INDEX uq_users_username ON users (LOWER(username));
CREATE INDEX        idx_users_role    ON users (role);
CREATE INDEX        idx_users_active  ON users (is_active) WHERE is_active = TRUE;

COMMENT ON TABLE  users IS 'Registered JARVIS users';
COMMENT ON COLUMN users.preferences IS 'User-configurable preferences stored as JSONB';

-- =============================================================================
-- CONVERSATIONS
-- =============================================================================

CREATE TABLE conversations (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title        VARCHAR(500),
    session_id   VARCHAR(128),                -- client session identifier
    agent_type   VARCHAR(64),                 -- e.g. 'general', 'coding', 'research'
    is_archived  BOOLEAN NOT NULL DEFAULT FALSE,
    metadata     JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- metadata: { "tags": [], "model": "claude-opus-4", "context_window": 200000 }
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_user       ON conversations (user_id);
CREATE INDEX idx_conversations_session    ON conversations (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_conversations_archived   ON conversations (user_id, is_archived);
CREATE INDEX idx_conversations_created    ON conversations (created_at DESC);
CREATE INDEX idx_conversations_metadata   ON conversations USING GIN (metadata);

COMMENT ON TABLE conversations IS 'Chat sessions between users and JARVIS agents';

-- =============================================================================
-- MESSAGES
-- =============================================================================

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    role            message_role NOT NULL,
    content         TEXT NOT NULL,
    tokens_used     INTEGER,
    model           VARCHAR(100),             -- model that produced this message
    tool_calls      JSONB,                    -- OpenAI-style tool_calls array
    tool_call_id    VARCHAR(128),             -- for tool result messages
    metadata        JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- metadata: { "latency_ms": 420, "finish_reason": "stop", "cost_usd": 0.001 }
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at ASC);
CREATE INDEX idx_messages_role         ON messages (conversation_id, role);
CREATE INDEX idx_messages_created      ON messages (created_at DESC);
CREATE INDEX idx_messages_metadata     ON messages USING GIN (metadata);

-- Full-text search on message content
CREATE INDEX idx_messages_content_fts ON messages USING GIN (to_tsvector('english', content));

COMMENT ON TABLE messages IS 'Individual messages within a conversation';

-- =============================================================================
-- MEMORIES
-- =============================================================================

CREATE TABLE memories (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    memory_type      memory_type NOT NULL DEFAULT 'episodic',
    content          TEXT NOT NULL,           -- raw memory content
    summary          TEXT,                    -- LLM-generated summary
    importance_score FLOAT NOT NULL DEFAULT 0.5 CHECK (importance_score BETWEEN 0 AND 1),
    embedding_id     VARCHAR(256),            -- ID in Qdrant vector store
    tags             JSONB NOT NULL DEFAULT '[]'::JSONB,
    source_message_id UUID REFERENCES messages (id) ON DELETE SET NULL,
    access_count     INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    expires_at       TIMESTAMPTZ,             -- NULL = never expires
    is_pinned        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memories_user          ON memories (user_id);
CREATE INDEX idx_memories_type          ON memories (user_id, memory_type);
CREATE INDEX idx_memories_importance    ON memories (user_id, importance_score DESC);
CREATE INDEX idx_memories_accessed      ON memories (last_accessed_at DESC NULLS LAST);
CREATE INDEX idx_memories_embedding     ON memories (embedding_id) WHERE embedding_id IS NOT NULL;
CREATE INDEX idx_memories_tags          ON memories USING GIN (tags);
CREATE INDEX idx_memories_content_fts   ON memories USING GIN (to_tsvector('english', content));
CREATE INDEX idx_memories_expiry        ON memories (expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE memories IS 'Long-term memory store for JARVIS agents';
COMMENT ON COLUMN memories.embedding_id IS 'Reference to vector embedding in Qdrant';

-- =============================================================================
-- TASKS
-- =============================================================================

CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    status          task_status NOT NULL DEFAULT 'pending',
    priority        task_priority NOT NULL DEFAULT 'normal',
    agent_type      VARCHAR(64),              -- which agent handles this task
    celery_task_id  VARCHAR(256),             -- Celery task UUID
    input_data      JSONB NOT NULL DEFAULT '{}'::JSONB,
    output_data     JSONB NOT NULL DEFAULT '{}'::JSONB,
    error_message   TEXT,
    parent_task_id  UUID REFERENCES tasks (id) ON DELETE SET NULL,
    retries         INTEGER NOT NULL DEFAULT 0,
    max_retries     INTEGER NOT NULL DEFAULT 3,
    scheduled_at    TIMESTAMPTZ,              -- for deferred tasks
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_user          ON tasks (user_id);
CREATE INDEX idx_tasks_status        ON tasks (status);
CREATE INDEX idx_tasks_user_status   ON tasks (user_id, status);
CREATE INDEX idx_tasks_priority      ON tasks (priority, created_at DESC);
CREATE INDEX idx_tasks_parent        ON tasks (parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX idx_tasks_celery        ON tasks (celery_task_id) WHERE celery_task_id IS NOT NULL;
CREATE INDEX idx_tasks_scheduled     ON tasks (scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX idx_tasks_input         ON tasks USING GIN (input_data);
CREATE INDEX idx_tasks_output        ON tasks USING GIN (output_data);

COMMENT ON TABLE tasks IS 'Agent task queue with retry and hierarchy support';

-- =============================================================================
-- PLUGINS
-- =============================================================================

CREATE TABLE plugins (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(100) NOT NULL,
    version       VARCHAR(50) NOT NULL,
    description   TEXT,
    author        VARCHAR(255),
    homepage_url  TEXT,
    config_schema JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- JSON Schema describing required plugin configuration
    config        JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- Current plugin configuration values
    permissions   JSONB NOT NULL DEFAULT '[]'::JSONB,
    -- ["filesystem:read", "network:external", ...]
    is_active     BOOLEAN NOT NULL DEFAULT FALSE,
    is_builtin    BOOLEAN NOT NULL DEFAULT FALSE,
    installed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_plugins_name_version ON plugins (name, version);
CREATE INDEX idx_plugins_active ON plugins (is_active) WHERE is_active = TRUE;
CREATE INDEX idx_plugins_name   ON plugins (name);

COMMENT ON TABLE plugins IS 'Installed JARVIS plugins and their configuration';

-- =============================================================================
-- AUDIT LOGS
-- =============================================================================

CREATE TABLE audit_logs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID REFERENCES users (id) ON DELETE SET NULL,
    action        VARCHAR(100) NOT NULL,      -- e.g. 'task.create', 'memory.delete'
    resource_type VARCHAR(64),               -- e.g. 'task', 'memory', 'user'
    resource_id   UUID,
    metadata      JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- { "before": {...}, "after": {...}, "reason": "..." }
    ip_address    INET,
    user_agent    TEXT,
    success       BOOLEAN NOT NULL DEFAULT TRUE,
    error_detail  TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user       ON audit_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_action     ON audit_logs (action);
CREATE INDEX idx_audit_resource   ON audit_logs (resource_type, resource_id)
                                   WHERE resource_type IS NOT NULL;
CREATE INDEX idx_audit_created    ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_ip         ON audit_logs (ip_address) WHERE ip_address IS NOT NULL;

-- Partition hint: for high-volume deployments, partition by month
COMMENT ON TABLE audit_logs IS 'Immutable audit trail of all JARVIS actions';

-- =============================================================================
-- REFRESH TOKENS
-- =============================================================================

CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_refresh_tokens_hash ON refresh_tokens (token_hash);
CREATE INDEX idx_refresh_tokens_user       ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_expiry     ON refresh_tokens (expires_at);

-- =============================================================================
-- TRIGGERS: auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['users','conversations','memories','tasks','plugins'] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
            t, t
        );
    END LOOP;
END;
$$;

-- =============================================================================
-- SEED DATA: built-in plugins
-- =============================================================================

INSERT INTO plugins (name, version, description, is_builtin, is_active, permissions, config_schema)
VALUES
    ('web_search',  '1.0.0', 'Web search via DuckDuckGo or Google',  TRUE, TRUE,
     '["network:external"]'::JSONB,
     '{"type":"object","properties":{"provider":{"type":"string","enum":["duckduckgo","google"]}}}'::JSONB),
    ('code_runner', '1.0.0', 'Execute code in sandboxed environment', TRUE, TRUE,
     '["sandbox:execute"]'::JSONB,
     '{"type":"object","properties":{"timeout_seconds":{"type":"integer","default":30}}}'::JSONB),
    ('file_manager','1.0.0', 'Read/write files in allowed directories',TRUE, FALSE,
     '["filesystem:read","filesystem:write"]'::JSONB,
     '{"type":"object","properties":{"allowed_dirs":{"type":"array","items":{"type":"string"}}}}'::JSONB);
