"""Session purge job — removes expired sessions from app.sessions.

Run on a schedule (weekly recommended) to prevent unbounded table growth.
Typical invocation: python -m src.plugins.shared.purge
"""

from __future__ import annotations

import logging

from .session_store import purge_expired

logger = logging.getLogger(__name__)


def run_purge() -> int:
    """Delete all expired sessions and return the count of removed rows."""
    count = purge_expired()
    logger.info("session_purge completed", extra={"purged_count": count})
    return count


if __name__ == "__main__":  # pragma: no cover
    logging.basicConfig(level=logging.INFO)
    removed = run_purge()
    print(f"Purged {removed} expired session(s).")  # noqa: T201
