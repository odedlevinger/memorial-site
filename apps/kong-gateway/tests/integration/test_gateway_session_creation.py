"""Integration test: login creates a session row in the gateway DB.

Covers the response code path shared by email/password login and Google
OAuth — both endpoints emit X-Auth-Success: true, which triggers
session_identity.response() to create the session and set the cookie.

Requires a running stack:
    docker compose up kong-gateway my-db auth-service

Run with:
    INTEGRATION_TESTS=1 pytest tests/integration/test_gateway_session_creation.py -v
"""

from __future__ import annotations

import os
import uuid

import httpx
import psycopg2
import pytest

BASE_URL = os.environ.get("KONG_BASE_URL", "http://localhost:8000")
DB_DSN = os.environ.get(
    "GATEWAY_DB_DSN",
    "postgresql://gateway-service_user:12345678@localhost:5432/gateway-service",
)

# Unique email per test run so the user doesn't already exist.
_TEST_EMAIL = f"gw-session-test-{uuid.uuid4().hex[:8]}@example.com"
_TEST_PASSWORD = "Test1234!"

pytestmark = pytest.mark.skipif(
    os.environ.get("INTEGRATION_TESTS") != "1",
    reason="Set INTEGRATION_TESTS=1 to run integration tests",
)


@pytest.fixture(scope="module")
def db_conn():
    """Direct connection to the gateway-service DB for result verification."""
    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = True
    yield conn
    conn.close()


@pytest.fixture(scope="module")
def registered_user():
    """Register a fresh test user once for the whole module."""
    resp = httpx.post(
        f"{BASE_URL}/auth-service/auth/register",
        json={
            "email": _TEST_EMAIL,
            "password": _TEST_PASSWORD,
            "consent": True,
        },
        timeout=10,
    )
    assert resp.status_code in (201, 200), (
        f"Registration failed: {resp.status_code} {resp.text}"
    )
    return _TEST_EMAIL, _TEST_PASSWORD


class TestGatewaySessionCreation:
    def test_login_sets_app_session_cookie(self, registered_user):
        """After a successful login, the gateway must return a app_session cookie."""
        email, password = registered_user
        resp = httpx.post(
            f"{BASE_URL}/auth-service/auth/login",
            json={"email": email, "password": password},
            timeout=10,
        )
        assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
        assert "app_session" in resp.cookies, (
            "response did not set app_session cookie — session creation failed"
        )

    def test_login_creates_session_row_in_db(self, db_conn, registered_user):
        """The session cookie value must correspond to a row in app.sessions."""
        email, password = registered_user
        resp = httpx.post(
            f"{BASE_URL}/auth-service/auth/login",
            json={"email": email, "password": password},
            timeout=10,
        )
        assert resp.status_code == 200

        session_id_str = resp.cookies.get("app_session")
        assert session_id_str is not None, "No app_session cookie to look up in DB"

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT user_id, expires_at, created_at FROM app.sessions WHERE session_id = %s",
                (session_id_str,),
            )
            row = cur.fetchone()

        assert row is not None, (
            f"Session {session_id_str} not found in app.sessions — "
            "response may have failed to call session_store.create_session()"
        )

    def test_session_in_db_is_not_expired(self, db_conn, registered_user):
        """The newly created session must be valid (expires_at in the future)."""
        email, password = registered_user
        resp = httpx.post(
            f"{BASE_URL}/auth-service/auth/login",
            json={"email": email, "password": password},
            timeout=10,
        )
        assert resp.status_code == 200

        session_id_str = resp.cookies.get("app_session")
        assert session_id_str is not None

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM app.sessions WHERE session_id = %s AND expires_at > NOW()",
                (session_id_str,),
            )
            count = cur.fetchone()[0]

        assert count == 1, (
            f"Session {session_id_str} exists but is already expired — check TTL logic"
        )

    def test_session_cookie_is_usable_for_protected_route(self, registered_user):
        """A session cookie from login must grant access to a protected endpoint."""
        email, password = registered_user
        login_resp = httpx.post(
            f"{BASE_URL}/auth-service/auth/login",
            json={"email": email, "password": password},
            timeout=10,
        )
        assert login_resp.status_code == 200
        session_id = login_resp.cookies.get("app_session")
        assert session_id is not None

        # Inject cookies via header to bypass httpx's Secure-cookie-over-HTTP restriction.
        # app_session has Secure flag (correct for prod) but local stack uses plain HTTP.
        access_token = login_resp.cookies.get("app_access", "")
        protected_resp = httpx.get(
            f"{BASE_URL}/auth-service/auth/validate",
            headers={"Cookie": f"app_session={session_id}; app_access={access_token}"},
            timeout=10,
        )
        assert protected_resp.status_code == 200, (
            f"Protected route returned {protected_resp.status_code} — "
            "session exists in DB but get_session() may be failing"
        )
