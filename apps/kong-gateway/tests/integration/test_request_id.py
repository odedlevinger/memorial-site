"""Integration tests for US3 — X-Request-ID traceability.

Requires a running stack: docker compose up kong-gateway my-db auth-service
Skipped automatically when INTEGRATION_TESTS env var is not set.
"""

from __future__ import annotations

import os
import re
import uuid

import httpx
import pytest

BASE_URL = os.environ.get("KONG_BASE_URL", "http://localhost:8000")

pytestmark = pytest.mark.skipif(
    os.environ.get("INTEGRATION_TESTS") != "1",
    reason="Set INTEGRATION_TESTS=1 to run integration tests",
)

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


class TestRequestId:
    def test_response_has_x_request_id_when_not_provided(self):
        """Requests without X-Request-ID receive a generated UUID."""
        resp = httpx.get(f"{BASE_URL}/auth-service/auth/health")
        # Even 401 responses must carry X-Request-ID
        assert "x-request-id" in resp.headers
        assert UUID_RE.match(resp.headers["x-request-id"])

    def test_provided_x_request_id_is_echoed(self):
        """Client-supplied X-Request-ID is echoed back in the response."""
        custom_id = str(uuid.uuid4())
        resp = httpx.get(
            f"{BASE_URL}/auth-service/auth/health",
            headers={"X-Request-ID": custom_id},
        )
        assert resp.headers.get("x-request-id") == custom_id

    def test_401_error_response_includes_x_request_id(self):
        """Unauthenticated (401) responses must carry X-Request-ID."""
        resp = httpx.get(f"{BASE_URL}/auth-service/auth/health")
        assert resp.status_code == 401
        assert "x-request-id" in resp.headers

    def test_request_id_is_consistent_across_multiple_requests(self):
        """Each request gets a unique X-Request-ID."""
        ids = set()
        for _ in range(3):
            resp = httpx.get(f"{BASE_URL}/auth-service/auth/health")
            ids.add(resp.headers.get("x-request-id"))
        assert len(ids) == 3, "Expected unique X-Request-ID per request"
