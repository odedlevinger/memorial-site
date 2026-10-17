import { Inject, Injectable, Logger, Optional, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { TopicEntity } from '../entities/topic.entity.js';
import type { Caller, LangContext } from '../interfaces/content.interfaces.js';
import { PicturesService } from './pictures.service.js';
import { TopicsService } from './topics.service.js';

interface ManifestEntry {
  readonly title: string;
  readonly images: readonly string[];
}

export type Fetcher = (url: string) => Promise<Response>;
export const SEED_FETCHER = Symbol('SEED_FETCHER');

const SEED_ACTOR: Caller = { userId: '00000000-0000-0000-0000-000000000000', email: 'seed@system', role: 'owner' };
/** Placeholders are imported before any language is added, so English is the default. */
const SEED_LANG: LangContext = { code: 'en', defaultCode: 'en' };

function isEntry(v: unknown): v is ManifestEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e['title'] === 'string' && Array.isArray(e['images']) && e['images'].every((i) => typeof i === 'string');
}

/**
 * SPEC §5 — on an empty database, import the generated placeholder galleries
 * (published) from the web app's /gallery/ folder at SEED_SOURCE_URL. Runs once:
 * any existing topic means the import already happened (or real content exists).
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(TopicEntity) private readonly topicsRepo: Repository<TopicEntity>,
    private readonly topics: TopicsService,
    private readonly pictures: PicturesService,
    @Optional() @Inject(SEED_FETCHER) private readonly fetcher: Fetcher = fetch,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.importPlaceholders();
    } catch (err) {
      this.logger.error(`placeholder import failed: ${String(err)}`);
    }
  }

  /** Returns the number of pictures imported (0 when skipped). */
  async importPlaceholders(): Promise<number> {
    const source = (this.config.get<string>('SEED_SOURCE_URL') ?? '').replace(/\/+$/, '');
    if (!source || (await this.topicsRepo.count()) > 0) return 0;

    const res = await this.fetcher(`${source}/gallery/galleries.json`);
    if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
    const manifest: unknown = await res.json();
    const entries = Array.isArray(manifest) ? manifest.filter(isEntry) : [];

    let imported = 0;
    for (const entry of entries) {
      const topic = await this.topics.create({ title: entry.title }, SEED_ACTOR, SEED_LANG);
      const files: Buffer[] = [];
      for (const name of entry.images) {
        const img = await this.fetcher(`${source}/gallery/${name}`);
        if (img.ok) files.push(Buffer.from(await img.arrayBuffer()));
      }
      if (files.length > 0) {
        await this.pictures.upload(topic.id, files, SEED_ACTOR, SEED_LANG, { status: 'published' });
        imported += files.length;
      }
      await this.topics.update(topic.id, { status: 'published' }, SEED_ACTOR, SEED_LANG);
    }
    this.logger.log(`imported ${imported} placeholder pictures in ${entries.length} topics`);
    return imported;
  }
}
