# auth-service — Specification

## Purpose

Provides cross-platform authentication and authorisation for memorial-site.
Serves both web (httpOnly cookie) and mobile (token-in-body) clients on a
single API surface, differentiated by the `X-Client-Platform` request header.

## Functional Requirements

### FR-001 — Registration
- Accept `email`, `password` (min 8 chars), optional `displayName`, and `consent` flag.
- `consent` MUST be `true`; reject with 400 otherwise.
- `email` MUST be unique; reject with 409 if already registered.
- Hash password with bcrypt (10 salt rounds).
- Persist `UserEntity` and `ConsentEntity` in PostgreSQL.
- Return an `AuthResponse` containing user profile + session metadata + token pair.

### FR-002 — Login
- Accept `email` and `password`.
- Return an `AuthResponse` on success.
- Return 401 `INVALID_CREDENTIALS` if email not found or password wrong.
- Log every attempt (success and failure) to the audit log.

### FR-003 — Logout
- Accept an optional refresh token (cookie for web, body for mobile).
- Delete matching session from the database (by SHA-256 hash of token).
- Always return 204 regardless of whether a session was found.

### FR-004 — Token Refresh
- Accept a refresh token.
- Validate session exists and has not expired.
- Rotate: delete old session, issue new token pair.
- Return 401 `REFRESH_TOKEN_EXPIRED` if session not found or expired.

### FR-005 — Token Validation
- Accept an access token.
- Verify JWT signature and find matching user in DB.
- Return public user profile on success.
- Return 401 `INVALID_ACCESS_TOKEN` on any failure.

### FR-006 — Web Cookie Delivery
- Set `app_access` (15 min) and `app_refresh` (7 days) as httpOnly cookies.
- `secure: true` in production; `sameSite: strict`.
- Omit token values from JSON response body.

### FR-007 — Mobile Token Delivery
- Return `accessToken` and `refreshToken` in JSON response body.
- Do not set cookies.

### FR-008 — Token TTLs
- Access token: 15 minutes (900 s).
- Refresh token: 7 days (604 800 s).
- Refresh token stored as SHA-256 hash in `sessions` table.

### FR-015 — Consent Recording
- Record `userId`, `givenAt` (ISO string), `policyVersion` (`v1.0`), and `ipAddress`.
- Persist in `consents` table.

### FR-016 — Account Deletion (GDPR Right to Erasure)
- Require re-authentication: valid access token + current password.
- Require exact confirmation phrase `"delete my account"`.
- Delete all sessions for the user.
- Delete the user record.
- Anonymise `ConsentEntity.userId` → `DELETED_<sha256_16>`.
- Anonymise matching `AuditLogEntity.userId` rows.
- Append `ACCOUNT_DELETED` audit entry.

### FR-017 — Data Export (GDPR Right of Access)
- Require valid access token.
- Return user profile, consent record, and audit log entries.
- Never include password hash or token values in the export.
- Set `Content-Disposition: attachment; filename="my-data.json"`.

### FR-018 — Audit Logging
- Persist every security event to the `audit_log` table.
- Events: `LOGIN`, `LOGOUT`, `REGISTER`, `TOKEN_REFRESH`, `ACCOUNT_DELETED`, `DATA_EXPORT_REQUESTED`.
- Never log passwords or raw token values.

### FR-019 — Data Export Scope
- Export only data owned by the auth service.
- Exclude password hashes, refresh token hashes, and raw JWT values.

## Non-Functional Requirements

- **Port**: 3001 (configurable via `PORT` env var).
- **Database**: PostgreSQL (configurable via `DATABASE_URL`).
- **Test coverage**: 100% (statements, branches, functions, lines).
- **TypeScript**: strict mode.

## Environment Variables

| Variable               | Required | Default                              | Description                        |
|------------------------|----------|--------------------------------------|------------------------------------|
| `DATABASE_URL`         | Yes      | —                                    | PostgreSQL connection string       |
| `JWT_ACCESS_SECRET`    | No       | `dev-access-secret-change-in-prod`   | Access token signing secret        |
| `PORT`                 | No       | `3001`                               | HTTP listen port                   |
| `NODE_ENV`             | No       | —                                    | Set to `production` for SSL + secure cookies |

## API Endpoints

| Method   | Path                  | Description                    |
|----------|-----------------------|--------------------------------|
| `POST`   | `/auth/register`      | Register a new account         |
| `POST`   | `/auth/login`         | Login                          |
| `POST`   | `/auth/logout`        | Logout / revoke refresh token  |
| `POST`   | `/auth/refresh`       | Rotate token pair              |
| `GET`    | `/auth/validate`      | Validate access token          |
| `GET`    | `/auth/health`        | Health check                   |
| `DELETE` | `/auth/account`       | Delete account (GDPR FR-016)   |
| `GET`    | `/auth/data-export`   | Export personal data (FR-017)  |

Swagger UI available at `/api` in non-production environments.

## Database Schema

```
users        (id uuid PK, email unique, displayName, passwordHash, createdAt)
sessions     (id uuid PK, userId, refreshTokenHash unique, expiresAt bigint)
consents     (id uuid PK, userId, givenAt, policyVersion, ipAddress)
audit_log    (id uuid PK, eventType, userId nullable, ipAddress, userAgent, occurredAt, outcome, metadata json)
```
