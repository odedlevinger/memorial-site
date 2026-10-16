"""Audit log helper — GDPR-safe structured event logging.

Writes JSON audit events to stdout (captured by Kong's log pipeline).

Security rules enforced by this module (GDPR Art. 32):
  - user_id is NEVER included in audit log payloads
  - session_id is NEVER included in audit log payloads
  - IP address is NEVER included in audit log payloads
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from typing import Any

_FORBIDDEN_KEYS = frozenset({"user_id", "session_id", "ip", "ip_address", "remote_addr"})


def log_event(
    event_type: str,
    result: str,
    client_type: str | None = None,
    **kwargs: Any,
) -> None:
    """
    Write a GDPR-safe audit event to stdout.

    Parameters
    ----------
    event_type:
        One of: session_created, session_validated, session_invalidated,
        session_rejected, session_db_error
    result:
        'success' or 'failure'
    client_type:
        Optional platform hint (e.g. 'mobile', 'web') — never includes PII
    **kwargs:
        Additional non-PII context. Forbidden keys are silently dropped.
    """
    payload: dict[str, Any] = {
        "event_type": event_type,
        "result": result,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    }
    if client_type is not None:
        payload["client_type"] = client_type

    for key, value in kwargs.items():
        if key not in _FORBIDDEN_KEYS:
            payload[key] = value

    print(json.dumps(payload), file=sys.stdout, flush=True)  # noqa: T201
