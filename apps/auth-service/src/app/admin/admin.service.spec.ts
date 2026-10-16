import { AdminService, CannotSelfDemoteError, LastAdminError } from './admin.service';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { ILike } from 'typeorm';
import { NotFoundException } from '@nestjs/common';

const FIXED_CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return Object.assign(new UserEntity(), {
    id:          'u1',
    displayName: 'John Doe',
    firstName:   'John',
    secondName:  undefined,
    lastName:    'Doe',
    email:       'john@example.com',
    role:        'user',
    createdAt:   FIXED_CREATED_AT,
    ...overrides,
  });
}

function makeAudit(): { logEvent: jest.Mock } {
  return { logEvent: jest.fn().mockResolvedValue(undefined) };
}

function createService(
  repo: Partial<Repository<UserEntity>>,
  audit: { logEvent: jest.Mock } = makeAudit(),
): AdminService {
  return new AdminService(
    repo as Repository<UserEntity>,
    audit as never,
  );
}

const USER_SELECT = ['id', 'displayName', 'firstName', 'secondName', 'lastName', 'email', 'role', 'createdAt'];

// ── searchUsers ───────────────────────────────────────────────────────────────

describe('AdminService', () => {
  describe('searchUsers', () => {
    it('queries with OR across firstName, secondName, lastName, email and returns name fields', async () => {
      const user = makeUser();
      const repo: Partial<Repository<UserEntity>> = {
        findAndCount: jest.fn().mockResolvedValue([[user], 1]),
      };
      const service = createService(repo);

      const result = await service.searchUsers('John', 1, 50);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: [
          { firstName:  ILike('%John%') },
          { secondName: ILike('%John%') },
          { lastName:   ILike('%John%') },
          { email:      ILike('%John%') },
        ],
        select: USER_SELECT,
        skip: 0,
        take: 50,
        order: { displayName: 'ASC' },
      });
      expect(result).toEqual({
        data: [{
          id:          'u1',
          displayName: 'John Doe',
          email:       'john@example.com',
          firstName:   'John',
          secondName:  null,
          lastName:    'Doe',
          role:        'user',
          createdAt:   FIXED_CREATED_AT,
        }],
        total: 1,
        page: 1,
        pageSize: 50,
      });
    });

    it('matches users by lastName only', async () => {
      const user = makeUser({ firstName: 'David', lastName: 'Cohen', displayName: 'David Cohen' });
      const repo: Partial<Repository<UserEntity>> = {
        findAndCount: jest.fn().mockResolvedValue([[user], 1]),
      };
      const service = createService(repo);

      const result = await service.searchUsers('Cohen', 1, 50);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.arrayContaining([{ lastName: ILike('%Cohen%') }]),
        }),
      );
      expect(result.data[0]?.lastName).toBe('Cohen');
    });

    it('matches users by email', async () => {
      const user = makeUser({ email: 'david@example.com' });
      const repo: Partial<Repository<UserEntity>> = {
        findAndCount: jest.fn().mockResolvedValue([[user], 1]),
      };
      const service = createService(repo);

      const result = await service.searchUsers('david@example.com', 1, 50);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.arrayContaining([{ email: ILike('%david@example.com%') }]),
        }),
      );
      expect(result.data[0]?.email).toBe('david@example.com');
    });

    it('returns empty array when no users match', async () => {
      const repo: Partial<Repository<UserEntity>> = {
        findAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      const service = createService(repo);

      const result = await service.searchUsers('zzz', 1, 50);

      expect(result).toEqual({ data: [], total: 0, page: 1, pageSize: 50 });
    });

    it('calculates skip correctly for page 2', async () => {
      const repo: Partial<Repository<UserEntity>> = {
        findAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      const service = createService(repo);

      await service.searchUsers('test', 2, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('maps null displayName to null', async () => {
      const user = makeUser({ displayName: null as unknown as string });
      const repo: Partial<Repository<UserEntity>> = {
        findAndCount: jest.fn().mockResolvedValue([[user], 1]),
      };
      const service = createService(repo);

      const result = await service.searchUsers('john', 1, 50);

      expect(result.data[0]?.displayName).toBeNull();
    });
  });

  // ── getUsersByIds ─────────────────────────────────────────────────────────────

  describe('getUsersByIds', () => {
    it('returns matching users with name fields for given IDs', async () => {
      const user1 = makeUser();
      const user2 = makeUser({ id: 'u2', displayName: 'Jane Smith', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' });
      const repo: Partial<Repository<UserEntity>> = {
        createQueryBuilder: jest.fn().mockReturnValue({
          select:  jest.fn().mockReturnThis(),
          where:   jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([user1, user2]),
        }),
      };
      const service = createService(repo);

      const result = await service.getUsersByIds(['u1', 'u2']);

      expect(result).toEqual([
        { id: 'u1', displayName: 'John Doe',  email: 'john@example.com', firstName: 'John', secondName: null, lastName: 'Doe',   role: 'user', createdAt: FIXED_CREATED_AT },
        { id: 'u2', displayName: 'Jane Smith', email: 'jane@example.com', firstName: 'Jane', secondName: null, lastName: 'Smith', role: 'user', createdAt: FIXED_CREATED_AT },
      ]);
    });

    it('returns empty array for empty input', async () => {
      const repo: Partial<Repository<UserEntity>> = {};
      const service = createService(repo);

      const result = await service.getUsersByIds([]);

      expect(result).toEqual([]);
    });

    it('maps null displayName and undefined name fields to null', async () => {
      const user = makeUser({
        displayName: null as unknown as string,
        firstName:   undefined,
        secondName:  undefined,
        lastName:    undefined,
      });
      const repo: Partial<Repository<UserEntity>> = {
        createQueryBuilder: jest.fn().mockReturnValue({
          select:  jest.fn().mockReturnThis(),
          where:   jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([user]),
        }),
      };
      const service = createService(repo);

      const result = await service.getUsersByIds(['u1']);

      expect(result[0]?.displayName).toBeNull();
      expect(result[0]?.firstName).toBeNull();
      expect(result[0]?.secondName).toBeNull();
      expect(result[0]?.lastName).toBeNull();
    });
  });

  // ── patchUser ─────────────────────────────────────────────────────────────────

  describe('patchUser', () => {
    it('updates name fields and recomputes displayName', async () => {
      const existing = makeUser({ firstName: 'John', lastName: 'Doe', displayName: 'John Doe' });
      const repo: Partial<Repository<UserEntity>> = {
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation(async (u: UserEntity) => u),
      };
      const service = createService(repo);

      const result = await service.patchUser('u1', { firstName: 'David', secondName: 'Amit', lastName: 'Cohen' });

      expect(repo.save).toHaveBeenCalled();
      expect(result.firstName).toBe('David');
      expect(result.secondName).toBe('Amit');
      expect(result.lastName).toBe('Cohen');
      expect(result.displayName).toBe('David A. Cohen');
    });

    it('recomputes displayName correctly when secondName is omitted', async () => {
      const existing = makeUser({ firstName: 'John', lastName: 'Doe', displayName: 'John Doe' });
      const repo: Partial<Repository<UserEntity>> = {
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation(async (u: UserEntity) => u),
      };
      const service = createService(repo);

      const result = await service.patchUser('u1', { firstName: 'Jane', lastName: 'Smith' });

      expect(result.displayName).toBe('Jane Smith');
    });

    it('only updates supplied fields (partial update)', async () => {
      const existing = makeUser({ firstName: 'John', secondName: undefined, lastName: 'Doe', displayName: 'John Doe' });
      const repo: Partial<Repository<UserEntity>> = {
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation(async (u: UserEntity) => u),
      };
      const service = createService(repo);

      const result = await service.patchUser('u1', { lastName: 'Smith' });

      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
      expect(result.displayName).toBe('John Smith');
    });

    it('clears name fields when empty strings are passed and does not overwrite displayName', async () => {
      const existing = makeUser({ firstName: 'John', secondName: undefined, lastName: 'Doe', displayName: 'John Doe' });
      const repo: Partial<Repository<UserEntity>> = {
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation(async (u: UserEntity) => u),
      };
      const service = createService(repo);

      // Empty strings trigger the `|| undefined` falsy path; all fields become undefined.
      // toProfile coerces undefined → null. computeDisplayName(null, null, null) === null
      // → displayName is NOT overwritten.
      const result = await service.patchUser('u1', { firstName: '', secondName: '', lastName: '' });

      expect(result.firstName).toBeNull();
      expect(result.secondName).toBeNull();
      expect(result.lastName).toBeNull();
      expect(result.displayName).toBe('John Doe'); // unchanged
    });

    it('throws NotFoundException when user not found', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      const repo: Partial<Repository<UserEntity>> = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      const service = createService(repo);

      await expect(service.patchUser('missing', { firstName: 'Jane' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── getUserById ───────────────────────────────────────────────────────────────

  describe('getUserById', () => {
    it('returns user profile with name fields when found', async () => {
      const user = makeUser();
      const repo: Partial<Repository<UserEntity>> = {
        findOne: jest.fn().mockResolvedValue(user),
      };
      const service = createService(repo);

      const result = await service.getUserById('u1');

      expect(repo.findOne).toHaveBeenCalledWith({
        where:  { id: 'u1' },
        select: USER_SELECT,
      });
      expect(result).toEqual({
        id:          'u1',
        displayName: 'John Doe',
        email:       'john@example.com',
        firstName:   'John',
        secondName:  null,
        lastName:    'Doe',
        role:        'user',
        createdAt:   FIXED_CREATED_AT,
      });
    });

    it('returns null when user not found', async () => {
      const repo: Partial<Repository<UserEntity>> = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      const service = createService(repo);

      const result = await service.getUserById('missing');

      expect(result).toBeNull();
    });

    it('maps null displayName and missing name fields to null', async () => {
      const user = makeUser({
        displayName: null as unknown as string,
        firstName:   undefined,
        lastName:    undefined,
      });
      const repo: Partial<Repository<UserEntity>> = {
        findOne: jest.fn().mockResolvedValue(user),
      };
      const service = createService(repo);

      const result = await service.getUserById('u1');

      expect(result?.displayName).toBeNull();
      expect(result?.firstName).toBeNull();
      expect(result?.lastName).toBeNull();
    });
  });

  // ── feature 235: listUsersByRole ──────────────────────────────────────────

  describe('listUsersByRole', () => {
    it('queries findAndCount with the exact role filter and paginates', async () => {
      const admin = makeUser({ role: 'admin', email: 'admin@ex.com' });
      const repo: Partial<Repository<UserEntity>> = {
        findAndCount: jest.fn().mockResolvedValue([[admin], 1]),
      };
      const service = createService(repo);

      const result = await service.listUsersByRole('admin', 1, 50);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where:  { role: 'admin' },
        select: USER_SELECT,
        skip:   0,
        take:   50,
        order:  { displayName: 'ASC' },
      });
      expect(result.total).toBe(1);
      expect(result.data[0]?.role).toBe('admin');
    });

    it('calculates skip for page 3 with pageSize 10', async () => {
      const repo: Partial<Repository<UserEntity>> = {
        findAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      const service = createService(repo);

      await service.listUsersByRole('admin', 3, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  // ── feature 235: getByEmail ───────────────────────────────────────────────

  describe('getByEmail', () => {
    it('matches case-insensitively using ILike and returns the profile', async () => {
      const user = makeUser({ email: 'Admin@MoveWithU.com' });
      const repo: Partial<Repository<UserEntity>> = {
        findOne: jest.fn().mockResolvedValue(user),
      };
      const service = createService(repo);

      const result = await service.getByEmail('admin@example.com');

      expect(repo.findOne).toHaveBeenCalledWith({
        where:  { email: ILike('admin@example.com') },
        select: USER_SELECT,
      });
      expect(result?.email).toBe('Admin@MoveWithU.com');
    });

    it('returns null when no user matches the email', async () => {
      const repo: Partial<Repository<UserEntity>> = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      const service = createService(repo);

      const result = await service.getByEmail('ghost@example.com');

      expect(result).toBeNull();
    });
  });

  // ── feature 235: grantAdminRole ───────────────────────────────────────────

  describe('grantAdminRole', () => {
    it('promotes a user and writes a ROLE_CHANGE audit row', async () => {
      const user = makeUser({ role: 'user' });
      const audit = makeAudit();
      const repo: Partial<Repository<UserEntity>> = {
        findOne: jest.fn().mockResolvedValue(user),
        save:    jest.fn().mockImplementation(async (u: UserEntity) => u),
      };
      const service = createService(repo, audit);

      const result = await service.grantAdminRole('u1', 'actor-uid');

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }));
      expect(audit.logEvent).toHaveBeenCalledWith(
        'ROLE_CHANGE',
        'actor-uid',
        expect.any(String),
        expect.any(String),
        'success',
        expect.objectContaining({
          targetUserId: 'u1',
          fromRole:     'user',
          toRole:       'admin',
          actorUserId:  'actor-uid',
        }),
      );
      expect(result.role).toBe('admin');
    });

    it('is a no-op when the user is already an Admin (no save, no audit)', async () => {
      const user = makeUser({ role: 'admin' });
      const audit = makeAudit();
      const repo: Partial<Repository<UserEntity>> = {
        findOne: jest.fn().mockResolvedValue(user),
        save:    jest.fn(),
      };
      const service = createService(repo, audit);

      const result = await service.grantAdminRole('u1', 'actor-uid');

      expect(repo.save).not.toHaveBeenCalled();
      expect(audit.logEvent).not.toHaveBeenCalled();
      expect(result.role).toBe('admin');
    });

    it('throws NotFoundException when the target does not exist', async () => {
      const repo: Partial<Repository<UserEntity>> = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      const service = createService(repo);

      await expect(
        service.grantAdminRole('missing', 'actor-uid'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('passes actorUserId=null to audit when actor is the rollout migration', async () => {
      const user = makeUser({ role: 'user' });
      const audit = makeAudit();
      const repo: Partial<Repository<UserEntity>> = {
        findOne: jest.fn().mockResolvedValue(user),
        save:    jest.fn().mockImplementation(async (u: UserEntity) => u),
      };
      const service = createService(repo, audit);

      await service.grantAdminRole('u1', 'rollout-migration');

      expect(audit.logEvent).toHaveBeenCalledWith(
        'ROLE_CHANGE',
        null,
        expect.any(String),
        expect.any(String),
        'success',
        expect.objectContaining({ actorUserId: 'rollout-migration' }),
      );
    });
  });

  // ── feature 235: revokeAdminRole ──────────────────────────────────────────

  describe('revokeAdminRole', () => {
    function buildTxRepo(user: UserEntity | null, adminCount: number) {
      const save = jest.fn().mockImplementation(async (u: UserEntity) => u);
      const txRepo = {
        findOne: jest.fn().mockResolvedValue(user),
        count:   jest.fn().mockResolvedValue(adminCount),
        save,
      };
      const transaction = jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({ getRepository: () => txRepo }),
      );
      const repo = {
        manager: { transaction },
      } as unknown as Partial<Repository<UserEntity>>;
      return { repo, txRepo, transaction, save };
    }

    it('demotes an Admin and writes a ROLE_CHANGE audit row', async () => {
      const target = makeUser({ id: 'target', role: 'admin' });
      const { repo, save } = buildTxRepo(target, 2);
      const audit = makeAudit();
      const service = createService(repo, audit);

      const result = await service.revokeAdminRole('target', 'actor');

      expect(save).toHaveBeenCalledWith(expect.objectContaining({ role: 'user' }));
      expect(audit.logEvent).toHaveBeenCalledWith(
        'ROLE_CHANGE',
        'actor',
        expect.any(String),
        expect.any(String),
        'success',
        expect.objectContaining({
          targetUserId: 'target',
          fromRole:     'admin',
          toRole:       'user',
          actorUserId:  'actor',
        }),
      );
      expect(result.role).toBe('user');
    });

    it('refuses with LastAdminError when the target is the only Admin', async () => {
      const target = makeUser({ id: 'target', role: 'admin' });
      const { repo, save } = buildTxRepo(target, 1);
      const audit = makeAudit();
      const service = createService(repo, audit);

      await expect(
        service.revokeAdminRole('target', 'actor'),
      ).rejects.toBeInstanceOf(LastAdminError);
      expect(save).not.toHaveBeenCalled();
      expect(audit.logEvent).not.toHaveBeenCalled();
    });

    it('refuses with CannotSelfDemoteError when target === actor', async () => {
      const target = makeUser({ id: 'same-uid', role: 'admin' });
      const { repo, save, transaction } = buildTxRepo(target, 2);
      const audit = makeAudit();
      const service = createService(repo, audit);

      await expect(
        service.revokeAdminRole('same-uid', 'same-uid'),
      ).rejects.toBeInstanceOf(CannotSelfDemoteError);
      expect(transaction).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(audit.logEvent).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the target does not exist', async () => {
      const { repo } = buildTxRepo(null, 5);
      const service = createService(repo);

      await expect(
        service.revokeAdminRole('missing', 'actor'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is a no-op when the target is already non-Admin (no save, no audit)', async () => {
      const target = makeUser({ id: 'target', role: 'user' });
      const { repo, save } = buildTxRepo(target, 2);
      const audit = makeAudit();
      const service = createService(repo, audit);

      const result = await service.revokeAdminRole('target', 'actor');

      expect(save).not.toHaveBeenCalled();
      expect(audit.logEvent).not.toHaveBeenCalled();
      expect(result.role).toBe('user');
    });

    it('passes actorUserId=null to audit when actor is the rollout migration', async () => {
      const target = makeUser({ id: 'target', role: 'admin' });
      const { repo } = buildTxRepo(target, 2);
      const audit = makeAudit();
      const service = createService(repo, audit);

      await service.revokeAdminRole('target', 'rollout-migration');

      expect(audit.logEvent).toHaveBeenCalledWith(
        'ROLE_CHANGE',
        null,
        expect.any(String),
        expect.any(String),
        'success',
        expect.objectContaining({ actorUserId: 'rollout-migration' }),
      );
    });
  });
});