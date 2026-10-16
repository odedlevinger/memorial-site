"""Unit tests for session_store.py — CRUD operations on app.sessions."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import psycopg2
import pytest
from src.plugins.shared.db import DatabaseUnavailableError
from src.plugins.shared.session_store import (
    SESSION_TTL_DAYS,
    Session,
    create_session,
    delete_session,
    delete_sessions_for_user,
    get_session,
    purge_expired,
)

USER_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
SESSION_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")


@pytest.fixture()
def mock_conn():
    """Return a reusable mock connection with cursor support."""
    conn = MagicMock()
    cur = MagicMock()
    conn.cursor.return_value.__enter__ = lambda s: cur
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    conn._cur = cur
    return conn


@pytest.fixture(autouse=True)
def patch_db(mock_conn):
    """Patch get_connection and return_connection for all tests."""
    with (
        patch("src.plugins.shared.session_store.get_connection", return_value=mock_conn),
        patch("src.plugins.shared.session_store.return_connection") as mock_return,
    ):
        mock_conn._mock_return = mock_return
        yield mock_conn


class TestCreateSession:
    def test_inserts_with_correct_ttl(self, patch_db):
        patch_db._cur.fetchone.return_value = (str(SESSION_ID),)
        before = datetime.now(tz=timezone.utc)

        result = create_session(USER_ID, metadata={"is_mobile": True})

        assert result == SESSION_ID
        sql, params = patch_db._cur.execute.call_args.args
        assert "INSERT INTO app.sessions" in sql
        assert str(USER_ID) in params
        expires_at: datetime = params[2]
        delta = expires_at - before
        assert timedelta(days=SESSION_TTL_DAYS - 1) < delta <= timedelta(days=SESSION_TTL_DAYS + 1)

    def test_filters_disallowed_metadata_keys(self, patch_db):
        patch_db._cur.fetchone.return_value = (str(SESSION_ID),)
        create_session(USER_ID, metadata={"is_mobile": True, "ip_address": "1.2.3.4"})

        _, params = patch_db._cur.execute.call_args.args
        # params[1] is the Json-wrapped metadata; check it via the adapted value
        json_adapter = params[1]
        # The Json adapter stores the dict in .adapted
        assert "ip_address" not in str(json_adapter)

    def test_returns_none_metadata_when_all_keys_disallowed(self, patch_db):
        patch_db._cur.fetchone.return_value = (str(SESSION_ID),)
        create_session(USER_ID, metadata={"user_agent": "bot", "ip_address": "1.2.3.4"})

        _, params = patch_db._cur.execute.call_args.args
        assert params[1] is None or str(params[1]) in ("None", "null")

    def test_commits_transaction(self, patch_db):
        patch_db._cur.fetchone.return_value = (str(SESSION_ID),)
        create_session(USER_ID)
        patch_db.commit.assert_called_once()

    def test_raises_and_rolls_back_on_db_error(self, patch_db):
        patch_db._cur.execute.side_effect = psycopg2.Error("insert failed")
        with pytest.raises(DatabaseUnavailableError):
            create_session(USER_ID)
        patch_db.rollback.assert_called_once()

    def test_returns_connection_after_success(self, patch_db):
        patch_db._cur.fetchone.return_value = (str(SESSION_ID),)
        create_session(USER_ID)
        patch_db._mock_return.assert_called_once_with(patch_db)

    def test_returns_connection_after_failure(self, patch_db):
        patch_db._cur.execute.side_effect = psycopg2.Error("error")
        with pytest.raises(DatabaseUnavailableError):
            create_session(USER_ID)
        patch_db._mock_return.assert_called_once_with(patch_db)


class TestGetSession:
    def _make_row(self, session_id=SESSION_ID, user_id=USER_ID, expired=False):
        now = datetime.now(tz=timezone.utc)
        expires_at = now - timedelta(seconds=1) if expired else now + timedelta(days=30)
        created_at = now - timedelta(hours=1)
        return (str(session_id), str(user_id), {"is_mobile": True}, expires_at, created_at)

    def test_returns_session_for_valid_id(self, patch_db):
        row = self._make_row()
        patch_db._cur.fetchone.return_value = row

        result = get_session(SESSION_ID)

        assert isinstance(result, Session)
        assert result.session_id == SESSION_ID
        assert result.user_id == USER_ID

    def test_returns_none_when_no_row(self, patch_db):
        patch_db._cur.fetchone.return_value = None

        result = get_session(SESSION_ID)

        assert result is None

    def test_query_includes_expiry_check(self, patch_db):
        patch_db._cur.fetchone.return_value = None
        get_session(SESSION_ID)

        sql, params = patch_db._cur.execute.call_args.args
        assert "expires_at > NOW()" in sql
        assert str(SESSION_ID) in params

    def test_raises_on_db_error(self, patch_db):
        patch_db._cur.execute.side_effect = psycopg2.Error("timeout")
        with pytest.raises(DatabaseUnavailableError):
            get_session(SESSION_ID)

    def test_returns_connection_after_success(self, patch_db):
        patch_db._cur.fetchone.return_value = self._make_row()
        get_session(SESSION_ID)
        patch_db._mock_return.assert_called_once_with(patch_db)


class TestDeleteSession:
    def test_deletes_by_session_id(self, patch_db):
        delete_session(SESSION_ID)

        sql, params = patch_db._cur.execute.call_args.args
        assert "DELETE FROM app.sessions" in sql
        assert str(SESSION_ID) in params

    def test_commits(self, patch_db):
        delete_session(SESSION_ID)
        patch_db.commit.assert_called_once()

    def test_raises_and_rolls_back_on_error(self, patch_db):
        patch_db._cur.execute.side_effect = psycopg2.Error("error")
        with pytest.raises(DatabaseUnavailableError):
            delete_session(SESSION_ID)
        patch_db.rollback.assert_called_once()


class TestDeleteSessionsForUser:
    def test_deletes_all_user_sessions(self, patch_db):
        patch_db._cur.rowcount = 3
        count = delete_sessions_for_user(USER_ID)

        sql, params = patch_db._cur.execute.call_args.args
        assert "WHERE user_id = %s" in sql
        assert str(USER_ID) in params
        assert count == 3

    def test_commits(self, patch_db):
        patch_db._cur.rowcount = 0
        delete_sessions_for_user(USER_ID)
        patch_db.commit.assert_called_once()

    def test_raises_on_error(self, patch_db):
        patch_db._cur.execute.side_effect = psycopg2.Error("error")
        with pytest.raises(DatabaseUnavailableError):
            delete_sessions_for_user(USER_ID)


class TestPurgeExpired:
    def test_deletes_expired_sessions(self, patch_db):
        patch_db._cur.rowcount = 5
        count = purge_expired()

        sql = patch_db._cur.execute.call_args.args[0]
        assert "expires_at <= NOW()" in sql
        assert count == 5

    def test_commits(self, patch_db):
        patch_db._cur.rowcount = 0
        purge_expired()
        patch_db.commit.assert_called_once()

    def test_raises_on_error(self, patch_db):
        patch_db._cur.execute.side_effect = psycopg2.Error("error")
        with pytest.raises(DatabaseUnavailableError):
            purge_expired()

    def test_returns_connection_after_success(self, patch_db):
        patch_db._cur.rowcount = 0
        purge_expired()
        patch_db._mock_return.assert_called_once_with(patch_db)
