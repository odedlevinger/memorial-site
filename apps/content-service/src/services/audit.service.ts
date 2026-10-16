import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { AuditLogEntity } from '../entities/audit-log.entity.js';
import type { Caller } from '../interfaces/content.interfaces.js';

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLogEntity) private readonly log: Repository<AuditLogEntity>) {}

  async record(
    actor: Caller,
    action: string,
    entityId: string | null,
    details: Record<string, unknown> | null,
  ): Promise<void> {
    await this.log.save(this.log.create({ actorUserId: actor.userId, actorEmail: actor.email, action, entityId, details }));
  }
}
