// Contracts for the content-service. Implementations live in ../services.

export type ContentStatus = 'draft' | 'published';
export const CONTENT_STATUSES: readonly ContentStatus[] = ['draft', 'published'];

/** How a topic's page is shown: a picture set, an illustrated text, a book, or a YouTube movie. */
export type TopicKind = 'pictures' | 'text' | 'book' | 'movie';
export const TOPIC_KINDS: readonly TopicKind[] = ['pictures', 'text', 'book', 'movie'];

/** How many pictures a picture set shows in one row on the website. */
export type GridColumns = 1 | 2 | 3;
export const GRID_COLUMNS: readonly GridColumns[] = [1, 2, 3];

/**
 * The Google Fonts a language's site text can use, by family name. Kept in step with the
 * web app's font catalog (apps/web/src/fonts.ts), which knows how each one looks and loads.
 */
export const SITE_FONTS = [
  'Frank Ruhl Libre', 'David Libre', 'Noto Serif Hebrew', 'Bona Nova', 'Tinos', 'Cardo', 'Bellefair', 'Suez One',
  'Heebo', 'Assistant', 'Rubik', 'Alef', 'Open Sans', 'IBM Plex Sans Hebrew', 'Noto Sans Hebrew', 'Varela Round',
  'Miriam Libre', 'Secular One', 'Amatic SC', 'Karantina', 'Solitreo',
  'EB Garamond', 'Cormorant Garamond', 'Libre Baskerville', 'Lora', 'Crimson Pro', 'Source Serif 4', 'Spectral',
  'Playfair Display', 'Inter', 'Lato', 'Nunito Sans',
] as const;
export type SiteFont = (typeof SITE_FONTS)[number];

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
   * Text, book and movie pages: plain text, paragraphs separated by blank lines. A line may be
   * `## heading`, `> quote`, or `[photo <id> …]` — one or more of the topic's pictures (by
   * id or its first 8 characters), optionally followed by `left` / `right`.
   */
  readonly body: string | null;
  /** Book pages: "Label: value" lines. */
  readonly details: string | null;
  readonly buyUrl: string | null;
  /** Book pages: also show the buy link's page inside the book page, in an embedded frame. */
  readonly buyEmbed: boolean;
  readonly buyLabel: string | null;
  /** Movie pages: the YouTube link (watch, youtu.be, shorts or embed). */
  readonly videoUrl: string | null;
  /** Movie pages: URL of the uploaded video file; the website plays it instead of YouTube. */
  readonly videoFile: string | null;
  /** Picture sets: how many pictures are shown in one row (1–3). */
  readonly columns: GridColumns;
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

/** Blob storage for images and videos (Cloud Storage in prod, local disk / memory in dev & tests). */
export interface ImageStore {
  put(path: string, data: Buffer, contentType: string): Promise<void>;
  remove(prefix: string): Promise<void>;
  publicUrl(path: string): string;
  /**
   * Starts an upload the browser sends straight to storage (videos are far beyond Cloud
   * Run's 32 MB request cap). Returns the URL the browser PUTs the file to; `origin` is the
   * page doing the upload, so storage allows its cross-origin requests.
   */
  createUpload(path: string, contentType: string, origin: string): Promise<string>;
  /** The stored object's size in bytes, or null when there is none. */
  sizeOf(path: string): Promise<number | null>;
}

/** Video file types the website plays (MP4 everywhere; WebM and QuickTime in most browsers). */
export const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' } as const;
export type VideoType = keyof typeof VIDEO_TYPES;

/** Where the browser sends a movie's video file, and the path to confirm once it's there. */
export interface VideoUploadView {
  readonly uploadUrl: string;
  readonly path: string;
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
  /** Galleries in each row of the home page, top to bottom; rows after the last use its number. */
  readonly homeRows: readonly GridColumns[];
  /** URL of the picture shown when a link to the site is shared; null = none. Shared by all languages. */
  readonly shareImage: string | null;
  /** The requested language's font for titles and text; null = the built-in serif. */
  readonly font: SiteFont | null;
  /** null while the site still uses the built-in defaults. */
  readonly updatedAt: string | null;
  /** Back office only: every language's text, for editing translations. */
  readonly translations?: Translations;
  /** Back office only: each language's font, by language code (none = the built-in serif). */
  readonly fonts?: Readonly<Record<string, SiteFont>>;
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
