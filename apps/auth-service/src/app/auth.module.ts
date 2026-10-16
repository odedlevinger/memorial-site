import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller.js';
import { BackendAuthService } from './auth.service.js';
import { AuditService } from './audit.service.js';
import { UserEntity } from './entities/user.entity.js';
import { SessionEntity } from './entities/session.entity.js';
import { ConsentEntity } from './entities/consent.entity.js';
import { AuditLogEntity } from './entities/audit-log.entity.js';
import { AdminModule } from './admin/admin.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type:        'postgres',
        url:         config.get<string>('DATABASE_URL'),
        entities:    [UserEntity, SessionEntity, ConsentEntity, AuditLogEntity],
        synchronize: true, // TODO: replace with explicit migrations before going multi-tenant
        // Cloud SQL via the Unix socket (/cloudsql/...) is already encrypted and
        // rejects SSL handshakes — only enable SSL for production TCP connections.
        ssl:         config.get<string>('NODE_ENV') === 'production' &&
                     !(config.get<string>('DATABASE_URL') ?? '').includes('/cloudsql/')
          ? { rejectUnauthorized: false }
          : false,
      }),
      inject: [ConfigService],
    }),

    TypeOrmModule.forFeature([UserEntity, SessionEntity, ConsentEntity, AuditLogEntity]),

    HttpModule.register({}),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret:      config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret-change-in-prod',
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),

    AdminModule,
  ],
  controllers: [AuthController],
  providers: [BackendAuthService, AuditService],
})
export class AuthModule {}
