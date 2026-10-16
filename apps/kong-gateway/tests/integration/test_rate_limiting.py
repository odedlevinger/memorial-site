"""Integration tests for US4 — rate limiting.

Requires a running stack: docker compose up kong-gateway my-db auth-service
Skipped automatically when INTEGRATION_TESTS env var is not set.

NOTE: These tests manipulate rate-limit counters. Run in isolation to avoid
      interference with other integration tests sharing the same Kong instance.
"""

from __future__ import annotations

import os

import httpx
import pytest

BASE_URL = os.environ.get("KONG_BASE_URL", "http://localhost:8000")

pytestmark = pytest.mark.skipif(
    os.environ.get("INTEGRATION_TESTS") != "1",
    reason="Set INTEGRATION_TESTS=1 to run integration tests",
)


class TestRateLimiting:
    def test_601st_request_returns_429(self):
        """601st request to any route from same IP returns 429."""
        results = []
        for _ in range(601):
            r = httpx.get(f"{BASE_URL}/auth-service/auth/health")
            results.append(r.status_code)
        assert 429 in results, f"Expected 429 after 600 requests; got: {set(results)}"

    def test_429_response_has_retry_after(self):
        """429 responses must include Retry-After header."""
        results = []
        for _ in range(601):
            r = httpx.get(f"{BASE_URL}/auth-service/auth/health")
            results.append(r)
        rate_limited = [r for r in results if r.status_code == 429]
        assert rate_limited, "No 429 responses received"
        for r in rate_limited:
            assert "retry-after" in r.headers or "x-ratelimit-reset" in r.headers

    def test_login_rate_limited_at_5_per_minute(self):
        """The /login route (5 req/min) triggers 429 after 5 requests."""
        results = []
        for _ in range(6):
            r = httpx.post(
                f"{BASE_URL}/login",
                json={"email": "ratelimit@example.com", "password": "wrong"},
            )
            results.append(r.status_code)
        # At least one must be 429
        assert 429 in results, f"Expected 429 within 6 login attempts; got: {results}"
