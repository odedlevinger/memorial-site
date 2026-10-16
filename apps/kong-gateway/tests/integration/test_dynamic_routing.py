"""Integration tests for US5 — zero-touch dynamic upstream routing.

Requires a running stack with a mock fitness-service:
  docker compose up kong-gateway my-db auth-service fitness-service
Skipped automatically when INTEGRATION_TESTS env var is not set.
"""

from __future__ import annotations

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
    import psycopg2

    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = False
    yield conn
    conn.close()


def _seed_session(db_conn) -> str:
    from datetime import datetime, timedelta

    user_id = uuid.uuid4()
    expires_at = datetime.now(tz=UTC) + timedelta(days=30)
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app.sessions (user_id, metadata, expires_at) VALUES (%s, %s, %s) RETURNING session_id",  # noqa: E501
            (str(user_id), None, expires_at),
        )
        row = cur.fetchone()
    db_conn.commit()
    return str(row[0])


class TestDynamicRouting:
    def test_auth_service_route_forwarded_correctly(self, db_conn):
        """GET /auth-service/auth/health → 200 from auth-service:3001."""
        session_id = _seed_session(db_conn)
        resp = httpx.get(
            f"{BASE_URL}/auth-service/auth/health",
            cookies={"app_session": session_id},
        )
        assert resp.status_code == 200
        assert resp.json().get("status") == "ok"

    def test_new_service_routed_to_port_3000(self, db_conn):
        """GET /fitness-service/health → forwarded to fitness-service:3000 (zero-touch)."""
        session_id = _seed_session(db_conn)
        resp = httpx.get(
            f"{BASE_URL}/fitness-service/health",
            cookies={"app_session": session_id},
        )
        # fitness-service:3000 must return a 200 health check
        assert resp.status_code == 200

    def test_nonexistent_service_returns_502(self, db_conn):
        """GET /nonexistent-service/api → 502 because no DNS resolves."""
        session_id = _seed_session(db_conn)
        resp = httpx.get(
            f"{BASE_URL}/nonexistent-xyzzy-service/api",
            cookies={"app_session": session_id},
        )
        assert resp.status_code == 502

    def test_blocked_prefix_admin_returns_404(self, db_conn):
        """GET /admin/anything → 404 (blocked at gateway level)."""
        session_id = _seed_session(db_conn)
        resp = httpx.get(
            f"{BASE_URL}/admin/anything",
            cookies={"app_session": session_id},
        )
        assert resp.status_code == 404

    def test_catch_all_route_has_x_request_id(self, db_conn):
        """Requests on the catch-all route still receive X-Request-ID."""
        session_id = _seed_session(db_conn)
        resp = httpx.get(
            f"{BASE_URL}/auth-service/auth/health",
            cookies={"app_session": session_id},
        )
        assert "x-request-id" in resp.headers

    def test_catch_all_route_requires_valid_session(self):
        """Catch-all route still enforces session-identity (no cookie → 401)."""
        resp = httpx.get(f"{BASE_URL}/fitness-service/health")
        assert resp.status_code == 401
