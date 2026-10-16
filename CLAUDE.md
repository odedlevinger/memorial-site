memorial-site/                    <-- OPEN THIS FOLDER IN VS CODE
├── CLAUDE.md             <-- [THIS FILE]
├── .claude/              (Created by Claude Code)
├── .specify/             (Spec Kit: constitution, specs, templates)
├── apps/
│   ├── web/              (React 19 + Vite — baseline shell; Google sign-in)
│   ├── mobile/           (Expo + React Native — baseline shell)
│   ├── auth-service/     (NestJS — port 3001; reusable authentication)
│   └── kong-gateway/     (Kong 3.4 + Python plugins — the sole public entry point)
├── infra/
│   └── terraform/        (Cloud SQL instance, foundation, gateway + auth — see Deployment below)
├── docker/
│   └── init-databases.sql  (local dev only — mirrors what Terraform manages in prod)
├── docker-compose.yml    (local dev stack: my-db + kong-gateway + auth-service + web)
└── package.json          (npm workspaces: ["apps/*"])

> **Infrastructure baseline.** This repo is a domain-agnostic foundation (auth + gateway +
> cloud infra + buildable web/mobile shells). Grow the new business domain on top of it by
> adding services under `apps/` following the rules below.

## Stack

| Layer | Technology |
|---|---|
| Monorepo tooling | Nx |
| Language | TypeScript 5 (strict mode) |
| Backend services | NestJS (microservices) |
| Frontend | React 19 (TypeScript) |
| Frontend styling | Tailwind CSS |
| State management | Zustand |
| HTTP client | Axios (interceptors for silent refresh) |
| Containerization | Docker (multi-stage, node:20-alpine) |
| Cloud | GCP Cloud Run + Artifact Registry |
| CI/CD | GitHub Actions |
| Testing — backend | Jest + Supertest |
| Testing — frontend | Vitest + @testing-library/react |

## Architecture Principles

- Each service is **independently deployable** — no shared runtime coupling.
- Services communicate via REST or message queues (Redis). Direct imports across service
  boundaries are forbidden.
- Shared code lives in `libs/` only — never cross-import between `apps/` services.
- Each service owns its own database. No shared DB between services.
- **Database instance**: `my-db` (single shared PostgreSQL 16 container/Cloud SQL instance).
- **Database naming**: database name == service directory name (e.g. `auth-service`). Enforced — no exceptions.
- **Database user**: `<service-name>_user` (e.g. `auth-service_user`). One dedicated user per service — never share credentials between services.
- **Dev password**: `12345678` for all service users locally. Rotate via GCP Secret Manager before deploying to any shared environment.
- New databases + users MUST be declared in `docker/init-databases.sql` and documented in the service's `.env.example`.
- `packages/` MUST NOT be created (dissolved — see constitution).
- **All HTTP services MUST be routed through Kong.** No service may be directly accessible by clients — every request goes through `kong-gateway`. When adding a new HTTP service, you MUST register it in all four places: (1) `apps/kong-gateway/config/kong.yml.template` upstreams, (2) `apps/kong-gateway/src/plugins/dynamic_router.py` `UPSTREAM_MAP`, (3) `apps/kong-gateway/docker-init.sh` defaults + export + envsubst, (4) `docker-compose.yml` Kong environment variables. Pre-session login endpoints additionally go in `session_identity.py` `_PUBLIC_PATHS`.

## Folder Structure

Every NestJS service MUST follow this internal structure:

```
apps/[service-name]/
├── src/
│   ├── modules/
│   ├── controllers/
│   ├── services/
│   ├── dto/
│   └── entities/
├── SPEC.md        ← service requirements (REQUIRED before scaffolding)
├── plan.md        ← implementation plan (REQUIRED before scaffolding)
├── tasks.md       ← ordered task list (REQUIRED before scaffolding)
├── CLAUDE.md      ← service-level AI instructions (REQUIRED before scaffolding)
└── Dockerfile     ← container definition (REQUIRED before scaffolding)
```

Shared libraries:

```
libs/[shared-lib]/
└── src/
```

## Scaffolding Rules (ENFORCED — read before creating any service or library)

### New service gate (`apps/[service-name]/`)

Run this checklist mentally before writing a single line of source code:

1. Does `apps/[service-name]/SPEC.md` exist? If NO → **stop and ask the user for requirements**.
2. Does `apps/[service-name]/plan.md` exist? If NO → **stop and generate plan from spec before proceeding**.
3. Does `apps/[service-name]/tasks.md` exist? If NO → **stop and generate tasks from plan before proceeding**.
4. Does `apps/[service-name]/CLAUDE.md` exist? If NO → create from service requirements.
5. Does `apps/[service-name]/Dockerfile` exist? If NO → create one using the monorepo-aware pattern (see **Docker** section below). Copy `apps/auth-service/Dockerfile` as the canonical template.
6. Does `apps/[service-name]/src/` exist? If NO → create the directory.

### New shared library gate (`libs/[shared-lib-name]/`)

No SPEC.md or Dockerfile required, but the lib MUST have a documented purpose in the
task or PR that introduces it.

### Hard rules

- NEVER create a service directory structure in a single pass without the gate check.
- NEVER infer requirements; if SPEC.md is absent, ask for it explicitly.
- Extract into `libs/` only when **three or more** apps need the same logic.

## NestJS Conventions

- Always use **modules** to encapsulate features.
- Use **DTOs with `class-validator`** for all input validation — no raw body access.
- Use the **repository pattern** for database access.
- Use `ConfigModule` for all environment variables — never hardcode values.
- Always **define interfaces before implementing services**.
- Follow **REST naming conventions** for all endpoints.
- All endpoints MUST have **Swagger (`@ApiOperation`, `@ApiResponse`) decorators**.

## Libraries

Prefer well-established libraries over custom implementations.

| Purpose | Library |
|---|---|
| Validation | `class-validator` + `class-transformer` |
| ORM | TypeORM or Prisma (defined per service in its CLAUDE.md) |
| HTTP (server→server) | `@nestjs/axios` |
| Config | `@nestjs/config` |
| JWT (backend) | `@nestjs/jwt` |
| JWT (universal) | `jose` |
| Mobile token storage | `expo-secure-store` |
| Testing (backend) | Jest + Supertest |
| Testing (frontend) | Vitest + @testing-library/react |

Deviations require justification against YAGNI — if the existing stack handles the use
case, a new dependency is not permitted.

## Docker

- Always use **multi-stage builds** to minimise image size.
- Base image: `node:20-alpine`.
- Never run containers as root.
- Always include `.dockerignore` at the **repo root** (one file covers all services).

### Monorepo-aware Dockerfile pattern (REQUIRED for all NestJS services)

Because this repo uses npm workspaces, `package-lock.json` lives **only at the repo root**.
The Docker build context MUST be the repo root (`.`), not the service subdirectory.
Failure to follow this pattern causes `npm ci` to fail with "missing package-lock.json".

**Canonical template** — copy `apps/auth-service/Dockerfile` and replace `auth-service` with the new service name:

```dockerfile
# ── builder ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root workspace manifests first (package-lock.json is ONLY here)
COPY package.json package-lock.json ./
COPY apps/[service-name]/package.json ./apps/[service-name]/

# Install only this workspace's dependencies
RUN npm ci --workspace=apps/[service-name] --include-workspace-root

# Copy only the files needed for compilation (avoids stale BuildKit cache collisions)
COPY apps/[service-name]/src/                 ./apps/[service-name]/src/
COPY apps/[service-name]/tsconfig.json        ./apps/[service-name]/tsconfig.json
COPY apps/[service-name]/tsconfig.build.json  ./apps/[service-name]/tsconfig.build.json
COPY apps/[service-name]/nest-cli.json        ./apps/[service-name]/nest-cli.json
RUN cd apps/[service-name] && npx nest build

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=builder /app/apps/[service-name]/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE [port]
CMD ["node", "dist/main.js"]
```

**`docker-compose.yml` entry MUST use:**
```yaml
[service-name]:
  build:
    context: .                                    # ← repo root, NOT ./apps/[service-name]
    dockerfile: apps/[service-name]/Dockerfile
```

Services that require extra system packages (e.g. `ffmpeg`) add the `apk add` line immediately after `FROM node:20-alpine` in both stages.

## Deployment

- Region: **me-west1** (Tel Aviv).
- GCP project: **memorial-site** (project id `memorial-site-oded`).
- Every service has its own **Cloud Run** instance.
- Images tagged with the **git SHA**.
- Secrets via **GCP Secret Manager** — never passed as plain environment variables.

### Infrastructure (Terraform)

All cloud infrastructure lives in `infra/terraform/`. Terraform is responsible for:
- The shared Cloud SQL instance (`my-db`, PostgreSQL 16)
- One `google_sql_database` per service (name == service name)
- One `google_sql_user` per service (name == `<service-name>_user`)

**Terraform does NOT manage schemas or table structure.** Each service owns its own schema lifecycle via TypeORM (`synchronize: true` in dev, explicit migrations in prod). This preserves the independent-deployability principle.

**All database and user resources have `prevent_destroy = true`.** `terraform apply` is fully rerunnable — it will never drop a database or user unless you explicitly remove the guard first (see below).

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # fill in project_id + strong passwords
terraform init
terraform plan   # always review before applying
terraform apply
```

**To intentionally delete a database or user** (requires a deliberate two-step):
1. Set `prevent_destroy = false` on the target resource in `cloudsql.tf`.
2. Open a PR, get it reviewed, then run `terraform apply` followed by `terraform destroy -target=<resource>`.
3. Restore `prevent_destroy = true` in a follow-up commit.

**When adding a new service (ENFORCED convention):**
1. Create `infra/terraform/<service-name>.tf` — copy `auth-service.tf` as the template. It MUST contain exactly `google_sql_database` + `google_sql_user`, both with `prevent_destroy = true`. Never add service-specific resources to `cloudsql.tf` (instance-only file).
2. Add a `variable "<service_name>_db_password"` block to `infra/terraform/variables.tf`.
3. Mirror the change in `docker/init-databases.sql` for local dev parity.
4. Add connection string output to `infra/terraform/outputs.tf`.

> **TODO — IAM Database Authentication**: All services currently use password-based Cloud SQL authentication (`<service>_user` + password stored in Secret Manager). This should be migrated to [Cloud SQL IAM database authentication](https://cloud.google.com/sql/docs/postgres/iam-authentication) so that Cloud Run service accounts authenticate via short-lived IAM tokens instead of long-lived passwords. When implemented: remove `google_sql_user` password resources and `*_db_password` variables from Terraform; grant each service account `roles/cloudsql.instanceUser`; update `DATABASE_URL` to use `?sslmode=disable&user=<SA_EMAIL>` format; remove the corresponding Secret Manager secrets.

## Code Quality

- No `any` types in TypeScript — use `unknown` or a typed alternative.
- All functions MUST have explicit return types.
- All endpoints MUST have Swagger decorators.
- `strict: true` enforced in every `tsconfig.json`.
- Every service MUST have unit tests for all business logic.
- Every endpoint MUST have integration/e2e tests (happy path + auth + validation + errors).
- 100% code coverage (statements, branches, functions, lines) is a merge blocker.
- **Never leave failing tests behind, regardless of who introduced them.** If a
  test is red on the branch you're shipping — even one that was already red on
  `main` before your work — you fix it, delete it (with justification), or
  surface it before merge. "Pre-existing failure, not in scope" is not a
  defence: a green test suite is the floor, not a stretch goal. If the failure
  is genuinely out of scope, file an issue and link it in the PR before
  shipping; do not push past a red bar in silence.

## Local development

Requires **Node 20** (`.nvmrc`); Node 26 cannot compile auth-service's `better-sqlite3`
test dependency. Bring up the stack with `docker compose up -d --build`. The web shell's
Google sign-in needs a GCP OAuth Web client — set `VITE_GOOGLE_CLIENT_ID` (web build) and
`GOOGLE_CLIENT_ID` (auth-service) to the same client id in a git-ignored root `.env`.

## Active Technologies

- TypeScript 5 (strict) + NestJS (auth-service), React 19 + Vite (web shell), Expo (mobile shell),
  Kong 3.4 + Python plugins (kong-gateway), HCL/Terraform (infra). No business-domain stack yet —
  the new domain adds its own.

## Recent Changes

- Initialised as a domain-agnostic infrastructure template (auth-service + Kong gateway + GCP
  infra + buildable web/mobile shells). No business domain yet — grow it on top of this baseline.

<!-- SPECKIT START -->
No active feature. Start one with the Spec Kit flow (constitution → specify → plan → tasks); it
will create `specs/<NNN-feature-name>/` and update this section.
<!-- SPECKIT END -->
