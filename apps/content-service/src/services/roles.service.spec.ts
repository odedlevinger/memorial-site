import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { EditorEntity } from '../entities/editor.entity.js';
import type { OwnerEntity } from '../entities/owner.entity.js';
import { RolesService } from './roles.service.js';

const noOwnerRow = { findOneBy: jest.fn().mockResolvedValue(null) } as unknown as Repository<OwnerEntity>;

describe('RolesService', () => {
  it('has no owners when OWNER_EMAILS is unset', async () => {
    const editors = { findOneBy: jest.fn().mockResolvedValue(null) } as unknown as Repository<EditorEntity>;
    const roles = new RolesService(new ConfigService({}), { emailForUser: async () => 'a@b.c' }, editors, noOwnerRow);
    expect(await roles.isOwnerEmail('a@b.c')).toBe(false);
    expect(await roles.resolve('u')).toEqual({ userId: 'u', email: 'a@b.c', role: 'viewer' });
  });

  it('parses a comma-separated, case-insensitive owner list', async () => {
    const roles = new RolesService(
      new ConfigService({ OWNER_EMAILS: ' A@b.c , ,d@e.f,a@b.c' }),
      { emailForUser: async () => null },
      {} as Repository<EditorEntity>,
      noOwnerRow,
    );
    expect(await roles.isOwnerEmail('a@B.c')).toBe(true);
    expect(await roles.isOwnerEmail('d@e.f')).toBe(true);
    expect((await roles.owners()).emails).toEqual(['a@b.c', 'd@e.f']);
  });

  it('prefers the owner chosen in the back office over OWNER_EMAILS', async () => {
    const changedAt = new Date('2026-10-18T10:00:00Z');
    const ownerRow = { findOneBy: jest.fn().mockResolvedValue({ id: 1, email: 'x@y.z', changedBy: 'a@b.c', updatedAt: changedAt }) };
    const roles = new RolesService(
      new ConfigService({ OWNER_EMAILS: 'a@b.c' }),
      { emailForUser: async () => null },
      {} as Repository<EditorEntity>,
      ownerRow as unknown as Repository<OwnerEntity>,
    );
    expect(await roles.isOwnerEmail('a@b.c')).toBe(false);
    expect(await roles.owners()).toEqual({ emails: ['x@y.z'], changedBy: 'a@b.c', changedAt });
  });
});
