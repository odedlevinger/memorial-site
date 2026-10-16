"""Integration tests for US2 — login flow creates a session cookie.

Requires a running stack: docker compose up kong-gateway my-db auth-service
Skipped automatically when INTEGRATION_TESTS env var is not set.
"""

from __future__ import annotations

import os

import httpx
import pytest

BASE_URL = os.environ.get("KONG_BASE_URL", "http://localhost:8000")
TEST_EMAIL = os.environ.get("TEST_USER_EMAIL", "integration-test@example.com")
TEST_PASSWORD = os.environ.get("TEST_USER_PASSWORD", "Test1234!")

pytestmark = pytest.mark.skipif(
    os.environ.get("INTEGRATION_TESTS") != "1",
    reason="Set INTEGRATION_TESTS=1 to run integration tests",
)

COOKIE_NAME = "app_session"


class TestLoginFlow:
    def test_successful_login_sets_app_session_cookie(self):
        resp = httpx.post(
            f"{BASE_URL}/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        )
        assert resp.status_code == 200
        assert COOKIE_NAME in resp.cookies

    def test_session_cookie_has_correct_attributes(self):
        resp = httpx.post(
            f"{BASE_URL}/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        )
        assert resp.status_code == 200
        set_cookie = resp.headers.get("set-cookie", "")
        assert "HttpOnly" in set_cookie
        assert "Secure" in set_cookie
        assert "SameSite=Strict" in set_cookie
        assert "Max-Age=2592000" in set_cookie

    def test_successful_login_cookie_works_for_protected_route(self):
        login_resp = httpx.post(
            f"{BASE_URL}/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        )
        assert login_resp.status_code == 200
        session_id = login_resp.cookies.get(COOKIE_NAME)
        assert session_id is not None

        protected_resp = httpx.get(
            f"{BASE_URL}/auth-service/auth/health",
            cookies={COOKIE_NAME: session_id},
        )
        assert protected_resp.status_code == 200

    def test_failed_login_does_not_set_cookie(self):
        resp = httpx.post(
            f"{BASE_URL}/login",
            json={"email": TEST_EMAIL, "password": "wrongpassword"},
        )
        assert resp.status_code in (401, 400)
        assert COOKIE_NAME not in resp.cookies

    def test_get_login_route_is_not_blocked_by_session_check(self):
        """GET /login (or any method without session) must not return 401 from gateway."""
        resp = httpx.get(f"{BASE_URL}/login")
        # May be 404 or 405 from auth-service but NOT a 401 from the gateway
        assert resp.status_code != 401

    def test_login_route_rate_limited_at_5_per_minute(self):
        """The /login route has a 5 req/min limit; the 6th should be 429."""
        results = []
        for _ in range(6):
            r = httpx.post(
                f"{BASE_URL}/login",
                json={"email": "rate-limit-test@example.com", "password": "wrong"},
            )
            results.append(r.status_code)
        assert 429 in results, f"Expected a 429 after 5 requests, got: {results}"
