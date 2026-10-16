# content-service — Implementation plan

Implements [SPEC.md](SPEC.md). Follows the repo constitution (`CLAUDE.md`): NestJS service,
own DB + user, routed only through Kong, deployed to its own Cloud Run service.

## Architecture

```
browser / mobile ──► web nginx ──► Kong ──► content-service (Cloud Run, private, :3002)
                     /api/content          │   ├─ Postgres  my-db / content-service
                                           │   ├─ Cloud Storage bucket lavi-memorial-photos
                                           │   └─ auth-service  GET /admin/users/:id  (email lookup)
```

- **Public reads** (`GET /content-service/content/public/...`) pass Kong without a session.
  Kong's `_PUBLIC_PATHS` is an exact-match set today; add a small public **prefix** list
  (`/content-service/content/public/`) in `session_identity.py`.
- **Writes** go through Kong's session check; Kong injects `X-User-Id`. content-service maps
  the id → email by calling auth-service `GET /admin/users/:id` (IAM-authenticated Cloud Run
  call + `X-Admin-Secret`), cached 5 min, then checks Owner (`OWNER_EMAILS`) / Editor table.

## Data (TypeORM, `content-service` database)

| Table | Columns |
|---|---|
| `topics` | id uuid, slug unique, title, description, cover_picture_id null, position int, status enum(draft,published), created_at, updated_at |
| `pictures` | id uuid, topic_id fk (cascade), storage_key, width, height, caption, date_text, place, story, position int, status, created_at, updated_at |
| `editors` | email (pk, lower-case), added_by, created_at |
| `audit_log` | id, actor_user_id, actor_email, action, entity, entity_id, details jsonb, at |

Schema is applied with TypeORM `synchronize` on startup — the same as auth-service today.
**Follow-up:** switch both services to explicit migrations, as the constitution asks.

## Images

- Bucket `lavi-memorial-photos` (Terraform), uniform access, **public read** on objects —
  keys are random UUIDs; draft images are unlisted but reachable if the URL is known
  (acceptable for v1; noted in SPEC open questions if you want stricter).
- On upload (multipart, ≤ 20 MB): validate type with `sharp`, re-encode (drops EXIF/GPS),
  store `original.jpg` (≤ 4000 px), `display.jpg` (2000 px), `thumb.jpg` (600 px) — JPEG only.
- The web back office uploads one file per request (Cloud Run's 32 MB request cap).
- New dependency: **`sharp`** (image resize) and **`@google-cloud/storage`** — no existing
  stack component covers either (YAGNI check passed).

## API (all under `/content`, Swagger-documented)

Public: `GET /content/public/topics` (published topics + cover), `GET /content/public/topics/:slug` (published pictures).
Editor: `GET/POST /content/topics`, `PATCH/DELETE /content/topics/:id`, `PUT /content/topics/order`,
`POST /content/topics/:id/pictures` (upload), `PATCH/DELETE /content/pictures/:id`,
`PUT /content/pictures/:id/image` (replace), `PUT /content/topics/:id/pictures/order`.
Owner: `GET/POST /content/editors`, `DELETE /content/editors/:email`.
Me: `GET /content/me` → `{ role: 'owner'|'editor'|'viewer' }` (drives back-office visibility).

## Web

- Public pages read from `/api/content/public/*` instead of `gallery/galleries.json`;
  viewer shows caption / date / place / story.
- Back office at `#/admin` (hidden unless `/content/me` says editor/owner): topic list with
  drag reorder + publish toggle, topic editor, picture grid with multi-upload, picture editor,
  editors page (owner).
- nginx: add `location /api/content` → Kong.

## Mobile

Reads the same public API via `EXPO_PUBLIC_WEB_URL/api/content/...`; shows the new fields.
No editing on mobile in v1 (back office is web, works in a phone browser).

## Infra & deploy

- Terraform: `content-service.tf` (DB + user, `prevent_destroy`), bucket + IAM, runtime SA
  `content-service` (cloudsql.client, storage objectAdmin on the bucket, run.invoker on
  auth-service), Kong SA run.invoker on content-service; `docker/init-databases.sql` mirror.
- Secrets: `content-service-database-url`, reuse `auth-service-admin-secret` for the lookup.
- Kong registration in all four places (kong.yml.template, dynamic_router UPSTREAM_MAP,
  docker-init.sh, docker-compose) + public prefix.
- `.github/workflows/deploy-content-service.yml`; Kong redeploy with the new upstream URL.
- Placeholder import: one-off seed on first start (SPEC §5) reading the existing images.
