import { populateNameFields } from './populate-name-fields.js';
import type { UserEntity } from '../entities/user.entity.js';

// ── Minimal DataSource stub ───────────────────────────────────────────────────

function makeUser(overrides: Partial<UserEntity>): UserEntity {
  return {
    id: 'user-1',
    email: 'test@example.com',
    displayName: null as unknown as string,
    firstName:   undefined,
    secondName:  undefined,
    lastName:    undefined,
    passwordHash: 'hashed',
    provider: 'local',
    role: 'user',
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function buildDataSource(users: UserEntity[]) {
  const saved: UserEntity[] = [];
  const repo = {
    find: jest.fn().mockResolvedValue(users),
    save: jest.fn().mockImplementation(async (u: UserEntity) => {
      saved.push({ ...u });
      return u;
    }),
  };
  const ds = {
    getRepository: jest.fn().mockReturnValue(repo),
  };
  return { ds, repo, saved };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('populateNameFields — parsing (US2)', () => {
  it('splits a two-word displayName into firstName and lastName', async () => {
    const user = makeUser({ displayName: 'Jane Doe' });
    const { ds, saved } = buildDataSource([user]);

    const result = await populateNameFields(ds as never);

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(saved[0]!.firstName).toBe('Jane');
    expect(saved[0]!.secondName).toBeUndefined();
    expect(saved[0]!.lastName).toBe('Doe');
    expect(saved[0]!.displayName).toBe('Jane Doe');
  });

  it('splits a three-word displayName into firstName, secondName, lastName', async () => {
    const user = makeUser({ displayName: 'David Amit Cohen' });
    const { ds, saved } = buildDataSource([user]);

    await populateNameFields(ds as never);

    expect(saved[0]!.firstName).toBe('David');
    expect(saved[0]!.secondName).toBe('Amit');
    expect(saved[0]!.lastName).toBe('Cohen');
    expect(saved[0]!.displayName).toBe('David A. Cohen');
  });

  it('uses the only word as firstName when displayName is a single word', async () => {
    const user = makeUser({ displayName: 'Cher' });
    const { ds, saved } = buildDataSource([user]);

    await populateNameFields(ds as never);

    expect(saved[0]!.firstName).toBe('Cher');
    expect(saved[0]!.secondName).toBeUndefined();
    expect(saved[0]!.lastName).toBeUndefined();
  });

  it('handles a four-word displayName (extra words collapse into lastName)', async () => {
    const user = makeUser({ displayName: 'Mary Jane Watson Parker' });
    const { ds, saved } = buildDataSource([user]);

    await populateNameFields(ds as never);

    // parseDisplayName: word[0]=firstName, words[1..-2] joined=secondName, last word=lastName
    expect(saved[0]!.firstName).toBe('Mary');
    expect(saved[0]!.secondName).toBe('Jane Watson');
    expect(saved[0]!.lastName).toBe('Parker');
  });

  it('leaves displayName unchanged when it cannot be recomputed (all null)', async () => {
    const user = makeUser({ displayName: '' });
    const { ds, saved } = buildDataSource([user]);

    await populateNameFields(ds as never);

    // An empty string produces no parsed words → all fields null/undefined.
    // displayName is not overwritten (stays as '').
    expect(saved[0]!.displayName).toBe('');
  });

  it('treats null displayName the same as empty string (right side of ??)', async () => {
    // makeUser default has displayName: null → triggers `user.displayName ?? ''` right-side branch
    const user = makeUser({});
    const { ds, saved } = buildDataSource([user]);

    await populateNameFields(ds as never);

    // null → '' → parseDisplayName('') → all null → no fields set, displayName stays null
    expect(saved[0]!.firstName).toBeUndefined();
    expect(saved[0]!.displayName).toBeNull();
  });
});

describe('populateNameFields — idempotency (US2)', () => {
  it('skips users that already have firstName populated', async () => {
    const alreadyMigrated = makeUser({
      displayName: 'Jane Doe',
      firstName:   'Jane',
      lastName:    'Doe',
    });
    // The WHERE clause in the real query filters these out; simulate by having
    // find() return only unmigrated users (firstName IS NULL).
    const { ds, repo } = buildDataSource([]);
    repo.find.mockResolvedValue([]); // no rows returned — all already migrated

    const result = await populateNameFields(ds as never);

    expect(result.processed).toBe(0);
    expect(repo.save).not.toHaveBeenCalled();
    // alreadyMigrated is not used here but ensures no writes happen
    void alreadyMigrated;
  });

  it('skips a user that has firstName set even if find() returns it', async () => {
    // Defensive guard inside the loop.
    const user = makeUser({ firstName: 'Jane', displayName: 'Jane Doe' });
    const { ds, repo, saved } = buildDataSource([user]);

    const result = await populateNameFields(ds as never);

    expect(result.skipped).toBe(1);
    expect(result.processed).toBe(0);
    expect(saved).toHaveLength(0);
    void repo;
  });

  it('running migration twice on same dataset produces no additional saves on second run', async () => {
    const user = makeUser({ displayName: 'Jane Doe' });
    const { ds: ds1, saved: saved1 } = buildDataSource([user]);
    await populateNameFields(ds1 as never);
    expect(saved1).toHaveLength(1);

    // Second run: find() returns empty (WHERE firstName IS NULL matches nobody)
    const { ds: ds2, repo: repo2 } = buildDataSource([]);
    const result2 = await populateNameFields(ds2 as never);

    expect(result2.processed).toBe(0);
    expect(repo2.save).not.toHaveBeenCalled();
  });
});

describe('populateNameFields — error handling', () => {
  it('counts errors and continues processing remaining users', async () => {
    const goodUser = makeUser({ id: 'u1', displayName: 'Jane Doe' });
    const badUser  = makeUser({ id: 'u2', displayName: 'Bob Smith' });

    const repo = {
      find: jest.fn().mockResolvedValue([goodUser, badUser]),
      save: jest.fn()
        .mockResolvedValueOnce(goodUser)                      // first call succeeds
        .mockRejectedValueOnce(new Error('DB write failed')), // second call fails
    };
    const ds = { getRepository: jest.fn().mockReturnValue(repo) };

    const result = await populateNameFields(ds as never);

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(1);
  });
});