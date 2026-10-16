# kong-gateway — AI Instructions

## Service overview
Kong 3.4 API gateway in DB-less mode. Business logic lives in two Python plugins: `session-identity` (auth enforcement + session lifecycle) and `dynamic-router` (zero-touch convention-based upstream routing).

## Language & stack
- **Python 3.11** — plugins only; no TypeScript
- **kong-pdk 0.3.x** — Kong Plugin Development Kit for Python
- **psycopg2-binary** — PostgreSQL driver (sync, connection pool)
- **pytest + pytest-cov** — testing (NOT Jest/Vitest)
- **ruff** — linting (NOT ESLint)

## Hard rules
- **NEVER add service-specific paths to `_PUBLIC_PATHS`** in `session_identity.py`. That set is for pre-auth infrastructure endpoints only (health, login, register, OAuth callback, refresh). If a downstream service needs to be reachable without a session cookie, solve it at the service or infrastructure level — not by punching holes in the gateway's auth enforcement.

## Key conventions
- Plugin code lives in `src/plugins/<name>/__init__.py`
- Every plugin directory also needs `schema.lua` (Kong config validation — written in Lua, not Python)
- DB connection pool is a module-level singleton in `src/plugins/shared/db.py` — never create per-request connections
- **Fail closed**: if the session store is unreachable, return 503 — NEVER forward an unauthenticated request
- **Overwrite X-User-Context**: always strip client-supplied value before injecting gateway-verified value
- **No user_id or session_id in audit logs** — log event type + result + timestamp only (GDPR Art. 32)
- Metadata JSONB: only `is_mobile` (bool) and `client_version` (str) are permitted fields

## Session TTL
30 days (`expires_at = NOW() + INTERVAL '30 days'`). Sessions are valid only when `expires_at > NOW()` (strict inequality).

## Cookie name
`app_session` — HttpOnly, Secure, SameSite=Strict, Max-Age=2592000

## Build & test
```bash
nx build kong-gateway   # docker build
nx test kong-gateway    # pytest with 100% coverage required
nx lint kong-gateway    # ruff check
nx serve kong-gateway   # docker compose up kong-gateway
```

## Testing
- 100% coverage required (Constitution Principle I)
- Unit tests mock `kong` PDK and `psycopg2` — no real DB or Kong needed
- Integration tests require running `docker compose up` stack
- Write tests FIRST; confirm failure before implementation (Red-Green-Refactor)

## Scaffolding gate
Before writing any plugin code, ensure:
1. `schema.lua` exists for the plugin
2. `db.py` connection pool is initialised
3. `session_store.py` CRUD layer exists
