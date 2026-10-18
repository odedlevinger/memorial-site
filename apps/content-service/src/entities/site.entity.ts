import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { GridColumns, Translations } from '../interfaces/content.interfaces.js';

/** Site-wide settings — a single row (id 1). No row = built-in defaults. */
@Entity('site_settings')
export class SiteEntity {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'varchar', length: 60 })
  title!: string;

  @Column({ type: 'varchar', length: 120 })
  tagline!: string;

  /** How many galleries the home page shows in one row (1–3). Shared by all languages. */
  @Column({ type: 'smallint', default: 3 })
  homeColumns!: GridColumns;

  /** Other languages' text (and the default's), see Translations. null = none yet. */
  @Column({ type: 'simple-json', nullable: true })
  translations!: Translations | null;

  @Column({ type: 'varchar', length: 254 })
  updatedBy!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}
