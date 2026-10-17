import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { Translations } from '../interfaces/content.interfaces.js';

/** Editable text for one fixed site page (About, Contact). No row = built-in default text. */
@Entity('pages')
export class PageEntity {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  slug!: string;

  @Column({ type: 'text' })
  body!: string;

  /** Other languages' text (and the default's), see Translations. null = none yet. */
  @Column({ type: 'simple-json', nullable: true })
  translations!: Translations | null;

  @Column({ type: 'varchar', length: 254 })
  updatedBy!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}
