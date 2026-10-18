import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MAX_LABELS } from './dto/content.dto.js';
import { createHarness, EDITOR, OWNER, sampleImage, VIEWER } from './testing/harness.js';

let app: INestApplication;
let jpeg: Buffer;

const as = (user: { id: string }) => ({ 'x-user-id': user.id });
const http = (): ReturnType<typeof request> => request(app.getHttpServer());

beforeAll(async () => {
  jpeg = await sampleImage('jpeg', 400, 300);
});

beforeEach(async () => {
  ({ app } = await createHarness());
  await http().post('/content/editors').set(as(OWNER)).send({ email: EDITOR.email }).expect(201);
});

afterEach(async () => {
  await app.close();
});

const codes = (body: Array<{ code: string; isDefault: boolean }>): string[] => body.map((l) => (l.isDefault ? `${l.code}*` : l.code));
const addHebrew = () => http().post('/content/languages').set(as(EDITOR)).send({ code: 'he', name: 'עברית', direction: 'rtl' }).expect(201);
const makeDefault = (code: string) => http().patch(`/content/languages/${code}`).set(as(EDITOR)).send({ isDefault: true }).expect(200);

describe('languages', () => {
  it('starts as English only, and editors add, edit and remove languages', async () => {
    const start = await http().get('/content/public/languages').expect(200);
    expect(start.body).toEqual([{ code: 'en', name: 'English', direction: 'ltr', isDefault: true, labels: {} }]);
    expect(start.headers['cache-control']).toBe('public, max-age=30');

    const added = await http().post('/content/languages').set(as(EDITOR)).send({ code: 'he', name: ' עברית ', direction: 'rtl' }).expect(201);
    expect(added.body).toEqual([
      { code: 'en', name: 'English', direction: 'ltr', isDefault: true, labels: {} },
      { code: 'he', name: 'עברית', direction: 'rtl', isDefault: false, labels: {} },
    ]);
    await http().post('/content/languages').set(as(EDITOR)).send({ code: 'he', name: 'Hebrew', direction: 'rtl' }).expect(409);
    const third = await http().post('/content/languages').set(as(OWNER)).send({ code: 'pt-br', name: 'Português', direction: 'ltr' }).expect(201);
    expect(codes(third.body)).toEqual(['en*', 'he', 'pt-br']);

    const edited = await http()
      .patch('/content/languages/he')
      .set(as(EDITOR))
      .send({ name: 'Hebrew', direction: 'ltr', labels: { 'nav.about': 'אודות', 'nav.contact': '  ' } })
      .expect(200);
    expect(edited.body[1]).toEqual({ code: 'he', name: 'Hebrew', direction: 'ltr', isDefault: false, labels: { 'nav.about': 'אודות' } });
    expect(codes((await makeDefault('en')).body)).toEqual(['en*', 'he', 'pt-br']); // already the default

    await http().delete('/content/languages/xx').set(as(EDITOR)).expect(404);
    await http().delete('/content/languages/en').set(as(EDITOR)).expect(400);
    expect(codes((await http().delete('/content/languages/pt-br').set(as(EDITOR)).expect(200)).body)).toEqual(['en*', 'he']);
  });

  it('stores the built-in language the first time the list is edited or trimmed', async () => {
    const renamed = await http().patch('/content/languages/en').set(as(EDITOR)).send({ name: 'English (UK)' }).expect(200);
    expect(renamed.body).toEqual([{ code: 'en', name: 'English (UK)', direction: 'ltr', isDefault: true, labels: {} }]);
  });

  it('refuses unknown languages to delete on an untouched list', async () => {
    await http().delete('/content/languages/he').set(as(EDITOR)).expect(404);
    await http().patch('/content/languages/he').set(as(EDITOR)).send({ name: 'x' }).expect(404);
  });

  it('requires an editor and valid input', async () => {
    const he = { code: 'he', name: 'Hebrew', direction: 'rtl' };
    await http().post('/content/languages').send(he).expect(401);
    await http().post('/content/languages').set(as(VIEWER)).send(he).expect(403);
    await http().patch('/content/languages/en').set(as(VIEWER)).send({ name: 'x' }).expect(403);
    await http().delete('/content/languages/en').set(as(VIEWER)).expect(403);

    for (const bad of [{ ...he, code: 'HE' }, { ...he, code: 'hebrew' }, { ...he, name: '  ' }, { ...he, name: 'x'.repeat(41) }, { ...he, direction: 'up' }, { code: 'he' }]) {
      await http().post('/content/languages').set(as(EDITOR)).send(bad).expect(400);
    }
    const tooMany = Object.fromEntries(Array.from({ length: MAX_LABELS + 1 }, (_, i) => [`k${i}`, 'x']));
    for (const labels of [null, ['x'], 'x', { 'bad key': 'x' }, { ok: 1 }, { ok: 'x'.repeat(501) }, tooMany]) {
      await http().patch('/content/languages/en').set(as(EDITOR)).send({ labels }).expect(400);
    }
    await http().patch('/content/languages/en').set(as(EDITOR)).send({ name: null }).expect(400);
    await http().patch('/content/languages/en').set(as(EDITOR)).send({ isDefault: false }).expect(400);
    await http().patch('/content/languages/en').set(as(EDITOR)).send({ direction: 'up' }).expect(400);
  });
});

describe('translated content', () => {
  async function publishedTopic(): Promise<{ topicId: string; pictureId: string }> {
    const topic = await http().post('/content/topics').set(as(EDITOR)).send({ title: 'Streets' }).expect(201);
    const pics = await http().post(`/content/topics/${topic.body.id}/pictures`).set(as(EDITOR)).attach('files', jpeg, 'a.jpg').expect(201);
    await http().patch(`/content/topics/${topic.body.id}`).set(as(EDITOR)).send({ status: 'published' }).expect(200);
    await http().patch(`/content/pictures/${pics.body[0].id}`).set(as(EDITOR)).send({ status: 'published', caption: 'A street' }).expect(200);
    return { topicId: topic.body.id as string, pictureId: pics.body[0].id as string };
  }

  const publicTopic = async (lang?: string): Promise<{ title: string; description: string | null; pictures: Array<Record<string, unknown>> }> =>
    (await http().get(`/content/public/topics/streets${lang ? `?lang=${lang}` : ''}`).expect(200)).body;

  it('serves topics and pictures in the requested language, falling back to the default', async () => {
    const { topicId, pictureId } = await publishedTopic();
    await addHebrew();

    await http().patch(`/content/topics/${topicId}?lang=xx`).set(as(EDITOR)).send({ title: 'x' }).expect(400);
    await http().get(`/content/topics?lang=xx`).set(as(EDITOR)).expect(400);
    const topic = await http().patch(`/content/topics/${topicId}?lang=he`).set(as(EDITOR)).send({ title: 'רחובות', description: 'תיאור' }).expect(200);
    expect(topic.body).toMatchObject({ title: 'רחובות', description: 'תיאור', translations: { he: { title: 'רחובות', description: 'תיאור' } } });

    const list = await http().get('/content/public/topics?lang=he').expect(200);
    expect(list.body[0]).toMatchObject({ title: 'רחובות', slug: 'streets' });
    expect(list.body[0].translations).toBeUndefined();
    expect(await publicTopic('he')).toMatchObject({ title: 'רחובות', description: 'תיאור' });
    expect(await publicTopic('en')).toMatchObject({ title: 'Streets', description: null });
    expect(await publicTopic('zz')).toMatchObject({ title: 'Streets' });
    expect(await publicTopic()).toMatchObject({ title: 'Streets' });

    const pic = await http().patch(`/content/pictures/${pictureId}?lang=he`).set(as(EDITOR)).send({ caption: 'רחוב', place: 'חיפה' }).expect(200);
    expect(pic.body).toMatchObject({ caption: 'רחוב', place: 'חיפה', translations: { en: { caption: 'A street' }, he: { caption: 'רחוב', place: 'חיפה' } } });
    expect((await publicTopic('he')).pictures[0]).toMatchObject({ caption: 'רחוב', place: 'חיפה', dateText: null });
    expect((await publicTopic('en')).pictures[0]).toMatchObject({ caption: 'A street', place: null });

    // clearing a translation falls back to the default language again
    await http().patch(`/content/pictures/${pictureId}?lang=he`).set(as(EDITOR)).send({ caption: null }).expect(200);
    expect((await publicTopic('he')).pictures[0]).toMatchObject({ caption: 'A street', place: 'חיפה' });
    const none = await http().patch(`/content/pictures/${pictureId}?lang=he`).set(as(EDITOR)).send({ place: '' }).expect(200);
    expect(none.body.translations).toEqual({ en: { caption: 'A street' } });

    // back office reads carry every language's text
    const admin = await http().get(`/content/topics/${topicId}?lang=he`).set(as(EDITOR)).expect(200);
    expect(admin.body).toMatchObject({ title: 'רחובות', translations: { he: { title: 'רחובות' } }, pictures: [{ translations: { en: { caption: 'A street' } } }] });
    const all = await http().get('/content/topics').set(as(EDITOR)).expect(200);
    expect(all.body[0]).toMatchObject({ title: 'Streets', translations: { he: { title: 'רחובות' } } });

    // required text may be empty only in another language, meaning "use the default"
    await http().patch(`/content/topics/${topicId}`).set(as(EDITOR)).send({ title: '  ' }).expect(400);
    const untitled = await http().patch(`/content/topics/${topicId}?lang=he`).set(as(EDITOR)).send({ title: ' ' }).expect(200);
    expect(untitled.body).toMatchObject({ title: 'Streets', translations: { he: { description: 'תיאור' } } });
  });

  it('serves pages and the site title per language', async () => {
    await addHebrew();
    expect((await http().get('/content/pages/about').set(as(EDITOR)).expect(200)).body).toMatchObject({ updatedAt: null, translations: {} });
    expect((await http().get('/content/site').set(as(EDITOR)).expect(200)).body).toEqual({ title: 'Memory', tagline: 'a life in photographs', homeColumns: 3, updatedAt: null, translations: {} });
    await http().get('/content/site').set(as(VIEWER)).expect(403);
    await http().get('/content/pages/about').set(as(VIEWER)).expect(403);

    await http().put('/content/pages/about?lang=xx').set(as(EDITOR)).send({ body: 'x' }).expect(400);
    const page = await http().put('/content/pages/about?lang=he').set(as(EDITOR)).send({ body: 'על האתר' }).expect(200);
    expect(page.body).toMatchObject({ body: 'על האתר', translations: { he: { body: 'על האתר' } } });
    expect((await http().get('/content/public/pages/about?lang=he').expect(200)).body.body).toBe('על האתר');
    expect((await http().get('/content/public/pages/about').expect(200)).body.body).toContain('life worth remembering');
    await http().put('/content/pages/about').set(as(EDITOR)).send({ body: ' \n ' }).expect(400);
    const cleared = await http().put('/content/pages/about?lang=he').set(as(EDITOR)).send({ body: '' }).expect(200);
    expect(cleared.body).toMatchObject({ body: expect.stringContaining('life worth remembering'), translations: {} });

    await http().put('/content/site?lang=xx').set(as(EDITOR)).send({ title: 'x', tagline: '' }).expect(400);
    const site = await http().put('/content/site?lang=he').set(as(EDITOR)).send({ title: ' זיכרון ', tagline: '' }).expect(200);
    expect(site.body).toMatchObject({ title: 'זיכרון', tagline: 'a life in photographs', translations: { he: { title: 'זיכרון' } } });
    expect((await http().get('/content/public/site?lang=he').expect(200)).body).toMatchObject({ title: 'זיכרון', tagline: 'a life in photographs' });
    expect((await http().get('/content/public/site').expect(200)).body).toMatchObject({ title: 'Memory' });
    expect((await http().get('/content/site').set(as(EDITOR)).expect(200)).body.translations).toEqual({ he: { title: 'זיכרון' } });
    expect((await http().put('/content/site?lang=he').set(as(EDITOR)).send({ title: '', tagline: '' }).expect(200)).body.title).toBe('Memory');
  });

  it('switching the default language keeps every language’s text', async () => {
    const { topicId, pictureId } = await publishedTopic();
    await http().post('/content/topics').set(as(EDITOR)).send({ title: 'Untouched' }).expect(201);
    await addHebrew();
    await http().patch(`/content/topics/${topicId}?lang=he`).set(as(EDITOR)).send({ title: 'רחובות' }).expect(200);
    await http().put('/content/site?lang=he').set(as(EDITOR)).send({ title: 'זיכרון', tagline: '' }).expect(200);
    await http().put('/content/pages/contact').set(as(EDITOR)).send({ body: 'Write to us.' }).expect(200);

    expect(codes((await makeDefault('he')).body)).toEqual(['en', 'he*']);
    expect(await publicTopic()).toMatchObject({ title: 'רחובות', pictures: [{ caption: 'A street' }] });
    expect(await publicTopic('en')).toMatchObject({ title: 'Streets', pictures: [{ caption: 'A street' }] });
    expect((await http().get('/content/public/site').expect(200)).body).toMatchObject({ title: 'זיכרון', tagline: 'a life in photographs' });
    expect((await http().get('/content/public/site?lang=en').expect(200)).body).toMatchObject({ title: 'Memory' });
    expect((await http().get('/content/public/pages/contact').expect(200)).body.body).toBe('Write to us.');
    await http().delete('/content/languages/he').set(as(EDITOR)).expect(400);

    // cleared text in the new default stays cleared across further switches
    await http().patch(`/content/pictures/${pictureId}`).set(as(EDITOR)).send({ caption: null }).expect(200);
    await http().put('/content/site').set(as(EDITOR)).send({ title: 'זיכרון', tagline: '' }).expect(200);
    expect(await publicTopic()).toMatchObject({ pictures: [{ caption: null }] });
    await makeDefault('en');
    expect(await publicTopic()).toMatchObject({ title: 'Streets', pictures: [{ caption: 'A street' }] });
    expect((await http().get('/content/public/site').expect(200)).body).toMatchObject({ title: 'Memory', tagline: 'a life in photographs' });
    await makeDefault('he');
    expect(await publicTopic()).toMatchObject({ title: 'רחובות', pictures: [{ caption: null }] });
    expect((await http().get('/content/public/site').expect(200)).body).toMatchObject({ title: 'זיכרון', tagline: '' });

    await makeDefault('en');
    await http().delete('/content/languages/he').set(as(EDITOR)).expect(200);
    expect(await publicTopic('he')).toMatchObject({ title: 'Streets' });
  });
});
