# kong-gateway — Service Requirements

See full feature specification: [.specify/specs/016-kong-gateway-session/spec.md](../../.specify/specs/016-kong-gateway-session/spec.md)

## Summary
Kong 3.4 API gateway deployed in DB-less mode as the single entry point for all traffic. Implements session-based authentication, zero-touch service routing, X-Request-ID traceability, and rate limiting.

## Key requirements
- FR-001–FR-005: DB-less Kong with declarative config, port 8000/8001, upstream health checks
- FR-006–FR-010: Python `session-identity` plugin (global): cookie validation, X-User-Context injection, session creation on login
- FR-011–FR-013: PostgreSQL session store (`gateway-service` DB, `app.sessions` table)
- FR-014–FR-015: `/login` route bypasses session plugin; 401 (not redirect) for unauthenticated
- FR-016–FR-018: X-Request-ID enforced globally; logged in access logs
- FR-019–FR-020: Rate limiting 100 req/min/IP; 429 with Retry-After
- FR-021–FR-024: `dynamic-router` Python plugin for zero-touch service discovery
