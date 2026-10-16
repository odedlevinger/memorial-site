-- Migration 001: Create session store schema and table
-- Idempotent: safe to run multiple times.
-- Database: gateway-service  |  Schema: app

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.sessions (
    session_id  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL,
    metadata    JSONB,
    expires_at  TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for fast expiry-based TTL queries and purge jobs
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON app.sessions (expires_at);

-- Index for fast user-level erasure (GDPR Art. 17)
CREATE INDEX IF NOT EXISTS idx_sessions_user_id
    ON app.sessions (user_id);
