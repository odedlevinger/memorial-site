import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Editable text for one fixed site page (About, Contact). No row = built-in default text. */
@Entity('pages')
export class PageEntity {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  slug!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', length: 254 })
  updatedBy!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}
