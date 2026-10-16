import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Append-only record of every content write (who, what, when). */
@Entity('audit_log')
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  actorUserId!: string;

  @Column({ type: 'varchar', length: 254 })
  actorEmail!: string;

  @Column({ type: 'varchar', length: 60 })
  action!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  entityId!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  details!: Record<string, unknown> | null;

  @CreateDateColumn()
  at!: Date;
}
