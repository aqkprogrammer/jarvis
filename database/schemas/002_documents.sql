-- =============================================================================
-- JARVIS Schema Migration 002 – Documents (RAG)
-- PostgreSQL 15+
-- =============================================================================

-- =============================================================================
-- DOCUMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS documents (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    filename     VARCHAR(512) NOT NULL,
    content_type VARCHAR(255),
    size_bytes   BIGINT NOT NULL DEFAULT 0,
    status       VARCHAR(20) NOT NULL DEFAULT 'processing'
                 CHECK (status IN ('processing', 'ready', 'failed')),
    error        TEXT,
    chunk_count  INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_user    ON documents (user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status  ON documents (user_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents (created_at DESC);

COMMENT ON TABLE  documents IS 'User-uploaded documents indexed for RAG chat-over-docs';
COMMENT ON COLUMN documents.status IS 'processing | ready | failed';

-- =============================================================================
-- DOCUMENT CHUNKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS document_chunks (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id  UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    chunk_index  INTEGER NOT NULL,
    content      TEXT NOT NULL,
    embedding_id VARCHAR(256)               -- ID of the point in Qdrant docs collection
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document  ON document_chunks (document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks (embedding_id)
    WHERE embedding_id IS NOT NULL;

COMMENT ON TABLE  document_chunks IS 'Text chunks extracted from documents, embedded into Qdrant';
COMMENT ON COLUMN document_chunks.embedding_id IS 'Reference to vector embedding point in Qdrant';

-- =============================================================================
-- TRIGGERS: auto-update updated_at (function defined in 001_initial.sql)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- REASONING TRACES
-- =============================================================================
-- Assistant reasoning traces are stored in the existing messages.metadata JSONB
-- column (created in 001_initial.sql) under the "trace" key:
--   { "trace": { "steps": [ { "type": "thinking|tool|retrieval",
--                             "label": "...", "detail": "..." } ] } }
-- No ALTER required.
