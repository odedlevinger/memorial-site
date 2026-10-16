import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { AuthModule } from './app/auth.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AuthModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.use(cookieParser());

  // Comma-separated allowed origins from CORS_ORIGINS (e.g. your deployed web URL),
  // plus the common local dev ports. Set CORS_ORIGINS in the Cloud Run deploy.
  const corsOrigins = (process.env['CORS_ORIGINS'] ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:8080',
      'http://localhost:8081',
      ...corsOrigins,
    ],
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Auth Service')
    .setDescription('Authentication and authorisation API')
    .setVersion('1.0')
    .addCookieAuth('app_access')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = Number(process.env['PORT'] ?? 3001);
  await app.listen(port);
  console.log(`Auth service listening on http://localhost:${port}`);
}

void bootstrap();
