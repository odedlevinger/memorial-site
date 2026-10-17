import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { DailySignInEntity } from './entities/daily-sign-in.entity.js';
import { ActivityService, dayIn, daysEnding } from './services/activity.service.js';
import { createHarness, EDITOR, OWNER, VIEWER } from './testing/harness.js';

let app: INestApplication;

const as = (user: { id: string }) => ({ 'x-user-id': user.id });
const http = (): ReturnType<typeof request> => request(app.getHttpServer());

beforeEach(async () => {
  ({ app } = await createHarness());
  await http().post('/content/editors').set(as(OWNER)).send({ email: EDITOR.email }).expect(201);
});

afterEach(async () => {
  await app.close();
});

describe('daily sign-ins', () => {
  it('counts each signed-in person once a day, however often they come back', async () => {
    for (const user of [VIEWER, VIEWER, EDITOR, VIEWER]) await http().get('/content/me').set(as(user)).expect(200);
    const res = await http().get('/content/activity').set(as(EDITOR)).expect(200);
    expect(res.body.timeZone).toBe('Asia/Jerusalem');
    expect(res.body.days).toHaveLength(30);
    expect(res.body.days[29]).toEqual({ day: dayIn(new Date(), 'Asia/Jerusalem'), count: 2 });
    expect(res.body.days.slice(0, 29).every((d: { count: number }) => d.count === 0)).toBe(true);
    expect(res.body.people).toBe(2);
  });

  it('counts a person again on each new day, and only within the period asked for', async () => {
    const activity = app.get(ActivityService);
    const now = new Date('2026-10-17T12:00:00Z');
    const daysAgo = (n: number): Date => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
    await activity.record(VIEWER.id, daysAgo(0));
    await activity.record(VIEWER.id, daysAgo(1));
    await activity.record(EDITOR.id, daysAgo(1));
    await activity.record(EDITOR.id, daysAgo(10));
    expect(await activity.daily(3, now)).toEqual({
      timeZone: 'Asia/Jerusalem',
      days: [
        { day: '2026-10-15', count: 0 },
        { day: '2026-10-16', count: 2 },
        { day: '2026-10-17', count: 1 },
      ],
      people: 2,
    });
    expect((await activity.daily(11, now)).days[0]).toEqual({ day: '2026-10-07', count: 1 });
    const rows = app.get<Repository<DailySignInEntity>>(getRepositoryToken(DailySignInEntity));
    expect(await rows.count()).toBe(4);
  });

  it('requires an editor and a sensible number of days', async () => {
    await http().get('/content/activity').expect(401);
    await http().get('/content/activity').set(as(VIEWER)).expect(403);
    await http().get('/content/activity?days=7').set(as(OWNER)).expect(200).expect((r) => expect(r.body.days).toHaveLength(7));
    for (const days of ['0', '366', 'x', '1.5']) await http().get(`/content/activity?days=${days}`).set(as(EDITOR)).expect(400);
    await expect(app.get(ActivityService).daily(2.5)).rejects.toThrow('days must be between 1 and 365');
  });
});

describe('days', () => {
  it('uses the configured time zone for the day boundary', async () => {
    // 22:30 UTC on the 16th is already the 17th in Israel.
    const late = new Date('2026-10-16T22:30:00Z');
    expect(dayIn(late, 'Asia/Jerusalem')).toBe('2026-10-17');
    expect(dayIn(late, 'UTC')).toBe('2026-10-16');
    const utc = new ActivityService(app.get(getRepositoryToken(DailySignInEntity)), new ConfigService({ SITE_TIME_ZONE: 'UTC' }));
    await utc.record(VIEWER.id, late);
    expect((await utc.daily(1, late)).days).toEqual([{ day: '2026-10-16', count: 1 }]);
  });

  it('lists calendar days across month ends', () => {
    expect(daysEnding('2026-03-01', 3)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });
});
