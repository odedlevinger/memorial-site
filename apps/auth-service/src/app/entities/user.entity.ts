import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Canonical role value granting Back Office access. */
export const ROLE_ADMIN = 'admin' as const;
/** Default role for newly registered application users. */
export const ROLE_USER = 'user' as const;

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ nullable: true })
  displayName!: string;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  secondName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ nullable: true })
  passwordHash!: string;

  @Column({ default: 'local' })
  provider!: string;

  @Column({ nullable: true, unique: true })
  googleId?: string;

  @Column({ nullable: true })
  photoUrl?: string;

  @Column({ default: 'user' })
  role!: string;

  @Column({ nullable: true, default: null })
  preferredLanguage?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
