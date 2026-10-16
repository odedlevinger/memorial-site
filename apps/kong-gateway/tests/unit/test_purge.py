"""Unit tests for purge.py — expired session purge job."""

from __future__ import annotations

from unittest.mock import patch


class TestRunPurge:
    def test_purge_returns_count_from_session_store(self):
        with patch("src.plugins.shared.purge.purge_expired", return_value=7) as mock_purge:
            from src.plugins.shared.purge import run_purge

            count = run_purge()

        assert count == 7
        mock_purge.assert_called_once()

    def test_purge_returns_zero_when_no_expired_sessions(self):
        with patch("src.plugins.shared.purge.purge_expired", return_value=0):
            from src.plugins.shared.purge import run_purge

            count = run_purge()

        assert count == 0

    def test_purge_propagates_db_error(self):
        import psycopg2

        with patch(
            "src.plugins.shared.purge.purge_expired",
            side_effect=psycopg2.OperationalError("connection refused"),
        ):
            import pytest
            from src.plugins.shared.purge import run_purge

            with pytest.raises(psycopg2.OperationalError):
                run_purge()
