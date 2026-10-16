"""Database connection pool and migration runner for the gateway session store."""

from __future__ import annotations

import os
from pathlib import Path

import psycopg2
from psycopg2 import pool as psycopg2_pool


class DatabaseUnavailableError(Exception):
    """Raised when the session store cannot be reached."""


def _build_dsn() -> str:
    connect_timeout = os.environ.get("GATEWAY_DB_CONNECT_TIMEOUT", "10")
    return (
        f"host={os.environ['GATEWAY_DB_HOST']} "
        f"port={os.environ.get('GATEWAY_DB_PORT', '5432')} "
        f"dbname={os.environ['GATEWAY_DB_NAME']} "
        f"user={os.environ['GATEWAY_DB_USER']} "
        f"password={os.environ['GATEWAY_DB_PASSWORD']} "
        f"connect_timeout={connect_timeout}"
    )


# Module-level singleton — initialised once per worker process.
_pool: psycopg2_pool.ThreadedConnectionPool | None = None


def init_pool(min_conn: int = 0, max_conn: int = 10) -> None:
    """Initialise the connection pool.

    Uses min_conn=0 by default so no connections are established at init time —
    psycopg2's blocking C-level IO must not occur during Kong's init_worker phase
    because it blocks the gevent event loop and triggers a 5-second PDK timeout.
    Connections are created lazily on the first get_connection() call instead.
    """
    global _pool
    try:
        _pool = psycopg2_pool.ThreadedConnectionPool(
            min_conn,
            max_conn,
            dsn=_build_dsn(),
        )
    except psycopg2.OperationalError as exc:
        raise DatabaseUnavailableError(str(exc)) from exc


def get_connection() -> psycopg2.extensions.connection:
    """Borrow a connection from the pool, initialising it lazily if needed."""
    global _pool
    if _pool is None:
        init_pool()
    try:
        conn = _pool.getconn()  # type: ignore[union-attr]
    except psycopg2.OperationalError as exc:
        raise DatabaseUnavailableError(str(exc)) from exc
    if conn is None:
        raise DatabaseUnavailableError("Connection pool exhausted")
    return conn


def return_connection(conn: psycopg2.extensions.connection) -> None:
    """Return a connection to the pool."""
    if _pool is not None:
        _pool.putconn(conn)


def run_migrations(migrations_dir: Path | None = None) -> None:
    """Execute all SQL migration files in order. Idempotent."""
    if migrations_dir is None:
        env_dir = os.environ.get("MIGRATIONS_DIR")
        migrations_dir = Path(env_dir) if env_dir else Path(__file__).parent.parent.parent.parent / "migrations"
    migration_files = sorted(migrations_dir.glob("*.sql"))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for migration_file in migration_files:
                sql = migration_file.read_text()
                cur.execute(sql)
        conn.commit()
    except psycopg2.Error as exc:
        conn.rollback()
        raise DatabaseUnavailableError(f"Migration failed: {exc}") from exc
    finally:
        return_connection(conn)
