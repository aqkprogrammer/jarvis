-- =============================================================================
-- JARVIS Schema Migration 006 – Admin, Usage Tracking & Quotas
-- PostgreSQL 15+
-- =============================================================================

-- =============================================================================
-- USAGE RECORDS
-- =============================================================================

CREATE TABLE IF NOT EXISTS usage_records (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    conversation_id UUID,                        -- soft reference; survives conversation deletion
    provider        VARCHAR(50)    NOT NULL,
    model           VARCHAR(100)   NOT NULL,
    input_tokens    INTEGER        NOT NULL DEFAULT 0,
    output_tokens   INTEGER        NOT NULL DEFAULT 0,
    cost_usd        NUMERIC(10, 6) NOT NULL DEFAULT 0,
    estimated       BOOLEAN        NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_records_user_created ON usage_records (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_records_created      ON usage_records (created_at DESC);

COMMENT ON TABLE  usage_records IS 'Per-completion AI token usage and estimated cost';
COMMENT ON COLUMN usage_records.cost_usd  IS 'Computed from per-model pricing; approximate as of mid-2025';
COMMENT ON COLUMN usage_records.estimated IS 'TRUE when token counts were estimated (e.g. streaming responses)';

-- =============================================================================
-- USER QUOTAS & ADMIN FLAG
-- =============================================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS monthly_token_quota BIGINT;  -- NULL = unlimited

COMMENT ON COLUMN users.monthly_token_quota IS 'Max tokens per UTC calendar month; NULL means unlimited';

-- 001_initial.sql defines a role enum but no boolean admin flag; the ORM
-- (app.models.user.User) gates admin access on is_superuser, so add it here.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.is_superuser IS 'Platform admin flag; grants access to /api/v1/admin endpoints';
