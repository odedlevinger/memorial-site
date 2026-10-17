// Client for content-service, reached same-origin at /api/content (nginx → Kong).
// Public reads need no session; back-office calls send the app_session cookie.

export type ContentStatus = 'draft' | 'published';
export type Role = 'owner' | 'editor' | 'viewer';

/** Back office only: language code → field → text (see content-service's Translations). */
export type Translations = Readonly<Record<string, Readonly<Record<string, string>>>>;

export type Direction = 'ltr' | 'rtl';

/** A language the site is offered in. Exactly one is the default. */
export interface Language {
  readonly code: string;
  readonly name: string;
  readonly direction: Direction;
  readonly isDefault: boolean;
  /** Editor overrides for the fixed labels (see i18n.tsx), by label key. */
  readonly labels: Readonly<Record<string, string>>;
}

export interface PictureImages {
  readonly display: string;
  readonly thumb: string;
}

export interface Picture {
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
  readonly translations?: Translations;
}

export interface Topic {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
  readonly status: ContentStatus;
  readonly coverPictureId: string | null;
  readonly cover: PictureImages | null;
  readonly pictureCount: number;
  readonly translations?: Translations;
}

export interface TopicDetail extends Topic {
  readonly pictures: readonly Picture[];
}

export type PageSlug = 'about' | 'contact';

/** About / Contact text: plain text, paragraphs separated by blank lines. */
export interface Page {
  readonly slug: PageSlug;
  readonly body: string;
  /** null while the page still shows its built-in default text. */
  readonly updatedAt: string | null;
  readonly translations?: Translations;
}

/** The site's name and tagline, shown in the header. */
export interface SiteInfo {
  readonly title: string;
  /** May be empty — the header then shows the title alone. */
  readonly tagline: string;
  readonly updatedAt: string | null;
  readonly translations?: Translations;
}

/** Used if the site settings cannot be loaded (matches content-service's defaults). */
export const DEFAULT_SITE: SiteInfo = { title: 'Memory', tagline: 'a life in photographs', updatedAt: null };

export interface Editor {
  readonly email: string;
  readonly addedBy: string;
  readonly createdAt: string;
}

export type TopicPatch = Partial<Pick<Topic, 'title' | 'slug' | 'description' | 'status' | 'coverPictureId'>>;
export type PicturePatch = Partial<Pick<Picture, 'caption' | 'dateText' | 'place' | 'story' | 'status' | 'topicId'>>;
export type LanguagePatch = Partial<Pick<Language, 'name' | 'direction' | 'labels'>> & { readonly isDefault?: true };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const BASE = '/api/content';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: isForm ? init.headers : { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: unknown };
    const message = Array.isArray(body.message) ? body.message.join(', ') : typeof body.message === 'string' ? body.message : res.statusText;
    throw new ApiError(res.status, message || `Request failed (${res.status})`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/**
 * Public reads are the first thing a visitor waits on. After a quiet spell the
 * Cloud Run chain (nginx → Kong → content-service) cold-starts, which can stall
 * or 5xx a request, so these time out and retry instead of hanging on "Loading…".
 */
export const publicRetry = { attempts: 3, timeoutMs: 15_000, backoffMs: 1_000 };

async function publicCall<T>(path: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call<T>(path, { signal: AbortSignal.timeout(publicRetry.timeoutMs) });
    } catch (err) {
      const clientError = err instanceof ApiError && err.status < 500;
      if (clientError || attempt >= publicRetry.attempts) throw err;
      await new Promise((r) => setTimeout(r, publicRetry.backoffMs * attempt));
    }
  }
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
/** Appends `?lang=` — text is read / written in that language (default language when omitted). */
const inLang = (path: string, lang?: string): string => (lang ? `${path}?lang=${encodeURIComponent(lang)}` : path);
const file = (field: string, f: File): FormData => {
  const form = new FormData();
  form.append(field, f);
  return form;
};

export const contentApi = {
  publicTopics: (lang?: string): Promise<Topic[]> => publicCall(inLang('/public/topics', lang)),
  publicTopic: (slug: string, lang?: string): Promise<TopicDetail> => publicCall(inLang(`/public/topics/${encodeURIComponent(slug)}`, lang)),
  publicPage: (slug: PageSlug, lang?: string): Promise<Page> => publicCall(inLang(`/public/pages/${slug}`, lang)),
  publicSite: (lang?: string): Promise<SiteInfo> => publicCall(inLang('/public/site', lang)),
  publicLanguages: (): Promise<Language[]> => publicCall('/public/languages'),

  /** The caller's back-office role; 'viewer' when signed out. */
  me: async (): Promise<Role> => {
    try {
      return (await call<{ role: Role }>('/me')).role;
    } catch {
      return 'viewer';
    }
  },

  topics: (): Promise<Topic[]> => call('/topics'),
  topic: (id: string): Promise<TopicDetail> => call(`/topics/${id}`),
  createTopic: (title: string): Promise<TopicDetail> => call('/topics', json('POST', { title })),
  updateTopic: (id: string, patch: TopicPatch, lang?: string): Promise<TopicDetail> => call(inLang(`/topics/${id}`, lang), json('PATCH', patch)),
  deleteTopic: (id: string): Promise<void> => call(`/topics/${id}`, { method: 'DELETE' }),
  reorderTopics: (ids: readonly string[]): Promise<Topic[]> => call('/topics/order', json('PUT', { ids })),

  /** One file per request keeps each upload well under Cloud Run's 32 MB request cap. */
  uploadPicture: (topicId: string, f: File): Promise<Picture[]> =>
    call(`/topics/${topicId}/pictures`, { method: 'POST', body: file('files', f) }),
  updatePicture: (id: string, patch: PicturePatch, lang?: string): Promise<Picture> => call(inLang(`/pictures/${id}`, lang), json('PATCH', patch)),
  replacePictureImage: (id: string, f: File): Promise<Picture> => call(`/pictures/${id}/image`, { method: 'PUT', body: file('file', f) }),
  deletePicture: (id: string): Promise<void> => call(`/pictures/${id}`, { method: 'DELETE' }),
  reorderPictures: (topicId: string, ids: readonly string[]): Promise<Picture[]> =>
    call(`/topics/${topicId}/pictures/order`, json('PUT', { ids })),

  /** Back-office reads: default-language text plus every language's translations. */
  page: (slug: PageSlug): Promise<Page> => call(`/pages/${slug}`),
  site: (): Promise<SiteInfo> => call('/site'),
  updatePage: (slug: PageSlug, body: string, lang?: string): Promise<Page> => call(inLang(`/pages/${slug}`, lang), json('PUT', { body })),
  updateSite: (title: string, tagline: string, lang?: string): Promise<SiteInfo> => call(inLang('/site', lang), json('PUT', { title, tagline })),

  addLanguage: (language: Pick<Language, 'code' | 'name' | 'direction'>): Promise<Language[]> => call('/languages', json('POST', language)),
  updateLanguage: (code: string, patch: LanguagePatch): Promise<Language[]> =>
    call(`/languages/${encodeURIComponent(code)}`, json('PATCH', patch)),
  removeLanguage: (code: string): Promise<Language[]> => call(`/languages/${encodeURIComponent(code)}`, { method: 'DELETE' }),

  editors: (): Promise<Editor[]> => call('/editors'),
  addEditor: (email: string): Promise<Editor[]> => call('/editors', json('POST', { email })),
  removeEditor: (email: string): Promise<Editor[]> => call(`/editors/${encodeURIComponent(email)}`, { method: 'DELETE' }),
};

/** Returns a copy of `list` with the item at `from` moved to `to`. */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}
