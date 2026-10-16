"""
dynamic-router Kong plugin.

Resolves which upstream to use based on the URL path prefix.
Upstreams must be pre-declared in kong.yml — add a new upstream entry
for each service to enable routing.

Mapping rules (in order):
  1. PATH_PASSTHROUGH  — paths forwarded to a named upstream without stripping
  2. BLOCKED_PREFIXES  — paths that return 404
  3. SERVICE_PREFIX    — strip /<upstream-name> prefix and route to that upstream
"""

from __future__ import annotations

import os

from shared import iam

VERSION = "1.0.0"
PRIORITY = 900  # Runs AFTER session-identity (priority 1000)
version = VERSION
priority = PRIORITY

# Upstream names declared in kong.yml upstreams section.
# Maps the first path segment to the Kong upstream name.
UPSTREAM_MAP: dict[str, str] = {
    "auth-service": "auth-service",
    "content-service": "content-service",
}

# Paths that route to a specific upstream with an explicit rewritten path.
# (upstream_name, rewritten_path)
PATH_PASSTHROUGH: dict[str, tuple[str, str]] = {
    "login": ("auth-service", "/auth/login"),
}

# Path prefixes that must never be forwarded to any upstream.
BLOCKED_PREFIXES: frozenset[str] = frozenset({"admin", "health", "metrics"})


def _inject_iam_token(kong: object, upstream_name: str) -> None:
    """Fetch a GCP OIDC token for *upstream_name* and inject it as Authorization header.

    If the client already sent an Authorization header (e.g. a user JWT), it is
    preserved as X-Forwarded-Authorization so the downstream service can still
    read the original token.

    No-op when GCP_IAM_ENABLED is false or the audience env var is not set.
    Audience env var convention: UPSTREAM_<NAME>_AUDIENCE (hyphens → underscores, uppercase).
    Example: auth-service → UPSTREAM_AUTH_SERVICE_AUDIENCE
    """
    env_key = f"UPSTREAM_{upstream_name.upper().replace('-', '_')}_AUDIENCE"
    audience = os.getenv(env_key, "")
    if not audience:
        return
    token = iam.get_oidc_token(audience)
    if token:
        # Preserve the client's original Authorization header before overwriting
        original_auth = kong.request.get_header("Authorization")
        if original_auth:
            kong.service.request.set_header("X-Forwarded-Authorization", original_auth)
        kong.service.request.set_header("Authorization", f"Bearer {token}")


class Plugin:
    def __init__(self, config: object) -> None:
        self.config = config

    def access(self, kong: object) -> None:
        """
        Route the request to the correct upstream.

        Algorithm:
          1. Split path into segments: /<segment0>[/<rest>]
          2. If segment0 in PATH_PASSTHROUGH → set upstream, keep full path, return.
          3. If segment0 in BLOCKED_PREFIXES → 404.
          4. If segment0 in UPSTREAM_MAP → set upstream + strip prefix from path.
          5. Otherwise → 404 (unknown service).
        """
        path = kong.request.get_path()
        segments = [s for s in path.split("/") if s]

        if not segments:
            kong.response.exit(
                404,
                '{"error":"Not Found","message":"No service specified"}',
                {},
            )
            return

        service_name = segments[0]

        # Passthrough: route to known upstream with explicit path rewrite.
        if service_name in PATH_PASSTHROUGH:
            upstream, rewritten_path = PATH_PASSTHROUGH[service_name]
            kong.service.set_upstream(upstream)
            kong.service.request.set_path(rewritten_path)
            _inject_iam_token(kong, upstream)
            return

        if service_name in BLOCKED_PREFIXES:
            kong.response.exit(
                404,
                f'{{"error":"Not Found","message":"Path /{service_name} is not routable"}}',
                {},
            )
            return

        upstream = UPSTREAM_MAP.get(service_name)
        if upstream is None:
            kong.response.exit(
                404,
                f'{{"error":"Not Found","message":"Unknown service: {service_name}"}}',
                {},
            )
            return

        # Strip the service-name prefix from the path.
        service_path = "/" + "/".join(segments[1:]) if len(segments) > 1 else "/"

        kong.service.set_upstream(upstream)
        kong.service.request.set_path(service_path)
        _inject_iam_token(kong, upstream)
