# content-service — Specification

Owns the Memory site's content: **topics** (galleries) and **pictures** with their captions,
plus the list of people allowed to edit them. Serves the public site (web + mobile) and the
web **back office**.

Status: draft for review · Requirements source: owner answers, 2026-10-16.

## 1. Users and roles

| Role | Who | Can |
|---|---|---|
| Visitor | Anyone (no sign-in) | View **published** topics and pictures. |
| Editor | Invited family member, signed in with Google | Everything in §3 (topics, pictures, captions, ordering, publish/hide). |
| Owner | `oded.levinger@gmail.com` (configured, not editable in-app) | Everything an Editor can, **plus** invite and remove Editors. |

- Editors are identified by **email address**. An invitation is just an email on the editor
  list; it takes effect the next time that Google account signs in (no invitation email is
  sent in v1).
- The Owner list comes from configuration (`OWNER_EMAILS`), so the owner can never lock
  themselves out.
- Signed-in users who are not Owner/Editor see the public site only.

## 2. Content model

**Topic** (gallery)
- Title (required, ≤ 120 chars), unique URL slug (derived from title, editable).
- Description (optional, ≤ 2,000 chars) — shown at the top of the gallery page.
- Cover picture — one of its own pictures; defaults to the first picture.
- Position — order of topics on the home page.
- Status — `draft` (hidden) or `published`.

**Picture**
- Belongs to exactly one topic.
- Image file — JPEG, PNG or WebP, up to 20 MB per upload.
- Caption (optional, ≤ 300 chars) — shown under the picture in the viewer.
- Date / year (optional free text, ≤ 60 chars, e.g. "Summer 1974").
- Place (optional, ≤ 120 chars).
- Story (optional, ≤ 5,000 chars) — longer text shown in the viewer.
- Position — order within its topic.
- Status — `draft` or `published`.

## 3. Back office capabilities (Editor and Owner)

1. List all topics (drafts included) in their current order; create, edit, delete a topic.
2. Reorder topics by drag-and-drop.
3. Publish / hide a topic.
4. Within a topic: upload one or many pictures, replace a picture's image file, edit all
   picture fields, move a picture to another topic, delete a picture.
5. Reorder pictures by drag-and-drop; choose the topic's cover picture.
6. Publish / hide a picture.
7. Deleting a topic requires confirmation and deletes its pictures.
8. Owner only: view, add and remove Editors (by email).

## 4. Public site behaviour

- Web and mobile show only **published** topics, and within them only **published** pictures,
  in the editor-defined order.
- A published topic with no published pictures is not shown.
- The viewer shows caption, date, place and story when present.
- Changes are visible on the public site within 1 minute of saving.

## 5. Placeholders

On first start against an empty database, the 36 generated placeholder pictures (6 topics
× 6) are **imported as ordinary published content**, so they can be renamed, re-captioned,
replaced or deleted like anything else. Import runs once.

## 6. Non-functional requirements

- Routed through the Kong gateway like every service; reads are public, writes require a
  valid session **and** Editor/Owner role (checked server-side on every write).
- Uploaded originals are kept; the service also produces a display size (≤ 2,000 px long
  edge) and a thumbnail (≤ 600 px) so pages stay fast on phones.
- Every write is audit-logged (who, what, when).
- Own database `content-service` on the shared `my-db` instance, own user
  `content-service_user` (constitution).
- Unit tests for all business logic; e2e tests for every endpoint (happy path, auth,
  validation, errors); 100 % coverage.

## 7. Out of scope (v1)

- Sending invitation emails; editor self-registration.
- Comments, likes, or visitor submissions.
- Video.
- Version history / undo beyond the audit log.
- Multiple languages.

## 8. Open questions (defaults assumed unless changed)

1. Max upload size 20 MB, formats JPEG/PNG/WebP — HEIC from iPhones is converted?
   *Default: not in v1; upload JPEG.*
2. Should the public site stay fully public, or require sign-in to view?
   *Default: public.*
