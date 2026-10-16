import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { EditorEntity } from '../entities/editor.entity.js';
import { RolesService } from './roles.service.js';

describe('RolesService', () => {
  it('has no owners when OWNER_EMAILS is unset', async () => {
    const editors = { findOneBy: jest.fn().mockResolvedValue(null) } as unknown as Repository<EditorEntity>;
    const roles = new RolesService(new ConfigService({}), { emailForUser: async () => 'a@b.c' }, editors);
    expect(roles.isOwnerEmail('a@b.c')).toBe(false);
    expect(await roles.resolve('u')).toEqual({ userId: 'u', email: 'a@b.c', role: 'viewer' });
  });

  it('parses a comma-separated, case-insensitive owner list', () => {
    const roles = new RolesService(
      new ConfigService({ OWNER_EMAILS: ' A@b.c , ,d@e.f' }),
      { emailForUser: async () => null },
      {} as Repository<EditorEntity>,
    );
    expect(roles.isOwnerEmail('a@B.c')).toBe(true);
    expect(roles.isOwnerEmail('d@e.f')).toBe(true);
  });
});
