-- =============================================================================
-- JARVIS Schema Migration 004 – Integrations & Webhooks
-- PostgreSQL 15+
-- =============================================================================

-- =============================================================================
-- INTEGRATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS integrations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider    VARCHAR(20) NOT NULL
                CHECK (provider IN ('github', 'slack', 'discord', 'notion')),
    name        VARCHAR(255) NOT NULL,
    credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
    config      JSONB NOT NULL DEFAULT '{}'::jsonb,
    status      VARCHAR(20) NOT NULL DEFAULT 'connected'
                CHECK (status IN ('connected', 'error')),
    last_error  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrations_user     ON integrations (user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations (provider);

COMMENT ON TABLE  integrations IS 'Connections to external services (GitHub, Slack, Discord, Notion)';
COMMENT ON COLUMN integrations.credentials IS 'Provider secrets (tokens, webhook URLs). Encrypt at rest in production; never returned by the API';
COMMENT ON COLUMN integrations.config IS 'Non-secret defaults, e.g. {default_channel} or {parent_page_id}';

-- =============================================================================
-- WEBHOOK TRIGGERS (incoming: POST /api/v1/hooks/{token} starts a workflow)
-- =============================================================================

CREATE TABLE IF NOT EXISTS webhook_triggers (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name              VARCHAR(255) NOT NULL,
    token             VARCHAR(64) NOT NULL,
    workflow_id       UUID NOT NULL REFERENCES workflows (id) ON DELETE CASCADE,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    trigger_count     INTEGER NOT NULL DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_triggers_token    ON webhook_triggers (token);
CREATE INDEX        IF NOT EXISTS idx_webhook_triggers_user     ON webhook_triggers (user_id);
CREATE INDEX        IF NOT EXISTS idx_webhook_triggers_workflow ON webhook_triggers (workflow_id);

COMMENT ON TABLE  webhook_triggers IS 'Incoming webhooks: an unguessable token that starts a workflow when POSTed';
COMMENT ON COLUMN webhook_triggers.token IS 'whk_ + 24 url-safe random bytes; the token is the only secret';

-- =============================================================================
-- OUTGOING WEBHOOKS (notify external systems when JARVIS events occur)
-- =============================================================================

CREATE TABLE IF NOT EXISTS outgoing_webhooks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    url         VARCHAR(1000) NOT NULL,
    events      JSONB NOT NULL DEFAULT '[]'::jsonb,
    secret      VARCHAR(255),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    last_status VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outgoing_webhooks_user ON outgoing_webhooks (user_id);

COMMENT ON TABLE  outgoing_webhooks IS 'User-registered URLs notified on JARVIS events with an optional HMAC signature';
COMMENT ON COLUMN outgoing_webhooks.events IS 'Subscribed events: workflow.completed | workflow.failed | schedule.completed | task.completed';
COMMENT ON COLUMN outgoing_webhooks.secret IS 'Optional HMAC key: deliveries carry X-Jarvis-Signature = hex sha256 HMAC of the body';

-- =============================================================================
-- TRIGGERS: auto-update updated_at (function defined in 001_initial.sql)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_integrations_updated_at ON integrations;
CREATE TRIGGER trg_integrations_updated_at
    BEFORE UPDATE ON integrations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
