import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { ContentStatus, GridColumns, TopicKind, Translations } from '../interfaces/content.interfaces.js';
import { PictureEntity } from './picture.entity.js';

@Entity('topics')
export class TopicEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 140, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** How the page is shown: a picture set, an illustrated text, a book, or a YouTube movie. */
  @Column({ type: 'varchar', length: 16, default: 'pictures' })
  kind!: TopicKind;

  /** Text, book and movie pages: the page's text (light markup, see TopicDetailView.body). */
  @Column({ type: 'text', nullable: true })
  body!: string | null;

  /** Book pages: "Label: value" lines (author, publisher, pages, ISBN…). */
  @Column({ type: 'text', nullable: true })
  details!: string | null;

  /** Book pages: where the buy button leads. Shared by all languages. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  buyUrl!: string | null;

  /** Book pages: the buy button's text (the site's own label when empty). */
  @Column({ type: 'varchar', length: 60, nullable: true })
  buyLabel!: string | null;

  /** Movie pages: the YouTube link. Shared by all languages. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  videoUrl!: string | null;

  /** Picture sets: how many pictures the website shows in one row (1–3). */
  @Column({ type: 'smallint', default: 3 })
  columns!: GridColumns;

  @Column({ type: 'uuid', nullable: true })
  coverPictureId!: string | null;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: ContentStatus;

  /** Other languages' text (and the default's), see Translations. null = none yet. */
  @Column({ type: 'simple-json', nullable: true })
  translations!: Translations | null;

  @OneToMany(() => PictureEntity, (p) => p.topic)
  pictures?: PictureEntity[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
