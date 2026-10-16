"""GCP OIDC identity token fetching with in-process caching.

Used by dynamic_router to inject service-to-service auth headers when
calling Cloud Run backends with --no-allow-unauthenticated.

Enabled via GCP_IAM_ENABLED=true environment variable.
"""

from __future__ import annotations

import logging
import os
import time
import urllib.request

_logger = logging.getLogger(__name__)

_METADATA_BASE = (
    "http://metadata.google.internal/computeMetadata/v1"
    "/instance/service-accounts/default/identity"
)

# 50 minutes — GCP OIDC identity tokens expire in 60 minutes
_CACHE_TTL_SECS: float = 3000

# audience → (token, expiry_monotonic)
_cache: dict[str, tuple[str, float]] = {}


def get_oidc_token(audience: str) -> str | None:
    """Return a cached OIDC identity token for *audience*, or None if IAM is disabled."""
    if os.getenv("GCP_IAM_ENABLED", "false").lower() != "true":
        return None

    now = time.monotonic()
    cached = _cache.get(audience)
    if cached is not None:
        token, expiry = cached
        if now < expiry:
            return token

    url = f"{_METADATA_BASE}?audience={audience}&format=full"
    req = urllib.request.Request(url, headers={"Metadata-Flavor": "Google"})  # noqa: S310
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:  # noqa: S310
            token = resp.read().decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        _logger.error("Failed to fetch OIDC token for %s: %s", audience, exc)
        return None

    _cache[audience] = (token, now + _CACHE_TTL_SECS)
    return token
