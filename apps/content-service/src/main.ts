import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ContentModule } from './modules/content.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(ContentModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

  // Local-disk image storage (no STORAGE_BUCKET) is served by the service itself.
  if (!process.env['STORAGE_BUCKET']) {
    app.useStaticAssets(process.env['STORAGE_LOCAL_DIR'] ?? '/tmp/content-files', { prefix: '/content/files' });
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
