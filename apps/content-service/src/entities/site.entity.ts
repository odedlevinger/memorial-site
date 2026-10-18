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

  /**
   * Galleries in each row of the home page, top to bottom (1–3 each); rows after the last
   * use its number. Shared by all languages. null = one row of 3, repeated.
   */
  @Column({ type: 'simple-json', nullable: true })
  homeRows!: GridColumns[] | null;

  /** Other languages' text (and the default's), see Translations. null = none yet. */
  @Column({ type: 'simple-json', nullable: true })
  translations!: Translations | null;

  @Column({ type: 'varchar', length: 254 })
  updatedBy!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}
