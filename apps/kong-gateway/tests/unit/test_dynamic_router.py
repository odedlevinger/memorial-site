"""Unit tests for dynamic-router plugin — Plugin.access() phase.

Reduced infrastructure baseline: the only registered upstream is auth-service.
The new business domain adds upstreams to UPSTREAM_MAP and corresponding tests here.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture()
def mock_kong():
    return MagicMock()


@pytest.fixture()
def conf():
    return MagicMock()


def _call_access(mock_kong, conf, path: str) -> None:
    mock_kong.request.get_path.return_value = path
    from src.plugins.dynamic_router import Plugin
    Plugin(conf).access(mock_kong)


class TestDynamicRouterAccess:
    def test_auth_service_path_routes_to_upstream(self, mock_kong, conf):
        _call_access(mock_kong, conf, "/auth-service/auth/profile")
        mock_kong.service.set_upstream.assert_called_once_with("auth-service")

    def test_auth_service_strips_prefix_from_path(self, mock_kong, conf):
        _call_access(mock_kong, conf, "/auth-service/auth/profile")
        mock_kong.service.request.set_path.assert_called_once_with("/auth/profile")

    def test_single_segment_with_trailing_slash(self, mock_kong, conf):
        _call_access(mock_kong, conf, "/auth-service/")
        mock_kong.service.set_upstream.assert_called_once_with("auth-service")
        mock_kong.service.request.set_path.assert_called_once_with("/")

    def test_auth_service_single_segment_uses_root_path(self, mock_kong, conf):
        _call_access(mock_kong, conf, "/auth-service")
        mock_kong.service.set_upstream.assert_called_once_with("auth-service")
        mock_kong.service.request.set_path.assert_called_once_with("/")

    def test_unknown_service_returns_404(self, mock_kong, conf):
        """Services not in UPSTREAM_MAP return 404 — no zero-touch discovery."""
        _call_access(mock_kong, conf, "/unknown-service/items")
        mock_kong.response.exit.assert_called_once()
        assert mock_kong.response.exit.call_args.args[0] == 404

    def test_removed_domain_service_returns_404(self, mock_kong, conf):
        """An unmapped service segment is not routable (no zero-touch discovery)."""
        _call_access(mock_kong, conf, "/another-unknown/resource/123")
        mock_kong.response.exit.assert_called_once()
        assert mock_kong.response.exit.call_args.args[0] == 404
        mock_kong.service.set_upstream.assert_not_called()

    def test_login_path_routes_to_auth_service(self, mock_kong, conf):
        """PATH_PASSTHROUGH: /login → auth-service upstream with rewritten path."""
        _call_access(mock_kong, conf, "/login")
        mock_kong.service.set_upstream.assert_called_once_with("auth-service")
        mock_kong.service.request.set_path.assert_called_once_with("/auth/login")

    def test_blocked_prefix_admin_returns_404(self, mock_kong, conf):
        _call_access(mock_kong, conf, "/admin/anything")
        mock_kong.response.exit.assert_called_once()
        assert mock_kong.response.exit.call_args.args[0] == 404

    def test_blocked_prefix_health_returns_404(self, mock_kong, conf):
        _call_access(mock_kong, conf, "/health")
        mock_kong.response.exit.assert_called_once()
        assert mock_kong.response.exit.call_args.args[0] == 404

    def test_blocked_prefix_metrics_returns_404(self, mock_kong, conf):
        _call_access(mock_kong, conf, "/metrics/prometheus")
        mock_kong.response.exit.assert_called_once()
        assert mock_kong.response.exit.call_args.args[0] == 404

    def test_blocked_prefix_does_not_call_set_upstream(self, mock_kong, conf):
        _call_access(mock_kong, conf, "/admin/secrets")
        mock_kong.service.set_upstream.assert_not_called()

    def test_empty_path_returns_404(self, mock_kong, conf):
        _call_access(mock_kong, conf, "/")
        mock_kong.response.exit.assert_called_once()
        assert mock_kong.response.exit.call_args.args[0] == 404

    def test_valid_service_does_not_call_exit(self, mock_kong, conf):
        _call_access(mock_kong, conf, "/auth-service/auth/health")
        mock_kong.response.exit.assert_not_called()

    def test_iam_token_injected_when_enabled(self, mock_kong, conf):
        """When audience is set, an OIDC Authorization header is injected."""
        mock_kong.request.get_header.return_value = None  # no original auth
        env = {
            "GCP_IAM_ENABLED": "true",
            "UPSTREAM_AUTH_SERVICE_AUDIENCE": "https://memorial-site-auth-example.run.app",
        }
        with (
            patch.dict("os.environ", env),
            patch("src.plugins.shared.iam.get_oidc_token", return_value="test-oidc-token"),
        ):
            _call_access(mock_kong, conf, "/auth-service/auth/profile")
        mock_kong.service.request.set_header.assert_any_call(
            "Authorization", "Bearer test-oidc-token"
        )

    def test_original_auth_preserved_as_forwarded(self, mock_kong, conf):
        """When client sends Authorization, it is preserved as X-Forwarded-Authorization."""
        mock_kong.request.get_header.return_value = "Bearer user-jwt-token"
        env = {
            "GCP_IAM_ENABLED": "true",
            "UPSTREAM_AUTH_SERVICE_AUDIENCE": "https://memorial-site-auth-example.run.app",
        }
        with (
            patch.dict("os.environ", env),
            patch("src.plugins.shared.iam.get_oidc_token", return_value="iam-token"),
        ):
            _call_access(mock_kong, conf, "/auth-service/auth/profile")
        mock_kong.service.request.set_header.assert_any_call(
            "X-Forwarded-Authorization", "Bearer user-jwt-token"
        )
        mock_kong.service.request.set_header.assert_any_call(
            "Authorization", "Bearer iam-token"
        )

    def test_iam_token_not_injected_when_audience_missing(self, mock_kong, conf):
        """When the audience env var is absent, token injection is skipped."""
        with (
            patch.dict("os.environ", {"GCP_IAM_ENABLED": "true"}, clear=False),
            patch("src.plugins.shared.iam.get_oidc_token") as mock_get,
        ):
            _call_access(mock_kong, conf, "/auth-service/auth/profile")
            mock_get.assert_not_called()

    def test_iam_token_injected_for_passthrough_path(self, mock_kong, conf):
        """IAM token is also injected for PATH_PASSTHROUGH routes (/login)."""
        mock_kong.request.get_header.return_value = None
        env = {
            "GCP_IAM_ENABLED": "true",
            "UPSTREAM_AUTH_SERVICE_AUDIENCE": "https://memorial-site-auth-example.run.app",
        }
        with (
            patch.dict("os.environ", env),
            patch("src.plugins.shared.iam.get_oidc_token", return_value="login-token"),
        ):
            _call_access(mock_kong, conf, "/login")
        mock_kong.service.request.set_header.assert_any_call(
            "Authorization", "Bearer login-token"
        )
