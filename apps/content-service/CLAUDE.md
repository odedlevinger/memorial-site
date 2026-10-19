# content-service — Claude Instructions

Owns the Memory site's topics, pictures, captions, About/Contact text, site title, languages and editors. NestJS 11, TypeScript 5
(strict), port 3002. Requirements: [SPEC.md](SPEC.md) · design: [plan.md](plan.md) ·
work order: [tasks.md](tasks.md).

## Architecture

```
src/
├── main.ts                     Bootstrap, ValidationPipe, Swagger, local file serving
├── modules/content.module.ts   Wiring; imageStoreFactory (GCS vs local); typeOrmOptions
├── controllers/                public · me · topics · pictures · editors · pages · site · languages · activity
├── services/                   topics · pictures · images (sharp) · image-store · editors
│                               pages · site · languages · translations (helpers) · activity
│                               roles · identity (auth-service lookup) · audit · seed
├── guards/roles.guard.ts       X-User-Id → Caller; @RequireRole('editor' | 'owner')
├── dto/content.dto.ts          class-validator DTOs (limits from SPEC §2)
├── entities/                   topic · picture · editor · owner · page · site · language · daily-sign-in · audit-log
├── interfaces/                 contracts (views, Caller, ImageStore, IdentityLookup)
└── testing/harness.ts          in-memory SQLite app + fakes (test-only, not covered)
```

## Rules

- **Trust boundary**: the service is private on Cloud Run; only Kong calls it. Kong strips
  client-supplied `X-User-Id` and injects the session-verified one — never accept identity
  from anywhere else.
- **Roles**: owner = the `site_owner` row (set by `PUT /content/editors/owner`), else
  `OWNER_EMAILS` (config); editor = `editors` table; else viewer. `GET /content/editors`
  lists the owner(s) first; the owner can't be removed.
  Every write endpoint is guarded; public reads live only under `/content/public/*`.
- **Images**: always go through `ImagesService.store` — it validates type/size and
  re-encodes every derivative (drops EXIF/GPS). Never store an upload as-is.
- **Movie video files** are the exception: too big for Cloud Run's 32 MB request cap, the
  browser uploads them straight to storage. `POST /content/topics/:id/video-upload` returns a
  resumable-upload URL (created with the page's `origin`, so storage allows its CORS) and a
  `videos/<uuid>/video.<ext>` path; the browser PUTs the file there, then
  `PUT /content/topics/:id/video` confirms it (exists, ≤ 2 GB) and deletes any previous file.
  They are stored as uploaded (no re-encoding) and served through the same public base.
- **Page kinds**: a topic is a `pictures` set, a `text` page (body with `## heading`, `> quote`,
  `[photo <id> left|right]` lines) or a `book` (body + `details` + `buyUrl`/`buyLabel`) or a
  `movie` (`videoUrl`, a YouTube link, and/or an uploaded video file `videoKey`, + optional body). A picture set's `columns` (1–3, default 3)
  is how many pictures the website shows per row.
- **Public filtering**: only `published` topics are public; a `pictures` topic also needs ≥ 1
  `published` picture. Only published pictures are ever served publicly.
- Every write calls `AuditService.record`.
- **Languages**: translatable text lives in the row's own columns (the default language)
  plus a `translations` JSON column (code → field → text). Read with `textOf`, write with
  `setText` (services/translations.ts) — never assign translatable columns directly.
  Controllers turn `?lang=` into a `LangContext` via `LanguagesService.context` (lenient for
  public reads, strict — 400 on unknown codes — for writes). Changing the default language
  rewrites every row's columns (`switchDefault`) in one transaction.
- **Activity**: `GET /content/me` (called on every page load by signed-in people) records
  one `daily_sign_ins` row per person per day (insert-or-ignore). `GET /content/activity`
  (editors) returns daily counts; days follow `SITE_TIME_ZONE`.
- Tests: `npm test` (Jest, in-memory SQLite via `testing/harness.ts`); 100 % coverage gate.
