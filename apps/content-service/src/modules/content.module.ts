import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Storage } from '@google-cloud/storage';
import { AuditLogEntity } from '../entities/audit-log.entity.js';
import { EditorEntity } from '../entities/editor.entity.js';
import { PageEntity } from '../entities/page.entity.js';
import { PictureEntity } from '../entities/picture.entity.js';
import { TopicEntity } from '../entities/topic.entity.js';
import { EditorsController } from '../controllers/editors.controller.js';
import { MeController } from '../controllers/me.controller.js';
import { PagesController } from '../controllers/pages.controller.js';
import { PicturesController } from '../controllers/pictures.controller.js';
import { PublicController } from '../controllers/public.controller.js';
import { TopicsController } from '../controllers/topics.controller.js';
import { RolesGuard } from '../guards/roles.guard.js';
import type { ImageStore } from '../interfaces/content.interfaces.js';
import { AuditService } from '../services/audit.service.js';
import { EditorsService } from '../services/editors.service.js';
import { IdentityService } from '../services/identity.service.js';
import { GcsImageStore, IMAGE_STORE, LocalImageStore } from '../services/image-store.service.js';
import { ImagesService } from '../services/images.service.js';
import { PagesService } from '../services/pages.service.js';
import { PicturesService } from '../services/pictures.service.js';
import { IDENTITY_LOOKUP, RolesService } from '../services/roles.service.js';
import { SeedService } from '../services/seed.service.js';
import { TopicsService } from '../services/topics.service.js';

export const ENTITIES = [TopicEntity, PictureEntity, EditorEntity, PageEntity, AuditLogEntity];

/** Cloud Storage when STORAGE_BUCKET is set, otherwise a local folder (docker-compose dev). */
export function imageStoreFactory(config: ConfigService): ImageStore {
  const bucket = config.get<string>('STORAGE_BUCKET');
  if (bucket) return new GcsImageStore(new Storage(), bucket);
  return new LocalImageStore(
    config.get<string>('STORAGE_LOCAL_DIR') ?? '/tmp/content-files',
    config.get<string>('STORAGE_PUBLIC_BASE') ?? 'http://localhost:3002/content/files',
  );
}

export function typeOrmOptions(config: ConfigService): TypeOrmModuleOptions {
  const url = config.get<string>('DATABASE_URL') ?? '';
  return {
    type: 'postgres',
    url,
    entities: ENTITIES,
    synchronize: true, // matches auth-service; TODO explicit migrations (plan.md)
    // Cloud SQL's Unix socket is already encrypted and rejects SSL handshakes.
    ssl: config.get<string>('NODE_ENV') === 'production' && !url.includes('/cloudsql/') ? { rejectUnauthorized: false } : false,
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ imports: [ConfigModule], useFactory: typeOrmOptions, inject: [ConfigService] }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  controllers: [PublicController, MeController, TopicsController, PicturesController, EditorsController, PagesController],
  providers: [
    { provide: IMAGE_STORE, useFactory: imageStoreFactory, inject: [ConfigService] },
    IdentityService,
    { provide: IDENTITY_LOOKUP, useExisting: IdentityService },
    RolesService,
    RolesGuard,
    AuditService,
    ImagesService,
    TopicsService,
    PicturesService,
    EditorsService,
    PagesService,
    SeedService,
  ],
})
export class ContentModule {}
