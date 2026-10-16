"""Unit tests for deletion_handler.py — user session erasure (GDPR Art. 17)."""

from __future__ import annotations

import os
import uuid
from unittest.mock import patch

import pytest

VALID_SECRET = "test-admin-secret-xyz"
VALID_USER_ID = str(uuid.uuid4())


def _handle(user_id: str, secret: str = VALID_SECRET, env_secret: str = VALID_SECRET):
    with (
        patch.dict(os.environ, {"GATEWAY_ADMIN_SECRET": env_secret}),
        patch("src.plugins.shared.deletion_handler._ADMIN_SECRET", env_secret),
        patch(
            "src.plugins.shared.deletion_handler.delete_sessions_for_user",
            return_value=3,
        ) as mock_delete,
        patch("src.plugins.shared.deletion_handler.log_event") as mock_log,
    ):
        from src.plugins.shared.deletion_handler import handle_user_deletion

        result = handle_user_deletion(user_id, secret)
        return result, mock_delete, mock_log


class TestHandleUserDeletion:
    def test_returns_deleted_count(self):
        result, _, _ = _handle(VALID_USER_ID)
        assert result == {"deleted": 3}

    def test_calls_delete_sessions_for_user(self):
        _result, mock_delete, _ = _handle(VALID_USER_ID)
        mock_delete.assert_called_once()
        call_arg = mock_delete.call_args.args[0]
        assert str(call_arg) == VALID_USER_ID

    def test_logs_audit_event_on_success(self):
        _, _, mock_log = _handle(VALID_USER_ID)
        mock_log.assert_called_once()
        call_kwargs = mock_log.call_args
        assert call_kwargs.args[0] == "user_sessions_deleted"
        assert call_kwargs.args[1] == "success"

    def test_audit_log_includes_session_count(self):
        _, _, mock_log = _handle(VALID_USER_ID)
        kwargs = mock_log.call_args.kwargs
        assert kwargs.get("session_count") == 3

    def test_wrong_secret_raises_value_error(self):
        with (
            patch.dict(os.environ, {"GATEWAY_ADMIN_SECRET": VALID_SECRET}),
            patch("src.plugins.shared.deletion_handler._ADMIN_SECRET", VALID_SECRET),
        ):
            from src.plugins.shared.deletion_handler import handle_user_deletion

            with pytest.raises(ValueError, match="Invalid admin secret"):
                handle_user_deletion(VALID_USER_ID, "wrong-secret")

    def test_invalid_user_id_raises_value_error(self):
        with (
            patch.dict(os.environ, {"GATEWAY_ADMIN_SECRET": VALID_SECRET}),
            patch("src.plugins.shared.deletion_handler._ADMIN_SECRET", VALID_SECRET),
        ):
            from src.plugins.shared.deletion_handler import handle_user_deletion

            with pytest.raises(ValueError, match="Invalid user_id format"):
                handle_user_deletion("not-a-uuid", VALID_SECRET)

    def test_unconfigured_secret_raises_runtime_error(self):
        with (
            patch.dict(os.environ, {"GATEWAY_ADMIN_SECRET": ""}),
            patch("src.plugins.shared.deletion_handler._ADMIN_SECRET", ""),
        ):
            from src.plugins.shared.deletion_handler import handle_user_deletion

            with pytest.raises(RuntimeError, match="GATEWAY_ADMIN_SECRET is not configured"):
                handle_user_deletion(VALID_USER_ID, "anything")
