"""Unit tests for session-identity plugin — Plugin.response() phase."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from src.plugins.shared.db import DatabaseUnavailableError

SESSION_ID = uuid.UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")
USER_ID = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")


@pytest.fixture()
def mock_kong():
    kong = MagicMock()
    # By default: X-Auth-Success not set, X-Auth-User-Id not set
    kong.response.get_header.return_value = None
    kong.request.get_header.return_value = None
    return kong


@pytest.fixture()
def conf():
    return MagicMock(cookie_name="app_session")


@pytest.fixture(autouse=True)
def _reset_schema_guard():
    """Reset the lazy-migration guard and stub run_migrations so response-phase
    tests never touch a real database."""
    import src.plugins.session_identity as si
    si._SCHEMA_READY = False
    with patch("src.plugins.session_identity.run_migrations"):
        yield
    si._SCHEMA_READY = False


def _make_plugin(conf):
    from src.plugins.session_identity import Plugin
    return Plugin(conf)


def _call_response(mock_kong, conf, auth_success: str | None = "true", user_id: str | None = None):
    actual_user_id = user_id if user_id is not None else str(USER_ID)

    def _get_header_side_effect(name: str) -> str | None:
        if name == "X-Auth-Success":
            return auth_success
        if name == "X-Auth-User-Id":
            return actual_user_id
        return None

    mock_kong.response.get_header.side_effect = _get_header_side_effect

    with patch(
        "src.plugins.session_identity.session_store.create_session",
        return_value=SESSION_ID,
    ) as mock_create:
        _make_plugin(conf).response(mock_kong)
        return mock_create


class TestHeaderFilterPhase:
    def test_creates_session_when_auth_success(self, mock_kong, conf):
        mock_create = _call_response(mock_kong, conf, auth_success="true")
        mock_create.assert_called_once()
        call_kwargs = mock_create.call_args
        assert call_kwargs.args[0] == USER_ID

    def test_sets_cookie_with_correct_attributes(self, mock_kong, conf, monkeypatch):
        monkeypatch.delenv("COOKIE_SECURE", raising=False)
        _call_response(mock_kong, conf)
        mock_kong.response.add_header.assert_called_once()
        header_name, cookie_value = mock_kong.response.add_header.call_args.args
        assert header_name == "Set-Cookie"
        assert "app_session=" in cookie_value
        assert str(SESSION_ID) in cookie_value
        assert "HttpOnly" in cookie_value
        assert "Secure" in cookie_value
        assert "SameSite=Strict" in cookie_value
        assert "Max-Age=2592000" in cookie_value

    def test_cookie_omits_secure_flag_when_cookie_secure_false(self, mock_kong, conf, monkeypatch):
        monkeypatch.setenv("COOKIE_SECURE", "false")
        _call_response(mock_kong, conf)
        mock_kong.response.add_header.assert_called_once()
        _, cookie_value = mock_kong.response.add_header.call_args.args
        assert "Secure" not in cookie_value
        assert "HttpOnly" in cookie_value
        assert "SameSite=Strict" in cookie_value

    def test_removes_x_auth_success_header_from_response(self, mock_kong, conf):
        _call_response(mock_kong, conf)
        mock_kong.response.clear_header.assert_any_call("X-Auth-Success")

    def test_removes_x_auth_user_id_header_from_response(self, mock_kong, conf):
        _call_response(mock_kong, conf)
        mock_kong.response.clear_header.assert_any_call("X-Auth-User-Id")

    def test_no_op_when_auth_success_not_true(self, mock_kong, conf):
        mock_kong.response.get_header.return_value = None
        _make_plugin(conf).response(mock_kong)
        mock_kong.response.add_header.assert_not_called()

    def test_no_session_created_without_auth_success(self, mock_kong, conf):
        mock_kong.response.get_header.return_value = None
        with patch("src.plugins.session_identity.session_store.create_session") as mock_create:
            _make_plugin(conf).response(mock_kong)
        mock_create.assert_not_called()

    def test_exits_503_when_db_unavailable(self, mock_kong, conf):
        def _get_header_side_effect(name: str):
            if name == "X-Auth-Success":
                return "true"
            if name == "X-Auth-User-Id":
                return str(USER_ID)
            return None
        mock_kong.response.get_header.side_effect = _get_header_side_effect
        with patch(
            "src.plugins.session_identity.session_store.create_session",
            side_effect=DatabaseUnavailableError("db down"),
        ):
            _make_plugin(conf).response(mock_kong)
        assert mock_kong.response.exit.call_args.args[0] == 503

    def test_exits_503_when_user_id_header_missing(self, mock_kong, conf):
        def _get_header_side_effect(name: str):
            if name == "X-Auth-Success":
                return "true"
            return None  # X-Auth-User-Id not set
        mock_kong.response.get_header.side_effect = _get_header_side_effect
        with patch("src.plugins.session_identity.session_store.create_session") as mock_create:
            _make_plugin(conf).response(mock_kong)
        mock_create.assert_not_called()
        assert mock_kong.response.exit.call_args.args[0] == 503

    def _auth_success_headers(self, mock_kong):
        def _hdr(name: str):
            if name == "X-Auth-Success":
                return "true"
            if name == "X-Auth-User-Id":
                return str(USER_ID)
            return None
        mock_kong.response.get_header.side_effect = _hdr

    def test_first_login_bootstraps_schema_before_create(self, mock_kong, conf):
        """First successful login runs the idempotent migration before INSERT."""
        import src.plugins.session_identity as si
        si._SCHEMA_READY = False
        self._auth_success_headers(mock_kong)
        with (
            patch("src.plugins.session_identity.run_migrations") as mock_mig,
            patch(
                "src.plugins.session_identity.session_store.create_session",
                return_value=SESSION_ID,
            ),
        ):
            _make_plugin(conf).response(mock_kong)
        mock_mig.assert_called_once()

    def test_skips_migration_when_already_bootstrapped(self, mock_kong, conf):
        """Once the schema is ready, later logins must not re-run migrations."""
        import src.plugins.session_identity as si
        si._SCHEMA_READY = True
        self._auth_success_headers(mock_kong)
        with (
            patch("src.plugins.session_identity.run_migrations") as mock_mig,
            patch(
                "src.plugins.session_identity.session_store.create_session",
                return_value=SESSION_ID,
            ),
        ):
            _make_plugin(conf).response(mock_kong)
        mock_mig.assert_not_called()

    def test_exits_503_when_migration_fails(self, mock_kong, conf):
        """If the schema bootstrap fails, fail closed with 503 and create no session."""
        self._auth_success_headers(mock_kong)
        with (
            patch(
                "src.plugins.session_identity.run_migrations",
                side_effect=DatabaseUnavailableError("no schema"),
            ),
            patch("src.plugins.session_identity.session_store.create_session") as mock_create,
        ):
            _make_plugin(conf).response(mock_kong)
        mock_create.assert_not_called()
        assert mock_kong.response.exit.call_args.args[0] == 503
