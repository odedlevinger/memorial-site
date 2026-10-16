"""Unit tests for shared/iam.py — OIDC token fetching and caching."""

from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import pytest
import src.plugins.shared.iam as iam_module
from src.plugins.shared.iam import get_oidc_token

AUDIENCE = "https://memorial-site-auth-example.run.app"


@pytest.fixture(autouse=True)
def clear_cache():
    """Reset the token cache before every test."""
    iam_module._cache.clear()
    yield
    iam_module._cache.clear()


def _mock_urlopen(value: str = "fresh-token"):
    resp = MagicMock()
    resp.__enter__ = lambda s: s
    resp.__exit__ = MagicMock(return_value=False)
    resp.read.return_value = value.encode("utf-8")
    return resp


class TestGetOidcToken:
    def test_returns_none_when_iam_disabled(self):
        with patch.dict("os.environ", {"GCP_IAM_ENABLED": "false"}):
            assert get_oidc_token(AUDIENCE) is None

    def test_returns_none_when_iam_env_absent(self):
        env = {k: v for k, v in __import__("os").environ.items() if k != "GCP_IAM_ENABLED"}
        with patch.dict("os.environ", env, clear=True):
            assert get_oidc_token(AUDIENCE) is None

    def test_fetches_token_from_metadata_server(self):
        with (
            patch.dict("os.environ", {"GCP_IAM_ENABLED": "true"}),
            patch("urllib.request.urlopen", return_value=_mock_urlopen("new-token")),
        ):
            result = get_oidc_token(AUDIENCE)
        assert result == "new-token"

    def test_token_is_cached_after_fetch(self):
        with (
            patch.dict("os.environ", {"GCP_IAM_ENABLED": "true"}),
            patch("urllib.request.urlopen", return_value=_mock_urlopen("cached-token")) as m,
        ):
            get_oidc_token(AUDIENCE)
            get_oidc_token(AUDIENCE)  # second call — must use cache
            assert m.call_count == 1

    def test_returns_cached_token_without_network_call(self):
        iam_module._cache[AUDIENCE] = ("stored-token", time.monotonic() + 1000)
        with (
            patch.dict("os.environ", {"GCP_IAM_ENABLED": "true"}),
            patch("urllib.request.urlopen") as mock_open,
        ):
            result = get_oidc_token(AUDIENCE)
            mock_open.assert_not_called()
        assert result == "stored-token"

    def test_expired_cache_entry_triggers_refetch(self):
        iam_module._cache[AUDIENCE] = ("old-token", time.monotonic() - 1)  # already expired
        with (
            patch.dict("os.environ", {"GCP_IAM_ENABLED": "true"}),
            patch("urllib.request.urlopen", return_value=_mock_urlopen("refreshed-token")),
        ):
            result = get_oidc_token(AUDIENCE)
        assert result == "refreshed-token"

    def test_cache_entry_stores_correct_expiry(self):
        with (
            patch.dict("os.environ", {"GCP_IAM_ENABLED": "true"}),
            patch("urllib.request.urlopen", return_value=_mock_urlopen()),
        ):
            before = time.monotonic()
            get_oidc_token(AUDIENCE)
            after = time.monotonic()
        _, expiry = iam_module._cache[AUDIENCE]
        assert before + iam_module._CACHE_TTL_SECS <= expiry <= after + iam_module._CACHE_TTL_SECS

    def test_metadata_request_includes_flavor_header(self):
        with (
            patch.dict("os.environ", {"GCP_IAM_ENABLED": "true"}),
            patch("urllib.request.urlopen", return_value=_mock_urlopen()) as mock_open,
        ):
            get_oidc_token(AUDIENCE)
        req = mock_open.call_args.args[0]
        assert req.get_header("Metadata-flavor") == "Google"

    def test_metadata_url_includes_audience_and_format(self):
        with (
            patch.dict("os.environ", {"GCP_IAM_ENABLED": "true"}),
            patch("urllib.request.urlopen", return_value=_mock_urlopen()) as mock_open,
        ):
            get_oidc_token(AUDIENCE)
        req = mock_open.call_args.args[0]
        assert f"audience={AUDIENCE}" in req.full_url
        assert "format=full" in req.full_url

    def test_returns_none_and_logs_on_network_error(self, caplog):
        import urllib.error
        with (
            patch.dict("os.environ", {"GCP_IAM_ENABLED": "true"}),
            patch("urllib.request.urlopen", side_effect=urllib.error.URLError("timed out")),
        ):
            with caplog.at_level("ERROR"):
                result = get_oidc_token(AUDIENCE)
        assert result is None
        assert any("timed out" in record.message for record in caplog.records)
