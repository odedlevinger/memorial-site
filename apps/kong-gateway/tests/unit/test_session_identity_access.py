"""Unit tests for session-identity plugin — Plugin.access() phase."""

from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from src.plugins.shared.db import DatabaseUnavailableError
from src.plugins.shared.session_store import Session

SESSION_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
USER_ID = uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")

NOW = datetime.now(tz=timezone.utc)
VALID_SESSION = Session(
    session_id=SESSION_ID,
    user_id=USER_ID,
    metadata={"is_mobile": False},
    expires_at=NOW + timedelta(days=30),
    created_at=NOW,
)


@pytest.fixture()
def mock_kong():
    """Minimal mock for the Kong PDK."""
    kong = MagicMock()
    kong.request.get_header.return_value = None
    kong.request.get_path.return_value = "/auth-service/auth/me"
    kong.response.exit = MagicMock()
    kong.service.request.set_header = MagicMock()
    kong.service.request.clear_header = MagicMock()
    return kong


@pytest.fixture()
def conf():
    return MagicMock(cookie_name="app_session")


@pytest.fixture(autouse=True)
def _reset_schema_guard():
    """Reset the lazy-migration guard and stub run_migrations so access-phase
    tests never touch a real database."""
    import src.plugins.session_identity as si
    si._SCHEMA_READY = False
    with patch("src.plugins.session_identity.run_migrations"):
        yield
    si._SCHEMA_READY = False


def _make_plugin(conf):
    from src.plugins.session_identity import Plugin
    return Plugin(conf)


class TestAccessPhase:
    def test_valid_session_injects_x_user_context(self, mock_kong, conf):
        with patch("src.plugins.session_identity.session_store.get_session", return_value=VALID_SESSION):  # noqa: E501
            mock_kong.request.get_header.return_value = f"app_session={SESSION_ID}"
            _make_plugin(conf).access(mock_kong)

        mock_kong.service.request.clear_header.assert_any_call("X-User-Context")
        mock_kong.service.request.clear_header.assert_any_call("X-User-Id")

        set_calls = mock_kong.service.request.set_header.call_args_list
        ctx_call = next(c for c in set_calls if c.args[0] == "X-User-Context")
        decoded = json.loads(base64.urlsafe_b64decode(ctx_call.args[1] + "=="))
        assert decoded["user_id"] == str(USER_ID)
        assert decoded["session_id"] == str(SESSION_ID)
        assert "expires_at" in decoded
        assert "issued_at" in decoded

        uid_call = next(c for c in set_calls if c.args[0] == "X-User-Id")
        assert uid_call.args[1] == str(USER_ID)

    def test_missing_cookie_returns_401(self, mock_kong, conf):
        mock_kong.request.get_header.return_value = None
        _make_plugin(conf).access(mock_kong)

        mock_kong.response.exit.assert_called_once()
        assert mock_kong.response.exit.call_args.args[0] == 401

    def test_expired_session_returns_401(self, mock_kong, conf):
        with patch("src.plugins.session_identity.session_store.get_session", return_value=None):
            mock_kong.request.get_header.return_value = f"app_session={SESSION_ID}"
            _make_plugin(conf).access(mock_kong)

        mock_kong.response.exit.assert_called_once()
        assert mock_kong.response.exit.call_args.args[0] == 401

    def test_401_response_includes_www_authenticate(self, mock_kong, conf):
        mock_kong.request.get_header.return_value = None
        _make_plugin(conf).access(mock_kong)

        _, _, headers = mock_kong.response.exit.call_args.args
        assert "WWW-Authenticate" in headers

    def test_db_unavailable_returns_503(self, mock_kong, conf):
        with patch(
            "src.plugins.session_identity.session_store.get_session",
            side_effect=DatabaseUnavailableError("timeout"),
        ):
            mock_kong.request.get_header.return_value = f"app_session={SESSION_ID}"
            _make_plugin(conf).access(mock_kong)

        assert mock_kong.response.exit.call_args.args[0] == 503

    def test_migration_failure_returns_503(self, mock_kong, conf):
        """A valid cookie but a failed schema bootstrap fails closed with 503."""
        with patch(
            "src.plugins.session_identity.run_migrations",
            side_effect=DatabaseUnavailableError("no schema"),
        ):
            mock_kong.request.get_header.return_value = f"app_session={SESSION_ID}"
            _make_plugin(conf).access(mock_kong)
        assert mock_kong.response.exit.call_args.args[0] == 503

    def test_client_forged_headers_are_overwritten(self, mock_kong, conf):
        """Gateway must strip any client-supplied X-User-Context and X-User-Id before injecting its own."""
        with patch("src.plugins.session_identity.session_store.get_session", return_value=VALID_SESSION):  # noqa: E501
            mock_kong.request.get_header.return_value = f"app_session={SESSION_ID}"
            _make_plugin(conf).access(mock_kong)

        calls = mock_kong.service.request.method_calls
        # Both clear_header calls must precede their respective set_header calls
        ctx_clear_idx = next(i for i, c in enumerate(calls) if c[0] == "clear_header" and c.args[0] == "X-User-Context")
        ctx_set_idx = next(i for i, c in enumerate(calls) if c[0] == "set_header" and c.args[0] == "X-User-Context")
        uid_clear_idx = next(i for i, c in enumerate(calls) if c[0] == "clear_header" and c.args[0] == "X-User-Id")
        uid_set_idx = next(i for i, c in enumerate(calls) if c[0] == "set_header" and c.args[0] == "X-User-Id")
        assert ctx_clear_idx < ctx_set_idx
        assert uid_clear_idx < uid_set_idx

    def test_valid_session_does_not_call_response_exit(self, mock_kong, conf):
        with patch("src.plugins.session_identity.session_store.get_session", return_value=VALID_SESSION):  # noqa: E501
            mock_kong.request.get_header.return_value = f"app_session={SESSION_ID}"
            _make_plugin(conf).access(mock_kong)

        mock_kong.response.exit.assert_not_called()

    def test_cookie_present_but_name_not_found_returns_401(self, mock_kong, conf):
        """Cookie header has cookies but none match app_session → 401."""
        mock_kong.request.get_header.return_value = "other_cookie=abc; another=def"
        _make_plugin(conf).access(mock_kong)

        assert mock_kong.response.exit.call_args.args[0] == 401

    def test_invalid_uuid_cookie_returns_401(self, mock_kong, conf):
        """Cookie value that is not a valid UUID → 401."""
        mock_kong.request.get_header.return_value = "app_session=not-a-uuid"
        _make_plugin(conf).access(mock_kong)

        assert mock_kong.response.exit.call_args.args[0] == 401

    def test_public_path_login_bypasses_auth(self, mock_kong, conf):
        """Requests to /login must not be intercepted by session validation."""
        mock_kong.request.get_path.return_value = "/login"
        mock_kong.request.get_header.return_value = None  # no cookie
        _make_plugin(conf).access(mock_kong)

        mock_kong.response.exit.assert_not_called()

    def test_public_path_health_bypasses_auth(self, mock_kong, conf):
        """Requests to /auth-service/auth/health must bypass session validation."""
        mock_kong.request.get_path.return_value = "/auth-service/auth/health"
        mock_kong.request.get_header.return_value = None
        _make_plugin(conf).access(mock_kong)

        mock_kong.response.exit.assert_not_called()

    @pytest.mark.parametrize("path", [
        "/auth-service/auth/login",
        "/auth-service/auth/register",
        "/auth-service/auth/google/callback",
        "/auth-service/auth/google/id-token",
        "/auth-service/auth/refresh",
    ])
    def test_auth_endpoints_bypass_session_check(self, mock_kong, conf, path):
        """All pre-session auth endpoints must bypass session validation."""
        mock_kong.request.get_path.return_value = path
        mock_kong.request.get_header.return_value = None
        _make_plugin(conf).access(mock_kong)

        mock_kong.response.exit.assert_not_called()

    def test_protected_path_without_cookie_returns_401(self, mock_kong, conf):
        """A protected (non-public) path without a session cookie returns 401."""
        mock_kong.request.get_path.return_value = "/auth-service/api/profile"
        mock_kong.request.get_header.return_value = None
        _make_plugin(conf).access(mock_kong)

        mock_kong.response.exit.assert_called_once()
        assert mock_kong.response.exit.call_args.args[0] == 401

    def test_init_worker_does_not_run_migrations(self, mock_kong, conf):
        """init_worker() must not run migrations — schema bootstrap is deferred to the
        first request so psycopg2's blocking IO never stalls Kong's gevent loop."""
        with patch("src.plugins.session_identity.run_migrations") as mock_mig:
            _make_plugin(conf).init_worker(mock_kong)
        mock_mig.assert_not_called()


class TestPublicContentReads:
    """content-service public reads: GET/HEAD only, no traversal, forged identity stripped."""

    @pytest.mark.parametrize("method,path", [
        ("GET", "/content-service/content/public/topics"),
        ("GET", "/content-service/content/public/topics/streets"),
        ("HEAD", "/content-service/content/files/pictures/x/thumb.jpg"),
    ])
    def test_public_reads_bypass_session_and_strip_identity(self, mock_kong, conf, method, path):
        mock_kong.request.get_path.return_value = path
        mock_kong.request.get_method.return_value = method
        _make_plugin(conf).access(mock_kong)

        mock_kong.response.exit.assert_not_called()
        cleared = {c.args[0] for c in mock_kong.service.request.clear_header.call_args_list}
        assert cleared == {"X-User-Context", "X-User-Id"}
        mock_kong.service.request.set_header.assert_not_called()

    @pytest.mark.parametrize("method,path", [
        ("POST", "/content-service/content/public/topics"),
        ("DELETE", "/content-service/content/public/topics/x"),
        ("GET", "/content-service/content/public/../topics"),
        ("GET", "/content-service/content/topics"),
        ("GET", "/content-service/content/publicx/topics"),
    ])
    def test_writes_traversal_and_private_paths_require_session(self, mock_kong, conf, method, path):
        mock_kong.request.get_path.return_value = path
        mock_kong.request.get_method.return_value = method
        _make_plugin(conf).access(mock_kong)

        assert mock_kong.response.exit.call_args.args[0] == 401
