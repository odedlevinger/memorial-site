# content-service — Claude Instructions

Owns the Memory site's topics, pictures, captions, About/Contact text, site title, languages and editors. NestJS 11, TypeScript 5
(strict), port 3002. Requirements: [SPEC.md](SPEC.md) · design: [plan.md](plan.md) ·
work order: [tasks.md](tasks.md).

## Architecture

```
src/
├── main.ts                     Bootstrap, ValidationPipe, Swagger, local file serving
├── modules/content.module.ts   Wiring; imageStoreFactory (GCS vs local); typeOrmOptions
├── controllers/                public · me · topics · pictures · editors · pages · site · languages
├── services/                   topics · pictures · images (sharp) · image-store · editors
│                               pages · site · languages · translations (helpers)
│                               roles · identity (auth-service lookup) · audit · seed
├── guards/roles.guard.ts       X-User-Id → Caller; @RequireRole('editor' | 'owner')
├── dto/content.dto.ts          class-validator DTOs (limits from SPEC §2)
├── entities/                   topic · picture · editor · page · site · language · audit-log
├── interfaces/                 contracts (views, Caller, ImageStore, IdentityLookup)
└── testing/harness.ts          in-memory SQLite app + fakes (test-only, not covered)
```

## Rules

- **Trust boundary**: the service is private on Cloud Run; only Kong calls it. Kong strips
  client-supplied `X-User-Id` and injects the session-verified one — never accept identity
  from anywhere else.
- **Roles**: owner = `OWNER_EMAILS` (config); editor = `editors` table; else viewer.
  Every write endpoint is guarded; public reads live only under `/content/public/*`.
- **Images**: always go through `ImagesService.store` — it validates type/size and
  re-encodes every derivative (drops EXIF/GPS). Never store an upload as-is.
- **Public filtering**: only `published` topics with ≥ 1 `published` picture are public.
- Every write calls `AuditService.record`.
- **Languages**: translatable text lives in the row's own columns (the default language)
  plus a `translations` JSON column (code → field → text). Read with `textOf`, write with
  `setText` (services/translations.ts) — never assign translatable columns directly.
  Controllers turn `?lang=` into a `LangContext` via `LanguagesService.context` (lenient for
  public reads, strict — 400 on unknown codes — for writes). Changing the default language
  rewrites every row's columns (`switchDefault`) in one transaction.
- Tests: `npm test` (Jest, in-memory SQLite via `testing/harness.ts`); 100 % coverage gate.
