import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('sessions')
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  /** SHA-256 hash of the plaintext refresh token. */
  @Column({ unique: true })
  refreshTokenHash!: string;

  /**
   * Stored as bigint in PostgreSQL; TypeORM returns it as a string.
   * Cast explicitly with Number() in the service layer when comparing.
   */
  @Column({ type: 'bigint' })
  expiresAt!: string;
}
