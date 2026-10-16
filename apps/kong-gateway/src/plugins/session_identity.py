"""
session-identity Kong plugin.

Phases:
  access   — validate session cookie; inject X-User-Context; fail closed on DB error.
  response — detect successful auth-service login; create session; set cookie.
             (kong-pdk uses 'response' instead of 'header_filter' for Python plugins)
"""

from __future__ import annotations

import base64
import json
import logging
import os
import uuid
from datetime import timezone

from shared import session_store
from shared.db import DatabaseUnavailableError, run_migrations

_log = logging.getLogger(__name__)

VERSION = "1.0.0"
PRIORITY = 1000
version = VERSION
priority = PRIORITY

_MSG_503 = json.dumps({"error": "Service Unavailable", "message": "Session store unavailable"})

_HEADER_USER_CONTEXT = "X-User-Context"
_HEADER_USER_ID = "X-User-Id"

# Pre-session endpoints: must never require a session cookie.
_PUBLIC_PATHS = frozenset({
    "/login",
    "/auth-service/auth/health",
    "/auth-service/auth/login",
    "/auth-service/auth/register",
    "/auth-service/auth/google/callback",
    "/auth-service/auth/google/id-token",
    "/auth-service/auth/refresh",
})

# Read-only public prefixes (GET/HEAD only): the Memory site's published content and,
# in local dev, content-service's own image files.
_PUBLIC_READ_PREFIXES = (
    "/content-service/content/public/",
    "/content-service/content/files/",
)
_READ_METHODS = frozenset({"GET", "HEAD"})


def _is_public(path: str, method: str) -> bool:
    if path.rstrip("/") in _PUBLIC_PATHS:
        return True
    return (
        method in _READ_METHODS
        and ".." not in path
        and any(path.startswith(prefix) for prefix in _PUBLIC_READ_PREFIXES)
    )

Schema = [
    {"cookie_name": {"type": "string", "default": "app_session"}},
]

_SCHEMA_READY = False


def _ensure_schema_once() -> None:
    """Bootstrap the session-store schema on first DB use (idempotent, once per worker).

    Terraform provisions the gateway-service database + user but not its schema —
    each service owns its own schema lifecycle and Kong has no ORM. The migration
    (CREATE SCHEMA / TABLE IF NOT EXISTS) is run lazily here rather than in
    init_worker, where psycopg2's blocking IO would stall gevent and trip Kong's
    PDK timeout. On failure the guard stays unset so the next request retries; the
    raised DatabaseUnavailableError is converted by callers into a fail-closed 503.
    """
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    run_migrations()
    _SCHEMA_READY = True


def _cookie_value(cookie_header: str | None, name: str) -> str | None:
    """Extract a named cookie value from the Cookie header string."""
    if not cookie_header:
        return None
    for part in cookie_header.split(";"):
        part = part.strip()
        if "=" in part:
            key, _, val = part.partition("=")
            if key.strip() == name:
                return val.strip()
    return None


def _inject_header(kong: object, name: str, value: str) -> None:
    """Strip any client-forged header then inject the gateway-verified value."""
    kong.service.request.clear_header(name)
    kong.service.request.set_header(name, value)


def _encode_user_context(session: session_store.Session) -> str:
    payload = {
        "user_id": str(session.user_id),
        "session_id": str(session.session_id),
        "issued_at": session.created_at.astimezone(timezone.utc).isoformat(),
        "expires_at": session.expires_at.astimezone(timezone.utc).isoformat(),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


class Plugin:
    def __init__(self, config: object) -> None:
        self.config = config

    def init_worker(self, kong: object) -> None:
        """Called once per Kong worker.

        DB pool init is intentionally deferred to the first request — psycopg2's
        blocking C-level IO during init_worker would stall the gevent event loop
        and trigger the kong-pdk 5-second PDK timeout, breaking the plugin.
        Lazy init happens in get_connection() on the first access/response call.
        """
        _log.info("[session_identity] init_worker called")

    def access(self, kong: object) -> None:
        """
        Validate the session cookie and inject X-User-Context.

        Exits 401 if no valid session; 503 if the session store is unreachable.
        Always overwrites any client-supplied X-User-Context before injecting.
        Public paths (login, register, health) bypass auth.
        """
        # Skip auth for public endpoints (checked against the original client path),
        # but never let a client-forged identity through to the upstream.
        path = kong.request.get_path()
        if path and _is_public(path, kong.request.get_method()):
            kong.service.request.clear_header(_HEADER_USER_CONTEXT)
            kong.service.request.clear_header(_HEADER_USER_ID)
            return

        cookie_header = kong.request.get_header("Cookie")
        cookie_name = getattr(self.config, "cookie_name", "app_session")
        raw_session_id = _cookie_value(cookie_header, cookie_name)

        if not raw_session_id:
            kong.response.exit(
                401,
                json.dumps({"error": "Unauthorized", "message": "Valid session required"}),
                {"WWW-Authenticate": 'Bearer realm="memorial-site"'},
            )
            return

        try:
            session_id = uuid.UUID(raw_session_id)
            _ensure_schema_once()
            session = session_store.get_session(session_id)
        except (ValueError, DatabaseUnavailableError) as exc:
            if isinstance(exc, DatabaseUnavailableError):
                kong.response.exit(
                    503,
                    _MSG_503,
                    {},
                )
            else:
                kong.response.exit(
                    401,
                    json.dumps({"error": "Unauthorized", "message": "Valid session required"}),
                    {"WWW-Authenticate": 'Bearer realm="memorial-site"'},
                )
            return

        if session is None:
            kong.response.exit(
                401,
                json.dumps({"error": "Unauthorized", "message": "Valid session required"}),
                {"WWW-Authenticate": 'Bearer realm="memorial-site"'},
            )
            return

        # Overwrite any client-forged headers before injecting the verified values.
        _inject_header(kong, _HEADER_USER_CONTEXT, _encode_user_context(session))
        # X-User-Id is a convenience header so downstream services can read the UUID
        # directly without parsing the full X-User-Context JSON blob.
        _inject_header(kong, _HEADER_USER_ID, str(session.user_id))

    def response(self, kong: object) -> None:
        """
        Detect a successful auth-service login and create a session + cookie.

        Triggered when the upstream returns X-Auth-Success: true.
        kong-pdk 0.36 uses 'response' (not 'header_filter') as the phase name for
        Python plugins — header_filter is not in kong_pdk.module.phases.
        """
        auth_success = kong.response.get_header("X-Auth-Success")
        if auth_success != "true":
            return

        # Read all headers we need BEFORE any clear_header calls.
        # In the kong-pdk 'response' phase, clear_header invalidates the internal
        # header cache, making subsequent get_header calls return None.
        user_id_str = kong.response.get_header("X-Auth-User-Id")

        # Remove internal signal headers — never expose them to clients.
        kong.response.clear_header("X-Auth-Success")
        kong.response.clear_header("X-Auth-User-Id")

        try:
            if not user_id_str:
                kong.response.exit(
                    503,
                    _MSG_503,
                    {},
                )
                return
            user_id = uuid.UUID(str(user_id_str))

            _ensure_schema_once()
            metadata = {
                "is_mobile": kong.request.get_header("X-Mobile-Client") == "true",
                "client_version": kong.request.get_header("X-Client-Version") or "",
            }
            session_id = session_store.create_session(user_id, metadata=metadata)

            cookie_name = getattr(self.config, "cookie_name", "app_session")
            cookie_secure = os.environ.get("COOKIE_SECURE", "true").lower() != "false"
            secure_flag = "Secure; " if cookie_secure else ""
            cookie = (
                f"{cookie_name}={session_id}; "
                "Max-Age=2592000; "
                "Path=/; "
                "HttpOnly; "
                f"{secure_flag}"
                "SameSite=Strict"
            )
            kong.response.add_header("Set-Cookie", cookie)

        except (DatabaseUnavailableError, ValueError):
            kong.response.exit(
                503,
                _MSG_503,
                {},
            )
