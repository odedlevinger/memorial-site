-- Initialisation script run once when the PostgreSQL container first starts.
-- Convention: database name == service name, user name == <service-name>_user.
-- The shared password (12345678) is for local dev only — rotate via Secret Manager in prod.

-- ── auth-service ─────────────────────────────────────────────────────────────
-- Database is created by POSTGRES_DB env var; only the user + privileges go here.
CREATE USER "auth-service_user" WITH PASSWORD '12345678';
GRANT ALL PRIVILEGES ON DATABASE "auth-service" TO "auth-service_user";
-- Allow the user to create tables / sequences in the public schema (PostgreSQL 15+)
\c "auth-service"
GRANT ALL ON SCHEMA public TO "auth-service_user";

-- ── gateway-service ───────────────────────────────────────────────────────────
-- Hosts the Kong gateway session store (app.sessions table).
-- Schema 'app' isolates session tables from any future Kong DB-mode schema ('kong').
\c "auth-service"
CREATE DATABASE "gateway-service";
CREATE USER "gateway-service_user" WITH PASSWORD '12345678';
GRANT ALL PRIVILEGES ON DATABASE "gateway-service" TO "gateway-service_user";
\c "gateway-service"
GRANT ALL ON SCHEMA public TO "gateway-service_user";
CREATE SCHEMA app;
GRANT ALL ON SCHEMA app TO "gateway-service_user";

-- Session store table (local-dev parity with apps/kong-gateway/migrations/001_create_sessions.sql).
-- The kong-gateway session_identity plugin connects as gateway-service_user, so the table
-- must be owned by that user. PostgreSQL 16 provides gen_random_uuid() built-in.
CREATE TABLE IF NOT EXISTS app.sessions (
    session_id  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL,
    metadata    JSONB,
    expires_at  TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON app.sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON app.sessions (user_id);
ALTER TABLE app.sessions OWNER TO "gateway-service_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON TABLES TO "gateway-service_user";

-- ── content-service ───────────────────────────────────────────────────────────
-- Topics, pictures, captions and editors for the Memory site (apps/content-service).
\c "auth-service"
CREATE DATABASE "content-service";
CREATE USER "content-service_user" WITH PASSWORD '12345678';
GRANT ALL PRIVILEGES ON DATABASE "content-service" TO "content-service_user";
\c "content-service"
GRANT ALL ON SCHEMA public TO "content-service_user";
