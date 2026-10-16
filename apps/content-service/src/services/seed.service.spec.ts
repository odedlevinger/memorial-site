import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { TopicEntity } from '../entities/topic.entity.js';
import { createHarness, sampleImage } from '../testing/harness.js';
import { PicturesService } from './pictures.service.js';
import { type Fetcher, SeedService } from './seed.service.js';
import { TopicsService } from './topics.service.js';

let app: INestApplication;
let jpeg: Buffer;

beforeAll(async () => {
  jpeg = await sampleImage('jpeg', 400, 300);
});
beforeEach(async () => {
  ({ app } = await createHarness());
});
afterEach(async () => {
  await app.close();
});

function seeder(source: string | undefined, fetcher: Fetcher): SeedService {
  return new SeedService(
    new ConfigService(source === undefined ? {} : { SEED_SOURCE_URL: source }),
    app.get<Repository<TopicEntity>>(getRepositoryToken(TopicEntity)),
    app.get(TopicsService),
    app.get(PicturesService),
    fetcher,
  );
}

const manifest = [
  { slug: 'streets', title: 'Streets', images: ['streets-1.jpg', 'missing.jpg'] },
  { slug: 'none', title: 'Nothing', images: ['missing.jpg'] },
  { slug: 'bad', title: 1, images: [] },
  null,
];

const site: Fetcher = async (url) => {
  if (url === 'https://web.test/gallery/galleries.json') return new Response(JSON.stringify(manifest));
  if (url.endsWith('/streets-1.jpg')) return new Response(new Uint8Array(jpeg));
  return new Response('nope', { status: 404 });
};

describe('SeedService', () => {
  it('imports placeholder galleries as published content, once', async () => {
    const svc = seeder('https://web.test/', site);
    expect(await svc.importPlaceholders()).toBe(1);

    const topics = app.get(TopicsService);
    const published = await topics.listPublished();
    expect(published.map((t) => t.title)).toEqual(['Streets']);
    expect((await topics.listAll()).map((t) => [t.title, t.status])).toEqual([
      ['Streets', 'published'],
      ['Nothing', 'published'],
    ]);

    expect(await svc.importPlaceholders()).toBe(0); // already seeded
  });

  it('skips without a source URL', async () => {
    const fetcher = jest.fn<ReturnType<Fetcher>, Parameters<Fetcher>>();
    expect(await seeder(undefined, fetcher).importPlaceholders()).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('ignores a non-array manifest', async () => {
    const svc = seeder('https://web.test', async () => new Response(JSON.stringify({ title: 'x' })));
    expect(await svc.importPlaceholders()).toBe(0);
  });

  it('logs instead of crashing startup when the manifest is unavailable', async () => {
    const svc = seeder('https://web.test', async () => new Response('down', { status: 503 }));
    await expect(svc.importPlaceholders()).rejects.toThrow('manifest HTTP 503');
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('defaults to global fetch', () => {
    const svc = new SeedService(new ConfigService({}), {} as Repository<TopicEntity>, {} as TopicsService, {} as PicturesService);
    expect((svc as unknown as { fetcher: unknown }).fetcher).toBe(fetch);
  });
});
