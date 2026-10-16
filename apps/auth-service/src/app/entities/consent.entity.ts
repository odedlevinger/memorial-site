import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('consents')
export class ConsentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** May be anonymised after account deletion (DELETED_<hash>) */
  @Column()
  userId!: string;

  @Column()
  givenAt!: string; // ISO string

  @Column()
  policyVersion!: string;

  @Column()
  ipAddress!: string;
}
