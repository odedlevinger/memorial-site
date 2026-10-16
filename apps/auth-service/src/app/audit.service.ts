import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { AuditEventType, AuditLogEntry } from './auth.types.js';
import { AuditLogEntity } from './entities/audit-log.entity.js';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  async logEvent(
    eventType: AuditEventType,
    userId: string | null,
    ipAddress: string,
    userAgent: string,
    outcome: 'success' | 'failure',
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const entry = this.repo.create({
      id: randomUUID(),
      eventType,
      userId,
      ipAddress,
      userAgent,
      occurredAt: new Date().toISOString(),
      outcome,
      metadata: Object.keys(metadata).length ? metadata : null,
    });
    await this.repo.save(entry);
    // Never log passwords or token values.
    console.log(`[AUDIT] ${eventType} userId=${userId ?? 'unknown'} outcome=${outcome}`);
  }

  async getEntriesForUser(userId: string): Promise<AuditLogEntry[]> {
    const rows = await this.repo.findBy({ userId });
    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType as AuditEventType,
      userId: r.userId,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      occurredAt: r.occurredAt,
      outcome: r.outcome as 'success' | 'failure',
      metadata: (r.metadata ?? {}) as Record<string, string>,
    }));
  }

  async anonymiseUser(userId: string, anonymisedId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(AuditLogEntity)
      .set({ userId: anonymisedId })
      .where('userId = :userId', { userId })
      .execute();
  }
}
