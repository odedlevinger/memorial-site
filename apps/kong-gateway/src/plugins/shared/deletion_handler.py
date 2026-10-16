"""User deletion event handler — GDPR Art. 17 right to erasure.

When a user account is deleted (from auth-service), this handler removes
all associated gateway sessions. Called via an internal admin endpoint
protected by a shared secret.

Usage (from auth-service or a GDPR deletion job):
  POST /admin/sessions/delete-for-user
  Header: X-Admin-Secret: <GATEWAY_ADMIN_SECRET>
  Body:   {"user_id": "<uuid>"}
"""

from __future__ import annotations

import logging
import os
import uuid

from .audit import log_event
from .session_store import delete_sessions_for_user

logger = logging.getLogger(__name__)

_ADMIN_SECRET = os.environ.get("GATEWAY_ADMIN_SECRET", "")


def handle_user_deletion(user_id_str: str, request_secret: str) -> dict[str, object]:
    """
    Delete all sessions for a user after validating the admin secret.

    Returns a result dict with ``{"deleted": <count>}`` on success or raises
    ``ValueError`` on auth failure / invalid input.
    """
    if not _ADMIN_SECRET:
        raise RuntimeError("GATEWAY_ADMIN_SECRET is not configured")

    if request_secret != _ADMIN_SECRET:
        raise ValueError("Invalid admin secret")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError as exc:
        raise ValueError(f"Invalid user_id format: {user_id_str}") from exc

    count = delete_sessions_for_user(user_id)
    log_event(
        "user_sessions_deleted",
        "success",
        session_count=count,
    )
    return {"deleted": count}
