<!--
SYNC IMPACT REPORT
==================
Version change: (unversioned template) → 1.0.0
Rationale: Initial formal ratification. Template placeholders replaced with concrete
principles derived from the repository CLAUDE.md (architecture, conventions, quality bar).

Principles defined:
  I.   Microservice Independence & Isolation
  II.  Spec-Driven Development (NON-NEGOTIABLE)
  III. Test-First & Total Coverage (NON-NEGOTIABLE)
  IV.  Type Safety & API Contract Discipline
  V.   Established Libraries over Custom (YAGNI)

Sections added:
  - Technology Stack & Infrastructure Constraints
  - Development Workflow & Quality Gates
  - Governance

Templates reviewed for consistency:
  - .specify/templates/plan-template.md   ✅ Constitution Check is generic ("[Gates
    determined based on constitution file]") — no hardcoded principle names, stays in sync.
  - .specify/templates/spec-template.md   ✅ No constitution/principle coupling.
  - .specify/templates/tasks-template.md  ✅ No constitution/principle coupling.

Deferred TODOs: none. RATIFICATION_DATE set to first formal adoption (no embedded prior
version existed in the template).
-->

# memorial-site Constitution

## Core Principles

### I. Microservice Independence & Isolation

- Every service MUST be independently deployable. There is no shared runtime coupling
  between services.
- Services MUST communicate only via REST or Redis message queues. Direct imports across
  `apps/` service boundaries are FORBIDDEN.
- Each service MUST own its own database on the shared `my-db` (PostgreSQL 16) instance.
  The database name MUST equal the service directory name, and each service MUST use a
  dedicated `<service-name>_user`. Credentials are NEVER shared between services.
- All HTTP services MUST be reachable only through the Kong gateway; no service may be
  directly client-accessible. Registering a new HTTP service MUST update all four Kong
  touchpoints (`kong.yml.template`, `dynamic_router.py`, `docker-init.sh`,
  `docker-compose.yml`). The sole exception is `pose-pipeline`, a Cloud Run Job with no
  HTTP surface.
- Shared code MUST live in `libs/`, and only after three or more apps need it. The
  `packages/` directory MUST NOT exist.

**Rationale**: Independent deployability and strict isolation keep blast radius small,
let each service ship on its own cadence, and prevent the hidden coupling that erodes a
microservice architecture.

### II. Spec-Driven Development (NON-NEGOTIABLE)

- No service source code may be written before all of `SPEC.md`, `plan.md`, `tasks.md`,
  `CLAUDE.md`, and `Dockerfile` exist for that service.
- The new-service scaffolding gate MUST be checked before creating any service directory.
  Requirements MUST NOT be inferred — if `SPEC.md` is absent, stop and ask the user.
- Infrastructure additions (new database or user) MUST be declared in Terraform under
  `infra/terraform/` and mirrored in `docker/init-databases.sql` for local-dev parity.

**Rationale**: Specification precedes implementation so that intent is explicit,
reviewable, and testable before a single line of code commits the team to a direction.

### III. Test-First & Total Coverage (NON-NEGOTIABLE)

- Every service MUST have unit tests for all business logic and integration/e2e tests for
  every endpoint, covering happy path, authentication, validation, and error cases.
- 100% code coverage across statements, branches, functions, and lines is a merge blocker.
- A green test suite is the floor, not a stretch goal. Failing tests MUST NOT be left
  behind regardless of who introduced them. "Pre-existing failure, not in scope" is not a
  defence: fix it, delete it with explicit justification, or file an issue and link it in
  the PR before merge. Never push past a red bar in silence.

**Rationale**: Tests are the executable contract for behaviour; an enforced green bar is
the only durable guarantee that independently deployed services stay correct.

### IV. Type Safety & API Contract Discipline

- `strict: true` MUST be enforced in every `tsconfig.json`. The `any` type is FORBIDDEN —
  use `unknown` or a precise typed alternative. All functions MUST declare explicit return
  types.
- All input MUST be validated via DTOs using `class-validator` + `class-transformer`. Raw
  request-body access is FORBIDDEN.
- Every endpoint MUST carry Swagger decorators (`@ApiOperation`, `@ApiResponse`) and follow
  REST naming conventions. Interfaces MUST be defined before implementing services. Database
  access MUST use the repository pattern. Configuration MUST flow through `ConfigModule` —
  values are NEVER hardcoded.

**Rationale**: Strong types and documented, validated contracts catch defects at compile
time and keep service boundaries self-describing for every consumer.

### V. Established Libraries over Custom (YAGNI)

- Well-established libraries MUST be preferred over custom implementations, drawn from the
  approved stack (see Technology Stack & Infrastructure Constraints).
- A new dependency is permitted ONLY when the existing stack genuinely cannot handle the
  use case. Every deviation MUST be justified against YAGNI in the introducing task or PR.

**Rationale**: Reusing battle-tested libraries reduces maintenance surface and bug count;
unjustified custom code and dependency sprawl are the opposite of simplicity.

## Technology Stack & Infrastructure Constraints

- **Mandated stack**: Nx (monorepo), TypeScript 5 (strict), NestJS (backend microservices),
  React 19 + Tailwind CSS + Zustand + Axios (frontend), Docker (`node:20-alpine`), GCP Cloud
  Run + Artifact Registry, GitHub Actions (CI/CD), Jest + Supertest (backend tests),
  Vitest + @testing-library/react (frontend tests).
- **Docker**: Multi-stage builds only; base image `node:20-alpine`; containers MUST NOT run
  as root; a single `.dockerignore` lives at the repo root. NestJS service Dockerfiles MUST
  use the monorepo-aware pattern with the build context set to the repo root, because
  `package-lock.json` exists only there and `npm ci` requires it.
- **Deployment**: Region is `me-west1` (Tel Aviv). Each service has its own Cloud Run
  instance. Images are tagged with the git SHA. Secrets flow through GCP Secret Manager and
  are NEVER passed as plain environment variables.
- **Infrastructure as code**: All cloud infrastructure lives in `infra/terraform/`. Terraform
  owns the shared Cloud SQL instance plus exactly one `google_sql_database` and one
  `google_sql_user` per service, all with `prevent_destroy = true`. Terraform MUST NOT manage
  schemas or table structure — each service owns its schema lifecycle via TypeORM. Adding a
  service MUST follow the documented Terraform steps (new `<service>.tf`, password variable,
  `docker/init-databases.sql` mirror, connection-string output).

## Development Workflow & Quality Gates

- The Spec-Driven flow is executed through the `/speckit-*` commands in order:
  `constitution → specify → plan → tasks → implement`.
- The six-step new-service gate (SPEC.md, plan.md, tasks.md, CLAUDE.md, Dockerfile, `src/`)
  MUST pass before any source code is written for a service.
- A green test suite and 100% coverage are merge blockers (Principle III).
- All pull requests MUST verify compliance with these principles. Any added complexity MUST
  be justified; unjustified complexity is grounds to reject the change.
- Runtime development guidance lives in the repo-root `CLAUDE.md` and each service's
  `CLAUDE.md`; these MUST stay consistent with this constitution.

## Governance

- This constitution supersedes all other development practices. Where another document
  conflicts with it, this constitution wins.
- Amendments MUST be documented in this file, reviewed via pull request, and versioned using
  semantic versioning:
  - **MAJOR** — backward-incompatible governance or principle removals/redefinitions.
  - **MINOR** — a new principle or section, or materially expanded guidance.
  - **PATCH** — clarifications, wording, and non-semantic refinements.
- Compliance is reviewed at pull-request time; reviewers MUST confirm the change upholds
  every applicable principle.
- Destructive infrastructure changes MUST follow the deliberate two-step `prevent_destroy`
  procedure documented in the repo-root `CLAUDE.md` before any database or user is dropped.

**Version**: 1.0.0 | **Ratified**: 2026-06-02 | **Last Amended**: 2026-06-02
