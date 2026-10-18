import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHarness, EDITOR, type MemoryImageStore, OWNER, sampleImage, UNKNOWN_ID, VIEWER } from './testing/harness.js';

let app: INestApplication;
let store: MemoryImageStore;
let jpeg: Buffer;

const as = (user: { id: string }) => ({ 'x-user-id': user.id });
const http = (): ReturnType<typeof request> => request(app.getHttpServer());

beforeAll(async () => {
  jpeg = await sampleImage('jpeg', 2400, 1600);
});

beforeEach(async () => {
  ({ app, store } = await createHarness());
});

afterEach(async () => {
  await app.close();
});

async function createTopic(title: string, user = EDITOR): Promise<{ id: string; slug: string }> {
  const res = await http().post('/content/topics').set(as(user)).send({ title }).expect(201);
  return res.body as { id: string; slug: string };
}

async function upload(topicId: string, count = 1): Promise<Array<{ id: string }>> {
  let req = http().post(`/content/topics/${topicId}/pictures`).set(as(EDITOR));
  for (let i = 0; i < count; i++) req = req.attach('files', jpeg, `p${i}.jpg`);
  const res = await req.expect(201);
  return res.body as Array<{ id: string }>;
}

describe('public + health', () => {
  it('health is ok and public lists start empty', async () => {
    await http().get('/content/health').expect(200, { status: 'ok' });
    await http().get('/content/public/topics').expect(200, []);
    await http().get('/content/public/topics/nope').expect(404);
  });

  it('shows only published topics with published pictures, in order', async () => {
    await http().post('/content/editors').set(as(OWNER)).send({ email: EDITOR.email }).expect(201);
    const a = await createTopic('Alpha');
    const b = await createTopic('Beta');
    const empty = await createTopic('Empty');
    const [p1, p2] = await upload(a.id, 2);
    await upload(b.id, 1);

    // nothing published yet
    await http().get('/content/public/topics').expect(200, []);

    await http().patch(`/content/topics/${a.id}`).set(as(EDITOR)).send({ status: 'published' }).expect(200);
    await http().patch(`/content/topics/${empty.id}`).set(as(EDITOR)).send({ status: 'published' }).expect(200);
    // published topic but draft pictures → still hidden
    await http().get('/content/public/topics').expect(200, []);
    await http().get(`/content/public/topics/${a.slug}`).expect(404);

    await http().patch(`/content/pictures/${p2!.id}`).set(as(EDITOR)).send({ status: 'published', caption: 'Two' }).expect(200);
    const list = await http().get('/content/public/topics').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ slug: 'alpha', pictureCount: 1, cover: { display: expect.stringContaining('https://img.test/pictures/') } });

    const detail = await http().get('/content/public/topics/alpha').expect(200);
    expect(detail.body.pictures.map((p: { id: string }) => p.id)).toEqual([p2!.id]);
    expect(detail.body.pictures[0].caption).toBe('Two');
    expect(p1).toBeDefined();
  });
});

describe('me + access control', () => {
  it('requires a valid X-User-Id', async () => {
    await http().get('/content/me').expect(401);
    await http().get('/content/me').set('x-user-id', 'not-a-uuid').expect(401);
  });

  it('reports owner / editor / viewer', async () => {
    await http().get('/content/me').set(as(OWNER)).expect(200, { email: OWNER.email, role: 'owner' });
    await http().get('/content/me').set(as(VIEWER)).expect(200, { email: VIEWER.email, role: 'viewer' });
    await http().get('/content/me').set('x-user-id', UNKNOWN_ID).expect(200, { email: '', role: 'viewer' });
    // editor is a viewer until invited
    await http().get('/content/me').set(as(EDITOR)).expect(200, { email: EDITOR.email, role: 'viewer' });
  });

  it('blocks viewers from the back office', async () => {
    await http().get('/content/topics').set(as(VIEWER)).expect(403);
    await http().get('/content/topics').expect(401);
  });
});

describe('editors (owner only)', () => {
  const ownerRow = { email: OWNER.email, role: 'owner', addedBy: null, createdAt: null };

  it('owner invites and removes editors; editors cannot manage editors', async () => {
    await http().get('/content/editors').set(as(VIEWER)).expect(403);
    await http().get('/content/editors').set(as(OWNER)).expect(200, [ownerRow]);
    await http().post('/content/editors').set(as(OWNER)).send({ email: 'bad' }).expect(400);
    await http().post('/content/editors').set(as(OWNER)).send({ email: 'Owner@Example.com' }).expect(400);

    const added = await http().post('/content/editors').set(as(OWNER)).send({ email: 'Editor@Example.COM' }).expect(201);
    expect(added.body).toEqual([ownerRow, expect.objectContaining({ email: EDITOR.email, role: 'editor', addedBy: OWNER.email })]);
    await http().post('/content/editors').set(as(OWNER)).send({ email: EDITOR.email }).expect(201); // idempotent
    expect((await http().get('/content/editors').set(as(OWNER))).body).toHaveLength(2);

    await http().get('/content/me').set(as(EDITOR)).expect(200, { email: EDITOR.email, role: 'editor' });
    await http().get('/content/editors').set(as(EDITOR)).expect(403);
    await http().get('/content/topics').set(as(EDITOR)).expect(200);

    await http().delete('/content/editors/nobody@example.com').set(as(OWNER)).expect(404);
    await http().delete(`/content/editors/${OWNER.email}`).set(as(OWNER)).expect(400);
    await http().delete(`/content/editors/${EDITOR.email}`).set(as(OWNER)).expect(200, [ownerRow]);
    await http().get('/content/topics').set(as(EDITOR)).expect(403);
  });

  it('owner hands ownership to an editor and stays on as an editor', async () => {
    await http().put('/content/editors/owner').set(as(OWNER)).send({ email: 'bad' }).expect(400);
    await http().put('/content/editors/owner').set(as(OWNER)).send({ email: OWNER.email }).expect(400); // already owner
    await http().put('/content/editors/owner').set(as(OWNER)).send({ email: EDITOR.email }).expect(400); // not an editor yet
    await http().post('/content/editors').set(as(OWNER)).send({ email: EDITOR.email }).expect(201);
    await http().put('/content/editors/owner').set(as(EDITOR)).send({ email: EDITOR.email }).expect(403);

    const changed = await http().put('/content/editors/owner').set(as(OWNER)).send({ email: 'Editor@Example.com' }).expect(200);
    expect(changed.body).toEqual([
      { email: EDITOR.email, role: 'owner', addedBy: OWNER.email, createdAt: expect.any(String) },
      expect.objectContaining({ email: OWNER.email, role: 'editor', addedBy: OWNER.email }),
    ]);
    await http().get('/content/me').set(as(EDITOR)).expect(200, { email: EDITOR.email, role: 'owner' });
    await http().get('/content/me').set(as(OWNER)).expect(200, { email: OWNER.email, role: 'editor' });
    await http().get('/content/editors').set(as(OWNER)).expect(403);
    await http().post('/content/editors').set(as(EDITOR)).send({ email: EDITOR.email }).expect(400); // already owner

    // and back again — the previous owner was already an editor, so no duplicate row
    await http().post('/content/editors').set(as(EDITOR)).send({ email: VIEWER.email }).expect(201);
    await http().put('/content/editors/owner').set(as(EDITOR)).send({ email: OWNER.email }).expect(200);
    await http().put('/content/editors/owner').set(as(OWNER)).send({ email: EDITOR.email }).expect(200);
    const list = await http().get('/content/editors').set(as(EDITOR)).expect(200);
    expect(list.body.map((e: { email: string; role: string }) => `${e.role}:${e.email}`)).toEqual([
      `owner:${EDITOR.email}`,
      `editor:${VIEWER.email}`,
      `editor:${OWNER.email}`,
    ]);
  });
});

describe('topics', () => {
  beforeEach(async () => {
    await http().post('/content/editors').set(as(OWNER)).send({ email: EDITOR.email }).expect(201);
  });

  it('creates with unique slugs and validates input', async () => {
    await http().post('/content/topics').set(as(EDITOR)).send({}).expect(400);
    await http().post('/content/topics').set(as(EDITOR)).send({ title: 'x'.repeat(121) }).expect(400);
    await http().post('/content/topics').set(as(EDITOR)).send({ title: 'A', extra: 1 }).expect(400);

    const first = await http()
      .post('/content/topics')
      .set(as(EDITOR))
      .send({ title: '  Café Days ', description: 'Mornings' })
      .expect(201);
    expect(first.body).toMatchObject({ title: 'Café Days', slug: 'cafe-days', status: 'draft', position: 0, cover: null, pictures: [] });
    expect((await createTopic('Café Days')).slug).toBe('cafe-days-2');
    expect((await createTopic('Cafe Days')).slug).toBe('cafe-days-3');
    expect((await createTopic('!!!')).slug).toBe('topic');
    await http().post('/content/topics').set(as(EDITOR)).send({ title: 'Nulls', description: null }).expect(201);

    const all = await http().get('/content/topics').set(as(EDITOR)).expect(200);
    expect(all.body.map((t: { position: number }) => t.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it('gets, updates, reorders and deletes', async () => {
    const a = await createTopic('A');
    const b = await createTopic('B');
    const [pa] = await upload(a.id, 1);
    const [pb] = await upload(b.id, 1);

    await http().get('/content/topics/not-a-uuid').set(as(EDITOR)).expect(400);
    await http().get(`/content/topics/${UNKNOWN_ID}`).set(as(EDITOR)).expect(404);
    const got = await http().get(`/content/topics/${a.id}`).set(as(EDITOR)).expect(200);
    expect(got.body.pictures).toHaveLength(1);

    await http().patch(`/content/topics/${UNKNOWN_ID}`).set(as(EDITOR)).send({ title: 'x' }).expect(404);
    await http().patch(`/content/topics/${a.id}`).set(as(EDITOR)).send({ slug: 'Bad Slug' }).expect(400);
    await http().patch(`/content/topics/${a.id}`).set(as(EDITOR)).send({ slug: 'b' }).expect(409);
    await http().patch(`/content/topics/${a.id}`).set(as(EDITOR)).send({ coverPictureId: pb!.id }).expect(400);
    await http().patch(`/content/topics/${a.id}`).set(as(EDITOR)).send({ status: 'hidden' }).expect(400);

    const updated = await http()
      .patch(`/content/topics/${a.id}`)
      .set(as(EDITOR))
      .send({ title: ' Aa ', slug: 'a', description: null, status: 'published', coverPictureId: pa!.id })
      .expect(200);
    expect(updated.body).toMatchObject({ title: 'Aa', slug: 'a', description: null, status: 'published', coverPictureId: pa!.id });
    const renamed = await http().patch(`/content/topics/${a.id}`).set(as(EDITOR)).send({ slug: 'alpha', coverPictureId: null }).expect(200);
    expect(renamed.body).toMatchObject({ slug: 'alpha', coverPictureId: null });

    await http().put('/content/topics/order').set(as(EDITOR)).send({ ids: [a.id] }).expect(400);
    await http().put('/content/topics/order').set(as(EDITOR)).send({ ids: [a.id, a.id] }).expect(400);
    await http().put('/content/topics/order').set(as(EDITOR)).send({ ids: [a.id, UNKNOWN_ID] }).expect(400);
    await http().put('/content/topics/order').set(as(EDITOR)).send({ ids: ['x'] }).expect(400);
    const ordered = await http().put('/content/topics/order').set(as(EDITOR)).send({ ids: [b.id, a.id] }).expect(200);
    expect(ordered.body.map((t: { id: string }) => t.id)).toEqual([b.id, a.id]);

    const before = store.files.size;
    await http().delete(`/content/topics/${UNKNOWN_ID}`).set(as(EDITOR)).expect(404);
    await http().delete(`/content/topics/${a.id}`).set(as(EDITOR)).expect(204);
    expect(store.files.size).toBe(before - 3);
    await http().get(`/content/topics/${a.id}`).set(as(EDITOR)).expect(404);
  });
});

describe('page kinds (text / book / movie)', () => {
  beforeEach(async () => {
    await http().post('/content/editors').set(as(OWNER)).send({ email: EDITOR.email }).expect(201);
  });

  it('creates a text page that is public once published, even without pictures', async () => {
    await http().post('/content/topics').set(as(EDITOR)).send({ title: 'Bad', kind: 'poem' }).expect(400);
    const created = await http().post('/content/topics').set(as(EDITOR)).send({ title: 'Her life', kind: 'text' }).expect(201);
    expect(created.body).toMatchObject({ kind: 'text', body: null, details: null, buyUrl: null, buyLabel: null });
    const plain = await createTopic('Plain');
    expect((await http().get(`/content/topics/${plain.id}`).set(as(EDITOR)).expect(200)).body.kind).toBe('pictures');

    const id = created.body.id as string;
    await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ body: 'x'.repeat(20001) }).expect(400);
    await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ kind: 'poem' }).expect(400);
    await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ body: '## Early years\n\nBorn in 1926.', status: 'published' }).expect(200);
    await http().patch(`/content/topics/${plain.id}`).set(as(EDITOR)).send({ status: 'published' }).expect(200);

    const list = await http().get('/content/public/topics').expect(200);
    expect(list.body.map((t: { slug: string; kind: string }) => [t.slug, t.kind])).toEqual([['her-life', 'text']]);
    const page = await http().get('/content/public/topics/her-life').expect(200);
    expect(page.body).toMatchObject({ kind: 'text', body: '## Early years\n\nBorn in 1926.', pictures: [] });
    expect(page.body.translations).toBeUndefined();
  });

  it('stores book details and a buy link, translated per language', async () => {
    await http().post('/content/languages').set(as(EDITOR)).send({ code: 'he', name: 'עברית', direction: 'rtl' }).expect(201);
    const book = await http().post('/content/topics').set(as(EDITOR)).send({ title: 'The book', kind: 'book' }).expect(201);
    const id = book.body.id as string;
    await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ buyUrl: 'javascript:alert(1)' }).expect(400);
    await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ buyUrl: 'not a url' }).expect(400);
    await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ buyLabel: 'x'.repeat(61) }).expect(400);
    await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ details: 'x'.repeat(2001) }).expect(400);

    const saved = await http()
      .patch(`/content/topics/${id}`)
      .set(as(EDITOR))
      .send({ body: 'About the book', details: 'Pages: 288\nISBN: 123', buyUrl: 'https://shop.example/book', buyLabel: 'Buy', status: 'published' })
      .expect(200);
    expect(saved.body).toMatchObject({ kind: 'book', details: 'Pages: 288\nISBN: 123', buyUrl: 'https://shop.example/book', buyLabel: 'Buy' });
    await http().patch(`/content/topics/${id}?lang=he`).set(as(EDITOR)).send({ details: 'עמודים: 288', buyLabel: 'לקנייה' }).expect(200);

    const he = await http().get('/content/public/topics/the-book?lang=he').expect(200);
    expect(he.body).toMatchObject({ body: 'About the book', details: 'עמודים: 288', buyLabel: 'לקנייה', buyUrl: 'https://shop.example/book' });

    // switching the default language carries the book fields along
    await http().patch('/content/languages/he').set(as(EDITOR)).send({ isDefault: true }).expect(200);
    const en = await http().get('/content/public/topics/the-book?lang=en').expect(200);
    expect(en.body).toMatchObject({ details: 'Pages: 288\nISBN: 123', buyLabel: 'Buy' });

    const cleared = await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ buyUrl: null, kind: 'pictures' }).expect(200);
    expect(cleared.body).toMatchObject({ kind: 'pictures', buyUrl: null });
    await http().get('/content/public/topics/the-book').expect(404); // a picture set with no pictures
  });

  it('stores a movie’s YouTube link and optional description', async () => {
    const movie = await http().post('/content/topics').set(as(EDITOR)).send({ title: 'Home movie', kind: 'movie' }).expect(201);
    const id = movie.body.id as string;
    expect(movie.body).toMatchObject({ kind: 'movie', videoUrl: null, cover: null });
    for (const bad of ['https://vimeo.com/123456', 'http://youtu.be/dQw4w9WgXcQ', 'https://youtube.com/', 'https://evil.example/?https://youtu.be/dQw4w9WgXcQ']) {
      await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ videoUrl: bad }).expect(400);
    }
    for (const good of [
      'https://youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ videoUrl: good }).expect(200);
    }
    await http()
      .patch(`/content/topics/${id}`)
      .set(as(EDITOR))
      .send({ videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', body: 'Summer 1974, Haifa.', status: 'published' })
      .expect(200);
    const [listed] = (await http().get('/content/public/topics').expect(200)).body as Array<{ cover: unknown }>;
    expect(listed!.cover).toEqual({
      display: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      thumb: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    });
    const page = await http().get('/content/public/topics/home-movie').expect(200);
    expect(page.body).toMatchObject({ kind: 'movie', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', body: 'Summer 1974, Haifa.' });
    const cleared = await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ videoUrl: null }).expect(200);
    expect(cleared.body).toMatchObject({ videoUrl: null, cover: null });
    // a text page with a link left over shows no video cover
    await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ', kind: 'text' }).expect(200);
    expect((await http().get('/content/public/topics').expect(200)).body[0].cover).toBeNull();
  });

  it('stores how many pictures a picture set shows per row (1–3, default 3)', async () => {
    const set = await http().post('/content/topics').set(as(EDITOR)).send({ title: 'Rows' }).expect(201);
    const id = set.body.id as string;
    expect(set.body).toMatchObject({ columns: 3 });
    for (const bad of [0, 4, 2.5, '2', null]) {
      await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ columns: bad }).expect(400);
    }
    const two = await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ columns: 2 }).expect(200);
    expect(two.body).toMatchObject({ columns: 2 });
    const one = await http().patch(`/content/topics/${id}`).set(as(EDITOR)).send({ title: 'Rows again' }).expect(200);
    expect(one.body).toMatchObject({ columns: 2 });
  });
});

describe('pictures', () => {
  let topic: { id: string };

  beforeEach(async () => {
    await http().post('/content/editors').set(as(OWNER)).send({ email: EDITOR.email }).expect(201);
    topic = await createTopic('Pics');
  });

  it('uploads and stores three resized, re-encoded derivatives', async () => {
    await http().post(`/content/topics/${topic.id}/pictures`).set(as(EDITOR)).expect(400);
    await http().post(`/content/topics/${UNKNOWN_ID}/pictures`).set(as(EDITOR)).attach('files', jpeg, 'a.jpg').expect(404);
    const gif = await sampleImage('gif');
    await http().post(`/content/topics/${topic.id}/pictures`).set(as(EDITOR)).attach('files', gif, 'a.gif').expect(400);
    await http()
      .post(`/content/topics/${topic.id}/pictures`)
      .set(as(EDITOR))
      .attach('files', Buffer.from('not an image'), 'a.jpg')
      .expect(400);

    const png = await sampleImage('png', 300, 200);
    const res = await http()
      .post(`/content/topics/${topic.id}/pictures`)
      .set(as(EDITOR))
      .attach('files', jpeg, 'a.jpg')
      .attach('files', png, 'b.png')
      .expect(201);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ status: 'draft', position: 0, width: 2000, height: 1333 });
    expect(res.body[1]).toMatchObject({ position: 1, width: 300, height: 200 });
    expect(store.files.size).toBe(6);
    expect([...store.files.keys()].every((k) => /^pictures\/[0-9a-f-]{36}\/(original|display|thumb)\.jpg$/.test(k))).toBe(true);
  });

  it('edits fields, moves, replaces, reorders and deletes', async () => {
    const other = await createTopic('Other');
    const [p1, p2, p3] = await upload(topic.id, 3);

    await http().patch(`/content/pictures/${UNKNOWN_ID}`).set(as(EDITOR)).send({ caption: 'x' }).expect(404);
    await http().patch(`/content/pictures/${p1!.id}`).set(as(EDITOR)).send({ caption: 'x'.repeat(301) }).expect(400);
    const edited = await http()
      .patch(`/content/pictures/${p1!.id}`)
      .set(as(EDITOR))
      .send({ caption: 'Cap', dateText: 'Summer 1974', place: 'Haifa', story: 'Long story', status: 'published' })
      .expect(200);
    expect(edited.body).toMatchObject({ caption: 'Cap', dateText: 'Summer 1974', place: 'Haifa', story: 'Long story', status: 'published' });
    const cleared = await http().patch(`/content/pictures/${p1!.id}`).set(as(EDITOR)).send({ caption: null, topicId: topic.id }).expect(200);
    expect(cleared.body.caption).toBeNull();

    // moving clears the cover on the old topic and appends to the new one
    await http().patch(`/content/topics/${topic.id}`).set(as(EDITOR)).send({ coverPictureId: p3!.id }).expect(200);
    await http().patch(`/content/pictures/${p3!.id}`).set(as(EDITOR)).send({ topicId: UNKNOWN_ID }).expect(404);
    const moved = await http().patch(`/content/pictures/${p3!.id}`).set(as(EDITOR)).send({ topicId: other.id }).expect(200);
    expect(moved.body).toMatchObject({ topicId: other.id, position: 0 });
    expect((await http().get(`/content/topics/${topic.id}`).set(as(EDITOR))).body.coverPictureId).toBeNull();

    await http().put(`/content/pictures/${p1!.id}/image`).set(as(EDITOR)).expect(400);
    await http().put(`/content/pictures/${UNKNOWN_ID}/image`).set(as(EDITOR)).attach('file', jpeg, 'x.jpg').expect(404);
    const small = await sampleImage('webp', 400, 400);
    const replaced = await http().put(`/content/pictures/${p1!.id}/image`).set(as(EDITOR)).attach('file', small, 'x.webp').expect(200);
    expect(replaced.body).toMatchObject({ width: 400, height: 400, caption: null, dateText: 'Summer 1974' });
    expect(replaced.body.images.display).not.toBe(edited.body.images.display);

    await http().put(`/content/topics/${topic.id}/pictures/order`).set(as(EDITOR)).send({ ids: [p1!.id] }).expect(400);
    await http().put(`/content/topics/${topic.id}/pictures/order`).set(as(EDITOR)).send({ ids: [p1!.id, p1!.id] }).expect(400);
    await http().put(`/content/topics/${topic.id}/pictures/order`).set(as(EDITOR)).send({ ids: [p1!.id, p3!.id] }).expect(400);
    const ordered = await http().put(`/content/topics/${topic.id}/pictures/order`).set(as(EDITOR)).send({ ids: [p2!.id, p1!.id] }).expect(200);
    expect(ordered.body.map((p: { id: string }) => p.id)).toEqual([p2!.id, p1!.id]);

    await http().delete(`/content/pictures/${UNKNOWN_ID}`).set(as(EDITOR)).expect(404);
    await http().delete(`/content/pictures/${p2!.id}`).set(as(EDITOR)).expect(204);
    const after = await http().get(`/content/topics/${topic.id}`).set(as(EDITOR)).expect(200);
    expect(after.body.pictures.map((p: { id: string }) => p.id)).toEqual([p1!.id]);
  });
});

describe('pages (About / Contact)', () => {
  it('serves default text until an editor saves, then the saved text', async () => {
    const about = await http().get('/content/public/pages/about').expect(200);
    expect(about.body).toMatchObject({ slug: 'about', updatedAt: null, body: expect.stringContaining('life worth remembering') });
    expect(about.headers['cache-control']).toBe('public, max-age=30');
    await http().get('/content/public/pages/contact').expect(200);
    await http().get('/content/public/pages/nope').expect(404);

    await http().post('/content/editors').set(as(OWNER)).send({ email: EDITOR.email }).expect(201);
    const saved = await http().put('/content/pages/contact').set(as(EDITOR)).send({ body: 'Write to us.\n\nfamily@example.com' }).expect(200);
    expect(saved.body).toMatchObject({ slug: 'contact', body: 'Write to us.\n\nfamily@example.com', updatedAt: expect.any(String) });
    await http().put('/content/pages/contact').set(as(OWNER)).send({ body: 'Updated.' }).expect(200);
    await http().get('/content/public/pages/contact').expect(200).expect((res) => expect(res.body.body).toBe('Updated.'));
  });

  it('requires an editor, a known page and valid text', async () => {
    await http().put('/content/pages/about').send({ body: 'x' }).expect(401);
    await http().put('/content/pages/about').set(as(VIEWER)).send({ body: 'x' }).expect(403);
    await http().put('/content/pages/nope').set(as(OWNER)).send({ body: 'x' }).expect(404);
    await http().put('/content/pages/about').set(as(OWNER)).send({ body: '' }).expect(400);
    await http().put('/content/pages/about').set(as(OWNER)).send({ body: 'x'.repeat(10001) }).expect(400);
    await http().put('/content/pages/about').set(as(OWNER)).send({}).expect(400);
  });
});

describe('site title', () => {
  it('serves the defaults until an editor saves, then the trimmed saved values', async () => {
    const res = await http().get('/content/public/site').expect(200);
    expect(res.body).toEqual({ title: 'Memory', tagline: 'a life in photographs', updatedAt: null });
    expect(res.headers['cache-control']).toBe('public, max-age=30');

    await http().post('/content/editors').set(as(OWNER)).send({ email: EDITOR.email }).expect(201);
    const saved = await http().put('/content/site').set(as(EDITOR)).send({ title: '  Grandpa Lavi ', tagline: ' ' }).expect(200);
    expect(saved.body).toEqual({
      title: 'Grandpa Lavi',
      tagline: '',
      updatedAt: expect.any(String),
      translations: { en: { title: 'Grandpa Lavi', tagline: '' } },
    });
    await http().put('/content/site').set(as(OWNER)).send({ title: 'Lavi', tagline: '1940–2025' }).expect(200);
    await http().get('/content/public/site').expect(200).expect((r) => expect(r.body).toMatchObject({ title: 'Lavi', tagline: '1940–2025' }));
  });

  it('requires an editor and a valid title and tagline', async () => {
    await http().put('/content/site').send({ title: 'x', tagline: '' }).expect(401);
    await http().put('/content/site').set(as(VIEWER)).send({ title: 'x', tagline: '' }).expect(403);
    await http().put('/content/site').set(as(OWNER)).send({ title: '   ', tagline: '' }).expect(400);
    await http().put('/content/site').set(as(OWNER)).send({ title: 'x'.repeat(61), tagline: '' }).expect(400);
    await http().put('/content/site').set(as(OWNER)).send({ title: 'x', tagline: 'y'.repeat(121) }).expect(400);
    await http().put('/content/site').set(as(OWNER)).send({ title: 'x' }).expect(400);
  });
});
