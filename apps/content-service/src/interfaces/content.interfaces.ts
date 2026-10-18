// Contracts for the content-service. Implementations live in ../services.

export type ContentStatus = 'draft' | 'published';
export const CONTENT_STATUSES: readonly ContentStatus[] = ['draft', 'published'];

/** How a topic's page is shown: a picture set, an illustrated text, or a book. */
export type TopicKind = 'pictures' | 'text' | 'book';
export const TOPIC_KINDS: readonly TopicKind[] = ['pictures', 'text', 'book'];

export type Role = 'owner' | 'editor' | 'viewer';

/**
 * Per-language text for a row: language code → field → text. The row's own columns hold
 * the default language's text; a field missing here falls back to the default language.
 */
export type Translations = Record<string, Record<string, string>>;

/** Image URLs for one picture (display size + thumbnail). */
export interface PictureImages {
  readonly display: string;
  readonly thumb: string;
}

export interface PictureView {
  readonly id: string;
  readonly topicId: string;
  readonly caption: string | null;
  readonly dateText: string | null;
  readonly place: string | null;
  readonly story: string | null;
  readonly position: number;
  readonly status: ContentStatus;
  readonly width: number;
  readonly height: number;
  readonly images: PictureImages;
  /** Back office only: every language's text, for editing translations. */
  readonly translations?: Translations;
}

export interface TopicView {
  readonly id: string;
  readonly slug: string;
  readonly kind: TopicKind;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
  readonly status: ContentStatus;
  readonly coverPictureId: string | null;
  readonly cover: PictureImages | null;
  readonly pictureCount: number;
  /** Back office only: every language's text, for editing translations. */
  readonly translations?: Translations;
}

export interface TopicDetailView extends TopicView {
  readonly pictures: readonly PictureView[];
  /**
   * Text and book pages: plain text, paragraphs separated by blank lines. A line may be
   * `## heading`, `> quote`, or `[photo <id> …]` — one or more of the topic's pictures (by
   * id or its first 8 characters), optionally followed by `left` / `right`.
   */
  readonly body: string | null;
  /** Book pages: "Label: value" lines. */
  readonly details: string | null;
  readonly buyUrl: string | null;
  readonly buyLabel: string | null;
}

/** Who is calling, as resolved from Kong's X-User-Id. */
export interface Caller {
  readonly userId: string;
  readonly email: string;
  readonly role: Role;
}

/** Looks up a user's email from auth-service. */
export interface IdentityLookup {
  emailForUser(userId: string): Promise<string | null>;
}

/** Stored image derivatives for one upload. */
export interface StoredImage {
  readonly key: string;
  readonly width: number;
  readonly height: number;
}

/** Blob storage for images (Cloud Storage in prod, local disk / memory in dev & tests). */
export interface ImageStore {
  put(path: string, data: Buffer, contentType: string): Promise<void>;
  remove(prefix: string): Promise<void>;
  publicUrl(path: string): string;
}

/** The fixed site pages whose text editors can change. */
export type PageSlug = 'about' | 'contact';
export const PAGE_SLUGS: readonly PageSlug[] = ['about', 'contact'];

/** A site page's text: plain text, paragraphs separated by blank lines. */
export interface PageView {
  readonly slug: PageSlug;
  readonly body: string;
  /** null while the page still shows its built-in default text. */
  readonly updatedAt: string | null;
  /** Back office only: every language's text, for editing translations. */
  readonly translations?: Translations;
}

/** The site's name and tagline, shown in the header. */
export interface SiteView {
  readonly title: string;
  /** May be empty — the header then shows the title alone. */
  readonly tagline: string;
  /** null while the site still uses the built-in defaults. */
  readonly updatedAt: string | null;
  /** Back office only: every language's text, for editing translations. */
  readonly translations?: Translations;
}

export type Direction = 'ltr' | 'rtl';
export const DIRECTIONS: readonly Direction[] = ['ltr', 'rtl'];

/** A language the site is offered in. Exactly one is the default. */
export interface LanguageView {
  /** Lower-case language tag, e.g. `en`, `he`, `pt-br`. */
  readonly code: string;
  /** Shown in the language switcher, ideally in the language itself (e.g. עברית). */
  readonly name: string;
  readonly direction: Direction;
  readonly isDefault: boolean;
  /** Editor overrides for the site's fixed labels (menu, buttons, messages), by label key. */
  readonly labels: Readonly<Record<string, string>>;
}

/** Which language a request reads or writes, and the site's default language. */
export interface LangContext {
  readonly code: string;
  readonly defaultCode: string;
}

/** Signed-in people on one day (site time zone). */
export interface DailyCount {
  /** YYYY-MM-DD */
  readonly day: string;
  readonly count: number;
}

/** Back-office activity: signed-in people per day, oldest day first, days without visits as 0. */
export interface ActivityView {
  readonly timeZone: string;
  readonly days: readonly DailyCount[];
  /** Different people over the whole period (someone on several days counts once). */
  readonly people: number;
}
