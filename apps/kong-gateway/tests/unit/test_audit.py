"""Unit tests for audit.py — GDPR-safe audit log helper."""

from __future__ import annotations

import json
from io import StringIO
from unittest.mock import patch

import pytest
from src.plugins.shared.audit import _FORBIDDEN_KEYS, log_event


def _capture_log_event(*args, **kwargs) -> dict:
    buf = StringIO()
    with patch("src.plugins.shared.audit.sys.stdout", buf):
        log_event(*args, **kwargs)
    return json.loads(buf.getvalue().strip())


class TestLogEvent:
    def test_includes_event_type(self):
        entry = _capture_log_event("session_created", "success")
        assert entry["event_type"] == "session_created"

    def test_includes_result(self):
        entry = _capture_log_event("session_validated", "success")
        assert entry["result"] == "success"

    def test_includes_timestamp(self):
        entry = _capture_log_event("session_rejected", "failure")
        assert "timestamp" in entry
        # ISO 8601 format check
        assert "T" in entry["timestamp"]

    def test_includes_client_type_when_provided(self):
        entry = _capture_log_event("session_created", "success", client_type="mobile")
        assert entry["client_type"] == "mobile"

    def test_omits_client_type_when_not_provided(self):
        entry = _capture_log_event("session_created", "success")
        assert "client_type" not in entry

    def test_passes_through_allowed_kwargs(self):
        entry = _capture_log_event("session_created", "success", service_name="auth-service")
        assert entry["service_name"] == "auth-service"

    @pytest.mark.parametrize("forbidden_key", list(_FORBIDDEN_KEYS))
    def test_drops_forbidden_key(self, forbidden_key):
        kwargs = {forbidden_key: "some-value"}
        entry = _capture_log_event("session_validated", "success", **kwargs)
        assert forbidden_key not in entry

    def test_user_id_never_logged(self):
        entry = _capture_log_event("session_created", "success", user_id="uuid-here")
        assert "user_id" not in entry

    def test_session_id_never_logged(self):
        entry = _capture_log_event("session_validated", "success", session_id="uuid-here")
        assert "session_id" not in entry

    def test_ip_address_never_logged(self):
        entry = _capture_log_event("session_rejected", "failure", ip_address="1.2.3.4")
        assert "ip_address" not in entry

    def test_output_is_valid_json(self):
        buf = StringIO()
        with patch("src.plugins.shared.audit.sys.stdout", buf):
            log_event("session_invalidated", "success")
        # Should not raise
        json.loads(buf.getvalue().strip())
