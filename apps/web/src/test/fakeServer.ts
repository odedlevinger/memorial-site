// Test-only in-memory stand-in for /api/content and /api/auth (excluded from coverage).
import type { ContentStatus, Editor, GridColumns, TopicKind, Language, Page, Picture, Role, SiteInfo, Topic, TopicDetail } from '../content';

type Tr = Record<string, Record<string, string>>;
interface Lang {
  code: string;
  isDefault: boolean;
}

interface TopicRow {
  id: string;
  slug: string;
  kind: TopicKind;
  title: string;
  description: string | null;
  body: string | null;
  details: string | null;
  buyUrl: string | null;
  buyEmbed: boolean;
  buyLabel: string | null;
  videoUrl: string | null;
  videoFile: string | null;
  columns: GridColumns;
  status: ContentStatus;
  coverPictureId: string | null;
  translations: Tr;
}

interface PictureRow {
  id: string;
  topicId: string;
  caption: string | null;
  dateText: string | null;
  place: string | null;
  story: string | null;
  status: ContentStatus;
  version: number;
  translations: Tr;
}

let seq = 0;
const uid = (): string => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export class FakeServer {
  role: Role = 'owner';
  signedIn = true;
  topics: TopicRow[] = [];
  pictures: PictureRow[] = [];
  owner: Editor = { email: 'me@example.com', role: 'owner', addedBy: null, createdAt: null };
  editors: Editor[] = [];
  site: SiteInfo & { translations: Tr; homeRows: readonly GridColumns[]; fonts: Record<string, string> } = {
    title: 'Memory', tagline: 'a life in photographs', homeRows: [3], shareImage: null, font: null, updatedAt: null, translations: {}, fonts: {},
  };
  pages: Record<string, Page & { translations: Tr }> = {
    about: { slug: 'about', body: 'About this site.', updatedAt: null, translations: {} },
    contact: { slug: 'contact', body: 'Get in touch.', updatedAt: null, translations: {} },
  };
  languages: Language[] = [{ code: 'en', name: 'English', direction: 'ltr', isDefault: true, labels: {} }];
  /** Signed-in people per day, oldest first, as GET /activity returns them (last N). */
  activity: Array<{ day: string; count: number }> = [];
  activityPeople = 0;
  /** Video uploads started (POST video-upload), with what the client sent. */
  readonly videoUploads: Array<{ path: string; contentType: string; size: number; origin: string }> = [];
  /** "METHOD path" of every request (no query string). */
  readonly calls: string[] = [];
  /** "METHOD path?query" of every request. */
  readonly urls: string[] = [];
  private failures: Array<{ match: RegExp; status: number; body: unknown }> = [];
  private holds: Array<{ match: RegExp; gate: Promise<void> }> = [];

  /** Make the next request whose "METHOD path" matches wait until the returned function is called. */
  hold(match: RegExp): () => void {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    this.holds.push({ match, gate });
    return release;
  }

  /** Make the next request whose "METHOD path" matches fail with `status`. */
  failNext(match: RegExp, status = 500, body: unknown = { message: 'Server error' }): void {
    this.failures.push({ match, status, body });
  }

  addLanguage(code: string, name: string, direction: Language['direction'] = 'ltr', labels: Record<string, string> = {}): void {
    this.languages.push({ code, name, direction, isDefault: false, labels });
  }

  addTopic(title: string, status: ContentStatus = 'published', pictureCount = 2, kind: TopicKind = 'pictures'): TopicRow {
    const t = this.newTopic(title.toLowerCase().replace(/\s+/g, '-'), title, kind, status);
    for (let i = 0; i < pictureCount; i++) this.addPicture(t.id, status);
    return t;
  }

  addPicture(topicId: string, status: ContentStatus = 'published', caption: string | null = null): PictureRow {
    const p: PictureRow = { id: uid(), topicId, caption, dateText: null, place: null, story: null, status, version: 1, translations: {} };
    this.pictures.push(p);
    return p;
  }

  private newTopic(slug: string, title: string, kind: TopicKind, status: ContentStatus): TopicRow {
    const t: TopicRow = {
      id: uid(), slug, kind, title, description: null, body: null, details: null, buyUrl: null, buyEmbed: false, buyLabel: null, videoUrl: null, videoFile: null, columns: 3,
      status, coverPictureId: null, translations: {},
    };
    this.topics.push(t);
    return t;
  }

  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input), 'http://site.test');
    const method = (init.method ?? 'GET').toUpperCase();
    const key = `${method} ${url.pathname}`;
    this.calls.push(key);
    this.urls.push(`${method} ${url.pathname}${url.search}`);
    const held = this.holds.findIndex((h) => h.match.test(key));
    if (held >= 0) await this.holds.splice(held, 1)[0]!.gate;
    const failure = this.failures.findIndex((f) => f.match.test(key));
    if (failure >= 0) {
      const [f] = this.failures.splice(failure, 1);
      return this.json(f!.body, f!.status);
    }
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const code = url.searchParams.get('lang');
    const known = this.languages.find((l) => l.code === code);
    if (code && !known && method !== 'GET') return this.json({ message: `Unknown language "${code}"` }, 400);
    this.lang = known ?? this.defaultLanguage();
    this.query = url.searchParams;
    return this.route(method, url.pathname, body);
  };

  /** The request's language (unknown / missing = the default), set per request. */
  private lang: Lang = { code: 'en', isDefault: true };
  private query = new URLSearchParams();

  private defaultLanguage(): Language {
    return this.languages.find((l) => l.isDefault)!;
  }

  /** Same fallback as content-service: requested language → default language → column. */
  private text<T extends string | null>(row: { translations: Tr }, field: string, base: T): T {
    const d = this.defaultLanguage().code;
    return (row.translations[this.lang.code]?.[field] || row.translations[d]?.[field] || base) as T;
  }

  /** Same write rule as content-service's setText; returns the new column value. */
  private write<T extends string | null>(row: { translations: Tr }, field: string, value: T, base: T): T {
    const own = { ...(row.translations[this.lang.code] ?? {}) };
    if (this.lang.isDefault) own[field] = value ?? '';
    else if (value) own[field] = value;
    else delete own[field];
    row.translations = { ...row.translations, [this.lang.code]: own };
    return this.lang.isDefault ? value : base;
  }

  private route(method: string, path: string, body: Record<string, unknown>): Response {
    const auth = path.match(/^\/api\/auth\/(.+)$/);
    if (auth) return this.authRoute(method, auth[1]!);
    const m = path.match(/^\/api\/content(\/.*)$/);
    if (!m) return this.json({ message: 'Not found' }, 404);
    const p = m[1]!;

    if (method === 'GET' && p === '/public/topics') return this.json(this.publicTopics());
    const pub = p.match(/^\/public\/topics\/([^/]+)$/);
    if (method === 'GET' && pub) {
      const t = this.publicTopics().find((x) => x.slug === decodeURIComponent(pub[1]!));
      return t ? this.json(this.detail(this.topicRow(t.id)!, true)) : this.json({ message: 'Topic not found' }, 404);
    }
    if (method === 'GET' && p === '/public/site') return this.json(this.siteView(false));
    if (method === 'GET' && p === '/public/languages') return this.json(this.languages);
    const page = p.match(/^\/(public\/)?pages\/([^/]+)$/);
    if (page && method === 'GET' && page[1]) {
      const found = this.pages[page[2]!];
      return found ? this.json(this.pageView(found, false)) : this.json({ message: 'Page not found' }, 404);
    }

    if (!this.signedIn) return this.json({ message: 'Valid session required' }, 401);
    if (method === 'GET' && p === '/me') return this.json({ email: 'me@example.com', role: this.role });
    if (this.role === 'viewer') return this.json({ message: 'Requires editor access' }, 403);

    if (p === '/site' && method === 'GET') return this.json(this.siteView(true));
    if (method === 'PUT' && p === '/site') {
      const s = this.site;
      s.title = this.write(s, 'title', String(body['title']).trim(), s.title);
      s.tagline = this.write(s, 'tagline', String(body['tagline']).trim(), s.tagline);
      if (body['homeRows'] !== undefined) s.homeRows = body['homeRows'] as GridColumns[];
      if (body['font'] !== undefined) {
        const { [this.lang.code]: _, ...others } = s.fonts;
        s.fonts = body['font'] ? { ...others, [this.lang.code]: String(body['font']) } : others;
      }
      s.updatedAt = '2026-10-17T00:00:00Z';
      return this.json(this.siteView(true));
    }
    if (p === '/site/share-image') {
      this.site.shareImage = method === 'PUT' ? `https://img.test/site/${uid()}/share.jpg` : null;
      return this.json(this.siteView(true));
    }
    if (page && !page[1]) {
      const row = this.pages[page[2]!]!;
      if (method === 'PUT') {
        row.body = this.write(row, 'body', String(body['body']), row.body);
        row.updatedAt = '2026-10-17T00:00:00Z';
      }
      return this.json(this.pageView(row, true));
    }
    if (p === '/languages' || p.startsWith('/languages/')) return this.languagesRoute(method, p, body);
    if (p === '/editors' || p.startsWith('/editors/')) return this.editorsRoute(method, p, body);
    if (p === '/activity' && method === 'GET') {
      const days = Number(this.query.get('days'));
      return this.json({ timeZone: 'Asia/Jerusalem', days: this.activity.slice(-days), people: this.activityPeople });
    }
    if (p === '/topics' && method === 'GET') return this.json(this.topics.map((t) => this.view(t, false)));
    if (p === '/topics' && method === 'POST') {
      const t = this.newTopic(String(body['title']).toLowerCase(), String(body['title']), (body['kind'] as TopicKind | undefined) ?? 'pictures', 'draft');
      return this.json(this.detail(t, false), 201);
    }
    if (p === '/topics/order' && method === 'PUT') {
      const ids = body['ids'] as string[];
      this.topics.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      return this.json(this.topics.map((t) => this.view(t, false)));
    }
    const pics = p.match(/^\/topics\/([^/]+)\/pictures(\/order)?$/);
    if (pics) {
      const topicId = pics[1]!;
      if (pics[2]) {
        const ids = body['ids'] as string[];
        const current = this.picturesOf(topicId, false).map((x) => x.id);
        if (ids.length !== current.length || !current.every((id) => ids.includes(id))) {
          return this.json({ message: 'ids must list every picture in the topic exactly once' }, 400);
        }
        this.pictures.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        return this.json(this.picturesOf(topicId, false).map((x) => this.pictureView(x)));
      }
      return this.json([this.pictureView(this.addPicture(topicId, 'draft'))], 201);
    }
    const video = p.match(/^\/topics\/([^/]+)\/(video-upload|video)$/);
    if (video) {
      const t = this.topicRow(video[1]!);
      if (!t) return this.json({ message: 'Topic not found' }, 404);
      if (video[2] === 'video-upload') {
        const path = `videos/${uid()}/video.mp4`;
        this.videoUploads.push({ path, ...body } as { path: string; contentType: string; size: number; origin: string });
        return this.json({ uploadUrl: `https://upload.test/${path}`, path }, 201);
      }
      t.videoFile = method === 'PUT' ? `https://img.test/${String(body['path'])}` : null;
      return this.json(this.detail(t, false));
    }
    const topic = p.match(/^\/topics\/([^/]+)$/);
    if (topic) {
      const t = this.topicRow(topic[1]!);
      if (!t) return this.json({ message: 'Topic not found' }, 404);
      if (method === 'DELETE') {
        this.topics = this.topics.filter((x) => x !== t);
        this.pictures = this.pictures.filter((x) => x.topicId !== t.id);
        return new Response(null, { status: 204 });
      }
      if (method === 'PATCH') {
        const { title, description, body: text, details, buyLabel, ...shared } = body;
        Object.assign(t, shared);
        if (title !== undefined) t.title = this.write(t, 'title', String(title), t.title);
        for (const [field, value] of Object.entries({ description, body: text, details, buyLabel })) {
          if (value !== undefined) t[field as 'body'] = this.write(t, field, value as string | null, t[field as 'body']);
        }
      }
      return this.json(this.detail(t, false));
    }
    const pic = p.match(/^\/pictures\/([^/]+)(\/image)?$/);
    if (pic) {
      const row = this.pictures.find((x) => x.id === pic[1]);
      if (!row) return this.json({ message: 'Picture not found' }, 404);
      if (method === 'DELETE') {
        this.pictures = this.pictures.filter((x) => x !== row);
        return new Response(null, { status: 204 });
      }
      if (pic[2]) row.version += 1;
      else {
        const { caption, dateText, place, story, ...shared } = body;
        Object.assign(row, shared);
        for (const [field, value] of Object.entries({ caption, dateText, place, story })) {
          if (value !== undefined) row[field as 'caption'] = this.write(row, field, value as string | null, row[field as 'caption']);
        }
      }
      return this.json(this.pictureView(row));
    }
    return this.json({ message: 'Not found' }, 404);
  }

  private authRoute(method: string, path: string): Response {
    if (path === 'validate') return this.signedIn ? this.json({ user: { id: 'u1', email: 'me@example.com' } }) : this.json({}, 401);
    if (path === 'google/id-token' && method === 'POST') {
      this.signedIn = true;
      return this.json({ user: { id: 'u1', email: 'me@example.com' } });
    }
    if (path === 'logout') {
      this.signedIn = false;
      return this.json({});
    }
    return this.json({}, 404);
  }

  private languagesRoute(method: string, p: string, body: Record<string, unknown>): Response {
    const code = decodeURIComponent(p.slice('/languages/'.length));
    if (method === 'POST') {
      if (this.languages.some((l) => l.code === body['code'])) return this.json({ message: 'That language is already on the site' }, 409);
      this.languages.push({ ...(body as Pick<Language, 'code' | 'name' | 'direction'>), isDefault: false, labels: {} });
      return this.json(this.languages, 201);
    }
    const lang = this.languages.find((l) => l.code === code);
    if (!lang) return this.json({ message: 'Language not found' }, 404);
    if (method === 'DELETE') {
      if (lang.isDefault) return this.json({ message: 'Choose another default language before removing this one' }, 400);
      this.languages = this.languages.filter((l) => l !== lang);
      return this.json(this.languages);
    }
    const { isDefault, ...rest } = body as Partial<Language>;
    if (isDefault) this.languages = this.languages.map((l) => ({ ...l, isDefault: l.code === code }));
    this.languages = this.languages.map((l) => (l.code === code ? { ...l, ...rest } : l));
    return this.json(this.languages);
  }

  private siteView(admin: boolean): SiteInfo {
    const s = this.site;
    const view = {
      title: this.text(s, 'title', s.title),
      tagline: this.text(s, 'tagline', s.tagline),
      homeRows: s.homeRows,
      shareImage: s.shareImage,
      font: s.fonts[this.lang.code] ?? null,
      updatedAt: s.updatedAt,
    };
    return admin ? { ...view, translations: s.translations, fonts: s.fonts } : view;
  }

  private pageView(row: Page & { translations: Tr }, admin: boolean): Page {
    const view = { slug: row.slug, body: this.text(row, 'body', row.body), updatedAt: row.updatedAt };
    return admin ? { ...view, translations: row.translations } : view;
  }

  private editorsRoute(method: string, p: string, body: Record<string, unknown>): Response {
    if (this.role !== 'owner') return this.json({ message: 'Requires owner access' }, 403);
    if (method === 'PUT' && p === '/editors/owner') {
      const email = String(body['email']);
      this.editors = [
        ...this.editors.filter((e) => e.email !== email),
        { email: this.owner.email, role: 'editor', addedBy: 'me@example.com', createdAt: '2026-10-18T00:00:00Z' },
      ];
      this.owner = { email, role: 'owner', addedBy: 'me@example.com', createdAt: '2026-10-18T00:00:00Z' };
      this.role = 'editor';
    } else if (method === 'POST') {
      this.editors.push({ email: String(body['email']), role: 'editor', addedBy: 'me@example.com', createdAt: '2026-10-16T00:00:00Z' });
    } else if (method === 'DELETE') {
      const email = decodeURIComponent(p.slice('/editors/'.length));
      this.editors = this.editors.filter((e) => e.email !== email);
    }
    return this.json([this.owner, ...this.editors], method === 'POST' ? 201 : 200);
  }

  private topicRow(id: string): TopicRow | undefined {
    return this.topics.find((t) => t.id === id);
  }

  private picturesOf(topicId: string, publishedOnly: boolean): PictureRow[] {
    return this.pictures.filter((x) => x.topicId === topicId && (!publishedOnly || x.status === 'published'));
  }

  private publicTopics(): Topic[] {
    return this.topics
      .filter((t) => t.status === 'published' && (t.kind !== 'pictures' || this.picturesOf(t.id, true).length > 0))
      .map((t) => this.view(t, true));
  }

  private pictureView(x: PictureRow): Picture {
    const position = this.picturesOf(x.topicId, false).indexOf(x);
    const img = `https://img.test/${x.id}/v${x.version}`;
    return {
      ...x,
      caption: this.text(x, 'caption', x.caption),
      dateText: this.text(x, 'dateText', x.dateText),
      place: this.text(x, 'place', x.place),
      story: this.text(x, 'story', x.story),
      position,
      width: 800,
      height: 600,
      images: { display: `${img}/display.jpg`, thumb: `${img}/thumb.jpg` },
    };
  }

  private view(t: TopicRow, publishedOnly: boolean): Topic {
    const pics = this.picturesOf(t.id, publishedOnly);
    const cover = pics.find((x) => x.id === t.coverPictureId) ?? pics[0];
    const { body: _b, details: _d, buyUrl: _u, buyEmbed: _e, buyLabel: _l, videoUrl: _v, videoFile: _f, columns: _c, ...row } = t;
    return {
      ...row,
      title: this.text(t, 'title', t.title),
      description: this.text(t, 'description', t.description),
      position: this.topics.indexOf(t),
      cover: cover ? this.pictureView(cover).images : null,
      pictureCount: pics.length,
    };
  }

  private detail(t: TopicRow, publishedOnly: boolean): TopicDetail {
    return {
      ...this.view(t, publishedOnly),
      pictures: this.picturesOf(t.id, publishedOnly).map((x) => this.pictureView(x)),
      body: this.text(t, 'body', t.body),
      details: this.text(t, 'details', t.details),
      buyUrl: t.buyUrl,
      buyEmbed: t.buyEmbed,
      buyLabel: this.text(t, 'buyLabel', t.buyLabel),
      videoUrl: t.videoUrl,
      videoFile: t.videoFile,
      columns: t.columns,
    };
  }

  private json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }
}
