// Test-only helpers (excluded from coverage): an in-process app on in-memory SQLite,
// an in-memory image store, a fixed identity table, and sample images.
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import sharp from 'sharp';
import { ActivityController } from '../controllers/activity.controller.js';
import { EditorsController } from '../controllers/editors.controller.js';
import { LanguagesController } from '../controllers/languages.controller.js';
import { MeController } from '../controllers/me.controller.js';
import { PagesController } from '../controllers/pages.controller.js';
import { SiteController } from '../controllers/site.controller.js';
import { PicturesController } from '../controllers/pictures.controller.js';
import { PublicController } from '../controllers/public.controller.js';
import { TopicsController } from '../controllers/topics.controller.js';
import { RolesGuard } from '../guards/roles.guard.js';
import type { IdentityLookup, ImageStore } from '../interfaces/content.interfaces.js';
import { ENTITIES } from '../modules/content.module.js';
import { ActivityService } from '../services/activity.service.js';
import { AuditService } from '../services/audit.service.js';
import { EditorsService } from '../services/editors.service.js';
import { LanguagesService } from '../services/languages.service.js';
import { IMAGE_STORE } from '../services/image-store.service.js';
import { ImagesService } from '../services/images.service.js';
import { PagesService } from '../services/pages.service.js';
import { SiteService } from '../services/site.service.js';
import { SiteSummaryService } from '../services/site-summary.service.js';
import { PicturesService } from '../services/pictures.service.js';
import { IDENTITY_LOOKUP, RolesService } from '../services/roles.service.js';
import { TopicsService } from '../services/topics.service.js';

export const OWNER = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.com' };
export const EDITOR = { id: '22222222-2222-4222-8222-222222222222', email: 'editor@example.com' };
export const VIEWER = { id: '33333333-3333-4333-8333-333333333333', email: 'viewer@example.com' };
export const UNKNOWN_ID = '44444444-4444-4444-8444-444444444444';

export class MemoryImageStore implements ImageStore {
  readonly files = new Map<string, Buffer>();
  async put(path: string, data: Buffer): Promise<void> {
    this.files.set(path, data);
  }
  async remove(prefix: string): Promise<void> {
    for (const k of [...this.files.keys()]) if (k.startsWith(`${prefix}/`)) this.files.delete(k);
  }
  publicUrl(path: string): string {
    return `https://img.test/${path}`;
  }
}

export const fakeIdentity: IdentityLookup = {
  async emailForUser(userId: string): Promise<string | null> {
    return [OWNER, EDITOR, VIEWER].find((u) => u.id === userId)?.email ?? null;
  },
};

export interface Harness {
  readonly app: INestApplication;
  readonly store: MemoryImageStore;
}

export async function createHarness(): Promise<Harness> {
  const store = new MemoryImageStore();
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ OWNER_EMAILS: OWNER.email })] }),
      TypeOrmModule.forRoot({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true }),
      TypeOrmModule.forFeature(ENTITIES),
    ],
    controllers: [PublicController, MeController, TopicsController, PicturesController, EditorsController, PagesController, SiteController, LanguagesController, ActivityController],
    providers: [
      { provide: IMAGE_STORE, useValue: store },
      { provide: IDENTITY_LOOKUP, useValue: fakeIdentity },
      RolesService,
      RolesGuard,
      AuditService,
      ImagesService,
      TopicsService,
      PicturesService,
      EditorsService,
      PagesService,
      SiteService,
      SiteSummaryService,
    LanguagesService,
    ActivityService,
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  return { app, store };
}

export async function sampleImage(format: 'jpeg' | 'png' | 'webp' | 'gif' = 'jpeg', width = 900, height = 600): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 120, b: 120 } } })
    .toFormat(format)
    .toBuffer();
}
