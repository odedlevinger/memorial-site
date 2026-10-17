import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ContentStatus, Translations } from '../interfaces/content.interfaces.js';
import { TopicEntity } from './topic.entity.js';

@Entity('pictures')
export class PictureEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  topicId!: string;

  @ManyToOne(() => TopicEntity, (t) => t.pictures, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topicId' })
  topic?: TopicEntity;

  /** Storage folder for this picture's derivatives (original/display/thumb). */
  @Column({ type: 'varchar', length: 200 })
  storageKey!: string;

  @Column({ type: 'int' })
  width!: number;

  @Column({ type: 'int' })
  height!: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  caption!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  dateText!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  place!: string | null;

  @Column({ type: 'text', nullable: true })
  story!: string | null;

  /** Other languages' text (and the default's), see Translations. null = none yet. */
  @Column({ type: 'simple-json', nullable: true })
  translations!: Translations | null;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: ContentStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
