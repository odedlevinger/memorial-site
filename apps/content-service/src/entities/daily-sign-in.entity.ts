import { Entity, PrimaryColumn } from 'typeorm';

/** One row per signed-in person per day they used the site — no more is stored. */
@Entity('daily_sign_ins')
export class DailySignInEntity {
  /** Calendar day in the site's time zone, YYYY-MM-DD. */
  @PrimaryColumn({ type: 'varchar', length: 10 })
  day!: string;

  @PrimaryColumn({ type: 'uuid' })
  userId!: string;
}
