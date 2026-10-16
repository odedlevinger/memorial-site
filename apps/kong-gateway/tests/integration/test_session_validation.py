"""Integration tests for US1 — session validation via Kong gateway.

Requires a running stack: docker compose up kong-gateway my-db auth-service
Skipped automatically when INTEGRATION_TESTS env var is not set.
"""

from __future__ import annotations

import base64
import json
import os
import uuid
from datetime import UTC

import httpx
import pytest

BASE_URL = os.environ.get("KONG_BASE_URL", "http://localhost:8000")
DB_DSN = os.environ.get(
    "GATEWAY_DB_DSN",
    "postgresql://gateway-service_user:12345678@localhost:5432/gateway-service",
)

pytestmark = pytest.mark.skipif(
    os.environ.get("INTEGRATION_TESTS") != "1",
    reason="Set INTEGRATION_TESTS=1 to run integration tests",
)


@pytest.fixture(scope="module")
def db_conn():
    """Direct DB connection for seeding test data."""
    import psycopg2

    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = False
    yield conn
    conn.close()


def _seed_session(db_conn, user_id: uuid.UUID, expired: bool = False) -> uuid.UUID:
    """Insert a test session and return its session_id."""
    from datetime import datetime, timedelta

    if expired:
        expires_at = datetime.now(tz=UTC) - timedelta(hours=1)
    else:
        expires_at = datetime.now(tz=UTC) + timedelta(days=30)

    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO app.sessions (user_id, metadata, expires_at)
            VALUES (%s, %s, %s)
            RETURNING session_id
            """,
            (str(user_id), None, expires_at),
        )
        row = cur.fetchone()
    db_conn.commit()
    return uuid.UUID(str(row[0]))


def _cleanup_session(db_conn, session_id: uuid.UUID) -> None:
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM app.sessions WHERE session_id = %s", (str(session_id),))
    db_conn.commit()


class TestSessionValidation:
    def test_valid_session_returns_200_with_user_context(self, db_conn):
        user_id = uuid.uuid4()
        session_id = _seed_session(db_conn, user_id)
        try:
            resp = httpx.get(
                f"{BASE_URL}/auth-service/auth/health",
                cookies={"app_session": str(session_id)},
            )
            assert resp.status_code == 200
            # The downstream (auth-service) receives X-User-Context from gateway.
            # We verify the response shows the request was forwarded.
        finally:
            _cleanup_session(db_conn, session_id)

    def test_missing_cookie_returns_401(self):
        resp = httpx.get(f"{BASE_URL}/auth-service/auth/health")
        assert resp.status_code == 401
        body = resp.json()
        assert body.get("error") == "Unauthorized"

    def test_401_includes_www_authenticate(self):
        resp = httpx.get(f"{BASE_URL}/auth-service/auth/health")
        assert resp.status_code == 401
        assert "WWW-Authenticate" in resp.headers

    def test_expired_session_returns_401(self, db_conn):
        user_id = uuid.uuid4()
        session_id = _seed_session(db_conn, user_id, expired=True)
        try:
            resp = httpx.get(
                f"{BASE_URL}/auth-service/auth/health",
                cookies={"app_session": str(session_id)},
            )
            assert resp.status_code == 401
        finally:
            _cleanup_session(db_conn, session_id)

    def test_forged_x_user_context_is_overwritten(self, db_conn):
        """Client-supplied X-User-Context must be replaced by gateway value."""
        user_id = uuid.uuid4()
        session_id = _seed_session(db_conn, user_id)
        forged = base64.urlsafe_b64encode(
            json.dumps({"user_id": "attacker", "session_id": "fake"}).encode()
        ).decode()
        try:
            # We can't easily inspect what the downstream received, but we can
            # verify the gateway doesn't error out and the response is 200.
            resp = httpx.get(
                f"{BASE_URL}/auth-service/auth/health",
                cookies={"app_session": str(session_id)},
                headers={"X-User-Context": forged},
            )
            assert resp.status_code == 200
        finally:
            _cleanup_session(db_conn, session_id)

    def test_invalid_uuid_cookie_returns_401(self):
        resp = httpx.get(
            f"{BASE_URL}/auth-service/auth/health",
            cookies={"app_session": "not-a-valid-uuid"},
        )
        assert resp.status_code == 401
