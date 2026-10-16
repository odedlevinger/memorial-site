"""Session store CRUD operations for the gateway session table."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras

from .db import DatabaseUnavailableError, get_connection, return_connection

SESSION_TTL_DAYS = 30

# Permitted metadata fields (GDPR data minimisation)
_ALLOWED_METADATA_KEYS = {"is_mobile", "client_version"}


@dataclass
class Session:
    session_id: uuid.UUID
    user_id: uuid.UUID
    metadata: dict | None
    expires_at: datetime
    created_at: datetime


def _filter_metadata(metadata: dict | None) -> dict | None:
    if not metadata:
        return None
    filtered = {k: v for k, v in metadata.items() if k in _ALLOWED_METADATA_KEYS}
    return filtered or None


def create_session(user_id: uuid.UUID, metadata: dict | None = None) -> uuid.UUID:
    """
    Insert a new session and return its session_id.

    Raises DatabaseUnavailableError on connection or query failure.
    """
    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=SESSION_TTL_DAYS)
    filtered_meta = _filter_metadata(metadata)
    meta_json = psycopg2.extras.Json(filtered_meta) if filtered_meta is not None else None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO app.sessions (user_id, metadata, expires_at)
                VALUES (%s, %s, %s)
                RETURNING session_id
                """,
                (str(user_id), meta_json, expires_at),
            )
            row = cur.fetchone()
        conn.commit()
        return uuid.UUID(str(row[0]))
    except psycopg2.Error as exc:
        conn.rollback()
        raise DatabaseUnavailableError(str(exc)) from exc
    finally:
        return_connection(conn)


def get_session(session_id: uuid.UUID) -> Session | None:
    """
    Return the session if it exists and has not expired, otherwise None.

    Raises DatabaseUnavailableError on connection failure.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT session_id, user_id, metadata, expires_at, created_at
                FROM app.sessions
                WHERE session_id = %s AND expires_at > NOW()
                """,
                (str(session_id),),
            )
            row = cur.fetchone()
        if row is None:
            return None
        return Session(
            session_id=uuid.UUID(str(row[0])),
            user_id=uuid.UUID(str(row[1])),
            metadata=row[2],
            expires_at=row[3],
            created_at=row[4],
        )
    except psycopg2.Error as exc:
        raise DatabaseUnavailableError(str(exc)) from exc
    finally:
        return_connection(conn)


def delete_session(session_id: uuid.UUID) -> None:
    """Delete a session by ID (used on explicit logout)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM app.sessions WHERE session_id = %s",
                (str(session_id),),
            )
        conn.commit()
    except psycopg2.Error as exc:
        conn.rollback()
        raise DatabaseUnavailableError(str(exc)) from exc
    finally:
        return_connection(conn)


def delete_sessions_for_user(user_id: uuid.UUID) -> int:
    """
    Delete all sessions for a user (GDPR Art. 17 right to erasure).
    Returns the count of deleted sessions.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM app.sessions WHERE user_id = %s",
                (str(user_id),),
            )
            count = cur.rowcount
        conn.commit()
        return count
    except psycopg2.Error as exc:
        conn.rollback()
        raise DatabaseUnavailableError(str(exc)) from exc
    finally:
        return_connection(conn)


def purge_expired() -> int:
    """
    Hard-delete all expired sessions. Run on a weekly schedule.
    Returns the count of purged sessions.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM app.sessions WHERE expires_at <= NOW()")
            count = cur.rowcount
        conn.commit()
        return count
    except psycopg2.Error as exc:
        conn.rollback()
        raise DatabaseUnavailableError(str(exc)) from exc
    finally:
        return_connection(conn)
