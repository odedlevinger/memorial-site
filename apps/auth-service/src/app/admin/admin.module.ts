import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../entities/user.entity.js';
import { AuditLogEntity } from '../entities/audit-log.entity.js';
import { AuditService } from '../audit.service.js';
import { AdminService } from './admin.service.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, AuditLogEntity])],
  controllers: [AdminController],
  // Provide a module-local AuditService instance so AdminService can write
  // ROLE_CHANGE audit rows. Stateless service; module-scoped duplication is
  // intentional to keep AdminModule independent of AuthModule's internals.
  providers: [AdminService, AuditService],
})
export class AdminModule {}
