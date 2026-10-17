// Test-only in-memory stand-in for /api/content and /api/auth (excluded from coverage).
import type { ContentStatus, Editor, Page, Picture, Role, SiteInfo, Topic, TopicDetail } from '../content';

interface TopicRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: ContentStatus;
  coverPictureId: string | null;
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
}

let seq = 0;
const uid = (): string => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export class FakeServer {
  role: Role = 'owner';
  signedIn = true;
  topics: TopicRow[] = [];
  pictures: PictureRow[] = [];
  editors: Editor[] = [];
  site: SiteInfo = { title: 'Memory', tagline: 'a life in photographs', updatedAt: null };
  pages: Record<string, Page> = {
    about: { slug: 'about', body: 'About this site.', updatedAt: null },
    contact: { slug: 'contact', body: 'Get in touch.', updatedAt: null },
  };
  readonly calls: string[] = [];
  private failures: Array<{ match: RegExp; status: number; body: unknown }> = [];

  /** Make the next request whose "METHOD path" matches fail with `status`. */
  failNext(match: RegExp, status = 500, body: unknown = { message: 'Server error' }): void {
    this.failures.push({ match, status, body });
  }

  addTopic(title: string, status: ContentStatus = 'published', pictureCount = 2): TopicRow {
    const t: TopicRow = { id: uid(), slug: title.toLowerCase().replace(/\s+/g, '-'), title, description: null, status, coverPictureId: null };
    this.topics.push(t);
    for (let i = 0; i < pictureCount; i++) this.addPicture(t.id, status);
    return t;
  }

  addPicture(topicId: string, status: ContentStatus = 'published', caption: string | null = null): PictureRow {
    const p: PictureRow = { id: uid(), topicId, caption, dateText: null, place: null, story: null, status, version: 1 };
    this.pictures.push(p);
    return p;
  }

  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input), 'http://site.test');
    const method = (init.method ?? 'GET').toUpperCase();
    const key = `${method} ${url.pathname}`;
    this.calls.push(key);
    const failure = this.failures.findIndex((f) => f.match.test(key));
    if (failure >= 0) {
      const [f] = this.failures.splice(failure, 1);
      return this.json(f!.body, f!.status);
    }
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    return this.route(method, url.pathname, body);
  };

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
    if (method === 'GET' && p === '/public/site') return this.json(this.site);
    const page = p.match(/^\/(public\/)?pages\/([^/]+)$/);
    if (page && method === 'GET' && page[1]) {
      const found = this.pages[page[2]!];
      return found ? this.json(found) : this.json({ message: 'Page not found' }, 404);
    }

    if (!this.signedIn) return this.json({ message: 'Valid session required' }, 401);
    if (method === 'GET' && p === '/me') return this.json({ email: 'me@example.com', role: this.role });
    if (this.role === 'viewer') return this.json({ message: 'Requires editor access' }, 403);

    if (method === 'PUT' && p === '/site') {
      this.site = { title: String(body['title']).trim(), tagline: String(body['tagline']).trim(), updatedAt: '2026-10-17T00:00:00Z' };
      return this.json(this.site);
    }
    if (page && method === 'PUT' && !page[1]) {
      const saved: Page = { slug: page[2] as Page['slug'], body: String(body['body']), updatedAt: '2026-10-17T00:00:00Z' };
      this.pages[page[2]!] = saved;
      return this.json(saved);
    }
    if (p === '/editors' || p.startsWith('/editors/')) return this.editorsRoute(method, p, body);
    if (p === '/topics' && method === 'GET') return this.json(this.topics.map((t) => this.view(t, false)));
    if (p === '/topics' && method === 'POST') {
      const t: TopicRow = { id: uid(), slug: String(body['title']).toLowerCase(), title: String(body['title']), description: null, status: 'draft', coverPictureId: null };
      this.topics.push(t);
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
    const topic = p.match(/^\/topics\/([^/]+)$/);
    if (topic) {
      const t = this.topicRow(topic[1]!);
      if (!t) return this.json({ message: 'Topic not found' }, 404);
      if (method === 'DELETE') {
        this.topics = this.topics.filter((x) => x !== t);
        this.pictures = this.pictures.filter((x) => x.topicId !== t.id);
        return new Response(null, { status: 204 });
      }
      if (method === 'PATCH') Object.assign(t, body);
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
      else Object.assign(row, body);
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

  private editorsRoute(method: string, p: string, body: Record<string, unknown>): Response {
    if (this.role !== 'owner') return this.json({ message: 'Requires owner access' }, 403);
    if (method === 'POST') this.editors.push({ email: String(body['email']), addedBy: 'me@example.com', createdAt: '2026-10-16T00:00:00Z' });
    if (method === 'DELETE') {
      const email = decodeURIComponent(p.slice('/editors/'.length));
      this.editors = this.editors.filter((e) => e.email !== email);
    }
    return this.json(this.editors, method === 'POST' ? 201 : 200);
  }

  private topicRow(id: string): TopicRow | undefined {
    return this.topics.find((t) => t.id === id);
  }

  private picturesOf(topicId: string, publishedOnly: boolean): PictureRow[] {
    return this.pictures.filter((x) => x.topicId === topicId && (!publishedOnly || x.status === 'published'));
  }

  private publicTopics(): Topic[] {
    return this.topics.filter((t) => t.status === 'published' && this.picturesOf(t.id, true).length > 0).map((t) => this.view(t, true));
  }

  private pictureView(x: PictureRow): Picture {
    const position = this.picturesOf(x.topicId, false).indexOf(x);
    const img = `https://img.test/${x.id}/v${x.version}`;
    return { ...x, position, width: 800, height: 600, images: { display: `${img}/display.jpg`, thumb: `${img}/thumb.jpg` } };
  }

  private view(t: TopicRow, publishedOnly: boolean): Topic {
    const pics = this.picturesOf(t.id, publishedOnly);
    const cover = pics.find((x) => x.id === t.coverPictureId) ?? pics[0];
    return {
      ...t,
      position: this.topics.indexOf(t),
      cover: cover ? this.pictureView(cover).images : null,
      pictureCount: pics.length,
    };
  }

  private detail(t: TopicRow, publishedOnly: boolean): TopicDetail {
    return { ...this.view(t, publishedOnly), pictures: this.picturesOf(t.id, publishedOnly).map((x) => this.pictureView(x)) };
  }

  private json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }
}
