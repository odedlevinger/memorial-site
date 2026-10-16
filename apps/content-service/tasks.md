# content-service — Tasks

Ordered; each task ends green (tests pass, 100 % coverage for new code).

## Phase 1 — Service skeleton
1. Scaffold `apps/content-service` (NestJS 11, strict TS, Jest, Swagger, ConfigModule),
   `Dockerfile` from auth-service pattern, `.env.example`, `CLAUDE.md`.
2. Entities + migrations: topics, pictures, editors, audit_log.
3. Add DB + user to `docker/init-databases.sql`; service to `docker-compose.yml`.

## Phase 2 — Access control
4. `IdentityService`: X-User-Id → email via auth-service admin API (cached); unit tests.
5. `RolesGuard` (owner / editor / viewer) + `GET /content/me`; e2e tests.
6. Editors module (owner-only list/add/remove) + audit logging; e2e tests.

## Phase 3 — Content
7. Topics CRUD, slug generation, ordering, publish/hide; e2e tests.
8. Storage adapter (Cloud Storage; local-disk fake for tests/dev).
9. Picture upload + `sharp` derivatives + EXIF strip, replace image, edit fields, move,
   delete, ordering, cover selection; e2e tests.
10. Public read endpoints (published-only filtering, ordering, empty-topic rule); e2e tests.
11. Placeholder import seed (runs once on empty DB).

## Phase 4 — Gateway & infra
12. Kong: register upstream in the four places + public path prefix; Kong unit tests.
13. Terraform: `content-service.tf`, bucket, SAs + IAM; plan reviewed before apply.
14. Secrets + `deploy-content-service.yml`; first deploy; Kong redeploy.

## Phase 5 — Web
15. Public pages read the content API; viewer shows caption/date/place/story; tests.
16. Back office shell at `#/admin` gated by `/content/me`; tests.
17. Topic list (drag reorder, publish toggle) + topic editor; tests.
18. Picture grid (multi-upload with progress, drag reorder, cover) + picture editor; tests.
19. Editors page (owner); tests.
20. nginx `/api/content` route.

## Phase 6 — Mobile & finish
21. Mobile reads the content API; viewer shows the new fields.
22. Deploy all; verify on the live site: sign in, edit a caption, upload a picture,
    publish/hide, invite an editor.
