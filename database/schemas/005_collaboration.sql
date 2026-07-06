-- =============================================================================
-- JARVIS Schema Migration 005 – Collaboration (Workspaces, Presence, Push)
-- PostgreSQL 15+
-- =============================================================================

-- =============================================================================
-- WORKSPACES
-- =============================================================================

CREATE TABLE IF NOT EXISTS workspaces (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(255) NOT NULL,
    owner_id   UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces (owner_id);

COMMENT ON TABLE  workspaces IS 'Shared spaces where multiple users collaborate on conversations';
COMMENT ON COLUMN workspaces.owner_id IS 'The creator; always an admin and the only user allowed to delete the workspace';

-- =============================================================================
-- WORKSPACE MEMBERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS workspace_members (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role         VARCHAR(20) NOT NULL DEFAULT 'member'
                 CHECK (role IN ('admin', 'member')),
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_members_ws_user ON workspace_members (workspace_id, user_id);
CREATE INDEX        IF NOT EXISTS idx_workspace_members_user    ON workspace_members (user_id);

COMMENT ON TABLE  workspace_members IS 'Membership of users in workspaces with a role';
COMMENT ON COLUMN workspace_members.role IS 'admin: manage members/invites/settings; member: participate';

-- =============================================================================
-- WORKSPACE INVITES
-- =============================================================================

CREATE TABLE IF NOT EXISTS workspace_invites (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    email        VARCHAR(255) NOT NULL,
    token        VARCHAR(64) NOT NULL,
    role         VARCHAR(20) NOT NULL DEFAULT 'member'
                 CHECK (role IN ('admin', 'member')),
    invited_by   UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    accepted     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invites_token     ON workspace_invites (token);
CREATE INDEX        IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites (workspace_id);

COMMENT ON TABLE  workspace_invites IS 'Email invitations to join a workspace; the token is the only credential';
COMMENT ON COLUMN workspace_invites.token IS 'inv_ + 24 url-safe random bytes; any authenticated user presenting it joins';

-- =============================================================================
-- PUSH SUBSCRIPTIONS (Web Push scaffolding)
-- =============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL,
    keys       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_user_endpoint ON push_subscriptions (user_id, endpoint);
CREATE INDEX        IF NOT EXISTS idx_push_subscriptions_user          ON push_subscriptions (user_id);

COMMENT ON TABLE  push_subscriptions IS 'Browser Web Push subscriptions; delivery via pywebpush + VAPID keys is future work';
COMMENT ON COLUMN push_subscriptions.keys IS 'Client key material, e.g. {"p256dh": "...", "auth": "..."}';

-- =============================================================================
-- SHARED CONVERSATIONS
-- =============================================================================

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations (workspace_id);

COMMENT ON COLUMN conversations.workspace_id IS 'Set when the owner shares the conversation into a workspace';

-- =============================================================================
-- TRIGGERS: auto-update updated_at (function defined in 001_initial.sql)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_workspaces_updated_at ON workspaces;
CREATE TRIGGER trg_workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
