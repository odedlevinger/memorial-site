import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * The owner chosen in the back office — a single row (id 1). No row = the owners
 * come from OWNER_EMAILS (delete the row to fall back to them).
 */
@Entity('site_owner')
export class OwnerEntity {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  /** Lower-cased Google account email. */
  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 254 })
  changedBy!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}
