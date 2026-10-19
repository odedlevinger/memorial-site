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
| Owner | One account — initially `oded.levinger@gmail.com` (configured); can be handed to an Editor in-app | Everything an Editor can, **plus** invite and remove Editors and hand ownership to an Editor. |

- Editors are identified by **email address**. An invitation is just an email on the editor
  list; it takes effect the next time that Google account signs in (no invitation email is
  sent in v1).
- Until ownership is handed over in the back office, the Owner list comes from configuration
  (`OWNER_EMAILS`). Handing over (owner only) picks an existing Editor — so a mistyped email
  can never take ownership — stores them in `site_owner`, and keeps the previous owner on as
  an Editor. The owner cannot be removed. Recovery: delete the `site_owner` row to fall back to
  `OWNER_EMAILS`.
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

**Page** (About, Contact)
- Fixed set: `about` and `contact` — pages cannot be added or removed.
- Text (required, ≤ 10,000 chars) — plain text; a blank line starts a new paragraph, and
  web / email addresses are shown as links. No HTML.
- Until an editor first saves a page, it shows built-in default text.

**Site settings**
- Title (required, ≤ 60 chars) and tagline (optional, ≤ 120 chars) — shown in the header,
  footer and browser tab. Defaults: "Memory" / "a life in photographs".

**Language**
- Code (lower-case language tag, e.g. `en`, `he`, `pt-br`), name as shown in the language
  switcher (≤ 40 chars, e.g. "עברית"), text direction (`ltr` or `rtl`).
- Exactly one language is the **default**: visitors see it until they pick another, and any
  text not yet translated falls back to it. Until an editor adds a language the site is
  English only (left to right).
- Label overrides (≤ 300 labels, ≤ 500 chars each) for the public site's fixed menu items,
  buttons and messages; labels left empty use the built-in text (English and Hebrew ship
  built in) or else the default language's.
- Translatable, per language: topic title and description; picture caption, date, place and
  story; About / Contact text; site title and tagline. Slugs, status, order, covers and
  images are shared by all languages. In a non-default language, empty text means "use the
  default language's text"; required fields are required only in the default language.
- Removing a language keeps its translations (adding it back restores them). The default
  language cannot be removed. Changing the default keeps every language's text.

## 3. Back office capabilities (Editor and Owner)

1. List all topics (drafts included) in their current order; create, edit, delete a topic.
2. Reorder topics by drag-and-drop.
3. Publish / hide a topic.
4. Within a topic: upload one or many pictures, replace a picture's image file, edit all
   picture fields, move a picture to another topic, delete a picture.
5. Reorder pictures by drag-and-drop; choose the topic's cover picture.
6. Publish / hide a picture.
7. Deleting a topic requires confirmation and deletes its pictures.
8. Owner only: view the owner and Editors, add and remove Editors (by email), and make an Editor the owner.
9. Edit the text of the About and Contact pages.
10. Edit the site title and tagline.
11. Add, rename and remove languages, set each one's text direction and labels, and choose
    the default language.
12. Edit every translatable field (§2) in any of the site's languages.
13. See an activity chart: how many signed-in people used the site each day (last 7, 30 or
    90 days, in the site's time zone, `SITE_TIME_ZONE`, default Asia/Jerusalem). A person
    counts once per day however many visits, sessions or devices; only the day and user id
    are stored. Visitors who don't sign in are not counted.
14. Movie pages: upload a video file (MP4, WebM or MOV, up to 2 GB), replace it, or remove
    it. The browser sends the file straight to storage; a new file deletes the old one.

## 4. Public site behaviour

- Web and mobile show only **published** topics, and within them only **published** pictures,
  in the editor-defined order.
- A published topic with no published pictures is not shown.
- The viewer shows caption, date, place and story when present.
- The About and Contact pages show their current text.
- A movie page plays its uploaded video file with only play/pause and full screen (no
  YouTube overlays), else its YouTube link. It starts on arrival where the browser allows.
- Reads take `?lang=<code>`; text comes back in that language, falling back to the default
  language field by field. An unknown code reads as the default language.
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
- Version history / undo beyond the audit log.
- Language-specific slugs / URLs, and automatic (machine) translation.

## 8. Open questions (defaults assumed unless changed)

1. Max upload size 20 MB, formats JPEG/PNG/WebP — HEIC from iPhones is converted?
   *Default: not in v1; upload JPEG.*
2. Should the public site stay fully public, or require sign-in to view?
   *Default: public.*
