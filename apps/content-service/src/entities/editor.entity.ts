import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** An invited editor, identified by (lower-cased) Google account email. */
@Entity('editors')
export class EditorEntity {
  @PrimaryColumn({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 254 })
  addedBy!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
