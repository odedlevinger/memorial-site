import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { ContentStatus, Translations } from '../interfaces/content.interfaces.js';
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
