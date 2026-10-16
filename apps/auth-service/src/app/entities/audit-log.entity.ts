import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_log')
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  eventType!: string;

  /** Nullable: not yet known at time of failed login attempt */
  @Column({ nullable: true, type: 'text' })
  userId!: string | null;

  @Column()
  ipAddress!: string;

  @Column()
  userAgent!: string;

  @Column()
  occurredAt!: string; // ISO string

  @Column()
  outcome!: string; // 'success' | 'failure'

  @Column({ type: 'simple-json', nullable: true })
  metadata!: Record<string, unknown> | null;
}
