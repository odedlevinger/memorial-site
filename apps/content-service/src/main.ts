import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { NextFunction, Request, Response } from 'express';
import { ContentModule } from './modules/content.module.js';
import { VIDEO_PATH } from './services/videos.service.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(ContentModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

  // Local-disk image storage (no STORAGE_BUCKET) is served by the service itself.
  if (!process.env['STORAGE_BUCKET']) {
    const root = process.env['STORAGE_LOCAL_DIR'] ?? '/tmp/content-files';
    // Video uploads go straight to storage: here, a PUT to the file's own URL (LocalImageStore.createUpload).
    app.use('/content/files', (req: Request, res: Response, next: NextFunction): void => {
      const path = req.path.slice(1);
      if ((req.method !== 'PUT' && req.method !== 'OPTIONS') || !VIDEO_PATH.test(path)) return next();
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
      res.setHeader('Access-Control-Allow-Methods', 'PUT');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Range');
      if (req.method === 'OPTIONS') return void res.sendStatus(204);
      const file = join(root, path);
      void mkdir(dirname(file), { recursive: true }).then(() =>
        pipeline(req, createWriteStream(file)).then(
          () => res.sendStatus(200),
          () => res.sendStatus(500),
        ),
      );
    });
    app.useStaticAssets(root, { prefix: '/content/files' });
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Content Service')
    .setDescription('Memory topics, pictures, captions and editors')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = Number(process.env['PORT'] ?? 3002);
  await app.listen(port);
  console.log(`Content service listening on http://localhost:${port}`);
}

void bootstrap();
