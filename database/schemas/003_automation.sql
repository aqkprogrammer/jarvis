-- =============================================================================
-- JARVIS Schema Migration 003 – Automation (Workflows, Schedules, API Keys)
-- PostgreSQL 15+
-- =============================================================================

-- =============================================================================
-- WORKFLOWS
-- =============================================================================

CREATE TABLE IF NOT EXISTS workflows (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    nodes       JSONB NOT NULL DEFAULT '[]'::jsonb,
    edges       JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_user    ON workflows (user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_updated ON workflows (updated_at DESC);

COMMENT ON TABLE  workflows IS 'User-defined visual pipelines of trigger/agent/condition/output nodes';
COMMENT ON COLUMN workflows.nodes IS 'List of {id, type, position: {x,y}, data: {label, agent_type?, prompt?, condition?}}';
COMMENT ON COLUMN workflows.edges IS 'List of {id, source, target} connecting node ids';

-- =============================================================================
-- WORKFLOW RUNS
-- =============================================================================

CREATE TABLE IF NOT EXISTS workflow_runs (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id  UUID NOT NULL REFERENCES workflows (id) ON DELETE CASCADE,
    status       VARCHAR(20) NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'completed', 'failed')),
    node_results JSONB NOT NULL DEFAULT '{}'::jsonb,
    error        TEXT,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs (workflow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status   ON workflow_runs (status);

COMMENT ON TABLE  workflow_runs IS 'Individual executions of a workflow with per-node results';
COMMENT ON COLUMN workflow_runs.node_results IS 'node_id -> {status, output, error, duration_ms}';

-- =============================================================================
-- SCHEDULES
-- =============================================================================

CREATE TABLE IF NOT EXISTS schedules (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    cron        VARCHAR(100) NOT NULL,
    target_type VARCHAR(20) NOT NULL
                CHECK (target_type IN ('workflow', 'prompt')),
    workflow_id UUID REFERENCES workflows (id) ON DELETE SET NULL,
    prompt      TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    last_status VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedules_user     ON schedules (user_id);
CREATE INDEX IF NOT EXISTS idx_schedules_workflow ON schedules (workflow_id)
    WHERE workflow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules (next_run_at)
    WHERE is_active = TRUE AND next_run_at IS NOT NULL;

COMMENT ON TABLE  schedules IS 'Cron-scheduled agent runs (workflow or ad-hoc prompt targets)';
COMMENT ON COLUMN schedules.cron IS 'Standard 5-field cron expression, evaluated in UTC';
COMMENT ON COLUMN schedules.target_type IS 'workflow | prompt';

-- =============================================================================
-- API KEYS
-- =============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    key_prefix   VARCHAR(16) NOT NULL,
    key_hash     VARCHAR(64) NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);
CREATE INDEX        IF NOT EXISTS idx_api_keys_user ON api_keys (user_id);

COMMENT ON TABLE  api_keys IS 'User-generated API keys for programmatic access (plaintext never stored)';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 12 characters of the key, for display';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hex digest of the full key';

-- =============================================================================
-- TRIGGERS: auto-update updated_at (function defined in 001_initial.sql)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_workflows_updated_at ON workflows;
CREATE TRIGGER trg_workflows_updated_at
    BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_schedules_updated_at ON schedules;
CREATE TRIGGER trg_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
