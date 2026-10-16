"""Unit tests for db.py — connection pool and migration runner."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import psycopg2
import pytest
from src.plugins.shared.db import (
    DatabaseUnavailableError,
    get_connection,
    init_pool,
    return_connection,
    run_migrations,
)


@pytest.fixture(autouse=True)
def reset_pool():
    """Reset the module-level pool singleton before and after each test."""
    import src.plugins.shared.db as db_module

    db_module._pool = None
    yield
    db_module._pool = None


@pytest.fixture()
def db_env(monkeypatch):
    monkeypatch.setenv("GATEWAY_DB_HOST", "localhost")
    monkeypatch.setenv("GATEWAY_DB_PORT", "5432")
    monkeypatch.setenv("GATEWAY_DB_NAME", "gateway-service")
    monkeypatch.setenv("GATEWAY_DB_USER", "gw_user")
    monkeypatch.setenv("GATEWAY_DB_PASSWORD", "secret")


@pytest.fixture()
def mock_pool(db_env):
    """Return a mock pool installed as the module singleton."""
    pool = MagicMock()
    with patch("src.plugins.shared.db.psycopg2_pool.ThreadedConnectionPool", return_value=pool):
        init_pool()
    return pool


class TestInitPool:
    def test_creates_pool_with_correct_bounds(self, db_env):
        with patch("src.plugins.shared.db.psycopg2_pool.ThreadedConnectionPool") as mock_pool_cls:
            init_pool(min_conn=3, max_conn=15)
            args, _ = mock_pool_cls.call_args
            assert args[0] == 3
            assert args[1] == 15

    def test_raises_on_operational_error(self, db_env):
        with patch(
            "src.plugins.shared.db.psycopg2_pool.ThreadedConnectionPool",
            side_effect=psycopg2.OperationalError("connection refused"),
        ), pytest.raises(DatabaseUnavailableError, match="connection refused"):
            init_pool()


class TestGetConnection:
    def test_lazily_initialises_pool_when_none(self, db_env):
        """get_connection() must call init_pool() if pool is not yet initialised."""
        mock_conn = MagicMock()
        fake_pool = MagicMock()
        fake_pool.getconn.return_value = mock_conn
        with patch(
            "src.plugins.shared.db.psycopg2_pool.ThreadedConnectionPool",
            return_value=fake_pool,
        ):
            result = get_connection()
        assert result is mock_conn

    def test_raises_when_lazy_init_fails(self, db_env):
        """get_connection() must propagate DatabaseUnavailableError if init_pool fails."""
        with patch(
            "src.plugins.shared.db.psycopg2_pool.ThreadedConnectionPool",
            side_effect=psycopg2.OperationalError("refused"),
        ), pytest.raises(DatabaseUnavailableError, match="refused"):
            get_connection()

    def test_returns_connection_from_pool(self, mock_pool):
        mock_conn = MagicMock()
        mock_pool.getconn.return_value = mock_conn
        assert get_connection() is mock_conn

    def test_raises_when_pool_returns_none(self, mock_pool):
        mock_pool.getconn.return_value = None
        with pytest.raises(DatabaseUnavailableError, match="exhausted"):
            get_connection()

    def test_raises_on_operational_error_from_pool(self, mock_pool):
        mock_pool.getconn.side_effect = psycopg2.OperationalError("timeout")
        with pytest.raises(DatabaseUnavailableError, match="timeout"):
            get_connection()


class TestReturnConnection:
    def test_puts_connection_back_to_pool(self, mock_pool):
        conn = MagicMock()
        return_connection(conn)
        mock_pool.putconn.assert_called_once_with(conn)

    def test_no_op_when_pool_is_none(self):
        # Pool not initialised — should not raise
        return_connection(MagicMock())


class TestRunMigrations:
    def _make_mock_conn(self):
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value.__enter__ = lambda s: cur
        conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        conn._cursor = cur
        return conn

    def test_executes_sql_files_in_sorted_order(self, mock_pool, tmp_path):
        (tmp_path / "002_second.sql").write_text("SELECT 2;")
        (tmp_path / "001_first.sql").write_text("SELECT 1;")

        conn = self._make_mock_conn()
        mock_pool.getconn.return_value = conn

        run_migrations(migrations_dir=tmp_path)

        calls = [c.args[0] for c in conn._cursor.execute.call_args_list]
        assert calls == ["SELECT 1;", "SELECT 2;"]
        conn.commit.assert_called_once()
        mock_pool.putconn.assert_called_once_with(conn)

    def test_commits_after_all_files(self, mock_pool, tmp_path):
        (tmp_path / "001_create.sql").write_text("CREATE TABLE t (id INT);")
        conn = self._make_mock_conn()
        mock_pool.getconn.return_value = conn

        run_migrations(migrations_dir=tmp_path)

        conn.commit.assert_called_once()

    def test_rollback_and_raise_on_sql_error(self, mock_pool, tmp_path):
        (tmp_path / "001_bad.sql").write_text("BAD SQL;")
        conn = self._make_mock_conn()
        conn._cursor.execute.side_effect = psycopg2.Error("syntax error")
        mock_pool.getconn.return_value = conn

        with pytest.raises(DatabaseUnavailableError, match="Migration failed"):
            run_migrations(migrations_dir=tmp_path)

        conn.rollback.assert_called_once()

    def test_returns_connection_even_on_error(self, mock_pool, tmp_path):
        (tmp_path / "001_bad.sql").write_text("BAD SQL;")
        conn = self._make_mock_conn()
        conn._cursor.execute.side_effect = psycopg2.Error("error")
        mock_pool.getconn.return_value = conn

        with pytest.raises(DatabaseUnavailableError):
            run_migrations(migrations_dir=tmp_path)

        mock_pool.putconn.assert_called_once_with(conn)

    def test_no_op_when_no_migration_files(self, mock_pool, tmp_path):
        conn = self._make_mock_conn()
        mock_pool.getconn.return_value = conn

        run_migrations(migrations_dir=tmp_path)

        conn._cursor.execute.assert_not_called()
        conn.commit.assert_called_once()

    def test_default_migrations_dir_is_resolved_from_module_path(self, mock_pool):
        """run_migrations() without migrations_dir must compute path from __file__."""
        conn = self._make_mock_conn()
        mock_pool.getconn.return_value = conn
        # No migrations_dir arg → exercises the default-path branch (line 65 in db.py).
        # The real migrations/ directory is at apps/kong-gateway/migrations/ and contains
        # at least one .sql file, so this will execute it (idempotent CREATE IF NOT EXISTS).
        run_migrations()  # no exception expected
