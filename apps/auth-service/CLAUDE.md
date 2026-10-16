# auth-service — Claude Instructions

Reusable authentication service for the memorial-site baseline. NestJS 11, TypeScript 5 (strict), port 3001.

## Architecture

```
src/
├── main.ts                          Bootstrap; Swagger setup
└── app/
    ├── auth.module.ts               Root module (ConfigModule + TypeOrmModule + JwtModule + AdminModule)
    ├── auth.controller.ts           All auth endpoints
    ├── auth.service.ts              Business logic; TypeORM repositories
    ├── audit.service.ts             Append-only audit log; TypeORM repository
    ├── auth.dto.ts                  Login / Register / Refresh / DeleteAccount / Google DTOs
    ├── auth.types.ts                Shared interfaces (User, AuthResponse, etc.)
    ├── admin/                       Internal admin API (user search + role management)
    ├── bootstrap/                   Boot-time data migrations runner
    ├── migrations/                  One-time idempotent data migrations
    └── entities/                    user / session / consent / audit-log
```

## Endpoints

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`
- `POST /auth/google/callback` (OAuth code+PKCE) and `POST /auth/google/id-token` (GIS button) —
  verify the Google token's audience against `GOOGLE_CLIENT_ID`, then find/create the user.
- `GET /auth/validate`, `GET /auth/health`, `PATCH /auth/language`, `PATCH /auth/profile`,
  `DELETE /auth/account`, `GET /auth/data-export`
- Internal (behind `X-Admin-Secret`, never exposed via Kong): `/admin/users*` search/listing +
  admin-role grant/revoke (`ROLE_ADMIN = 'admin'`; revoke enforces last-admin + self-demote invariants).

## Key conventions

- **Platform detection** via `X-Client-Platform`: `web` (default) → access + refresh tokens in
  httpOnly cookies (omitted from body); `mobile` → tokens returned in the JSON body, no cookies.
- **Refresh-token security**: plaintext token from `randomUUID()`; only its SHA-256 hash is stored;
  refresh/logout look up by hash.
- **GDPR anonymisation**: on account deletion the `userId` becomes `DELETED_<sha256_16>` in
  `consents` + `audit_log` (consent kept for accountability; user row deleted).
- **Config** via `ConfigModule` only; **DTO validation** via `class-validator`; **repository pattern**
  for DB access; **Swagger** on every endpoint.
- Boot-time data migrations run via `OnApplicationBootstrap` (skipped when `NODE_ENV=test` or
  `SKIP_BOOT_MIGRATIONS=true`); each is idempotent and fails the boot if it throws.

## Database

- Instance `my-db`; database `auth-service`; user `auth-service_user`; dev password `12345678`.
- Connection: `postgres://auth-service_user:12345678@my-db:5432/auth-service`.
- **Tests** use an in-memory `better-sqlite3` DB (`:memory:`, `synchronize: true`) — requires **Node 20**
  (Node 26 cannot compile `better-sqlite3@9.6.0`).

## Testing

100% coverage (statements/branches/functions/lines) is a merge blocker. Run from repo root:

```bash
npx nx test auth-service       # jest + coverage
npx nx build auth-service      # nest build
```

(Standalone: `cd apps/auth-service && npm test`; coverage in `apps/auth-service/coverage/`.)
