import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, type Repository } from 'typeorm';
import { DailySignInEntity } from '../entities/daily-sign-in.entity.js';
import type { ActivityView, DailyCount } from '../interfaces/content.interfaces.js';

export const DEFAULT_TIME_ZONE = 'Asia/Jerusalem';
export const MAX_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The calendar day (YYYY-MM-DD) that `at` falls on in `timeZone`. */
export function dayIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** The `count` calendar days ending on `lastDay`, oldest first. */
export function daysEnding(lastDay: string, count: number): string[] {
  const last = Date.parse(`${lastDay}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => new Date(last - (count - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

/**
 * Counts signed-in people per day. A visit is recorded whenever the site asks who the caller
 * is (GET /content/me — on every page load); the same person on the same day counts once,
 * however many sessions, devices or reloads.
 */
@Injectable()
export class ActivityService {
  private readonly timeZone: string;

  constructor(
    @InjectRepository(DailySignInEntity) private readonly visits: Repository<DailySignInEntity>,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('SITE_TIME_ZONE') || DEFAULT_TIME_ZONE;
  }

  async record(userId: string, at: Date = new Date()): Promise<void> {
    await this.visits.createQueryBuilder().insert().values({ day: dayIn(at, this.timeZone), userId }).orIgnore().execute();
  }

  async daily(days: number, now: Date = new Date()): Promise<ActivityView> {
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) throw new BadRequestException(`days must be between 1 and ${MAX_DAYS}`);
    const range = daysEnding(dayIn(now, this.timeZone), days);
    const rows = await this.visits.findBy({ day: MoreThanOrEqual(range[0] as string) });
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.day, (counts.get(row.day) ?? 0) + 1);
    const daily: DailyCount[] = range.map((day) => ({ day, count: counts.get(day) ?? 0 }));
    return { timeZone: this.timeZone, days: daily, people: new Set(rows.map((r) => r.userId)).size };
  }
}
