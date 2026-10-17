import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { Direction } from '../interfaces/content.interfaces.js';

/** A language the site is offered in. No rows = English only (built-in default). */
@Entity('languages')
export class LanguageEntity {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  code!: string;

  @Column({ type: 'varchar', length: 40 })
  name!: string;

  @Column({ type: 'varchar', length: 3 })
  direction!: Direction;

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ type: 'int', default: 0 })
  position!: number;

  /** Overrides for the site's fixed labels, by label key. */
  @Column({ type: 'simple-json' })
  labels!: Record<string, string>;

  @Column({ type: 'varchar', length: 254 })
  updatedBy!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}
