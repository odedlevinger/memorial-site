import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import {
  AdminService,
  CannotSelfDemoteError,
  LastAdminError,
} from './admin.service';

const VALID_SECRET = 'test-secret';

function makeAdminService(): jest.Mocked<AdminService> {
  return {
    searchUsers: jest.fn(),
    getUserById: jest.fn(),
    getUsersByIds: jest.fn(),
    listUsersByRole: jest.fn(),
    getByEmail: jest.fn(),
    grantAdminRole: jest.fn(),
    revokeAdminRole: jest.fn(),
  } as unknown as jest.Mocked<AdminService>;
}

async function createController(
  adminService: AdminService,
  configGet?: jest.Mock,
): Promise<AdminController> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [AdminController],
    providers: [
      { provide: AdminService, useValue: adminService },
      {
        provide: ConfigService,
        useValue: { get: configGet ?? jest.fn().mockReturnValue(VALID_SECRET) },
      },
    ],
  }).compile();
  return module.get<AdminController>(AdminController);
}

describe('AdminController', () => {
  describe('searchUsers', () => {
    it('returns search results for valid request (includes name fields)', async () => {
      const adminService = makeAdminService();
      const expected = {
        data: [{ id: 'u1', displayName: 'John Doe', email: 'john@example.com', firstName: 'John', secondName: null, lastName: 'Doe', role: 'user', createdAt: new Date('2026-01-01T00:00:00.000Z') }],
        total: 1,
        page: 1,
        pageSize: 50,
      };
      adminService.searchUsers.mockResolvedValue(expected);
      const controller = await createController(adminService);

      const result = await controller.searchUsers('John', 1, 50, VALID_SECRET);

      expect(adminService.searchUsers).toHaveBeenCalledWith('John', 1, 50);
      expect(result).toEqual(expected);
    });

    it('clamps pageSize to 50', async () => {
      const adminService = makeAdminService();
      adminService.searchUsers.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 50 });
      const controller = await createController(adminService);

      await controller.searchUsers('John', 1, 100, VALID_SECRET);

      expect(adminService.searchUsers).toHaveBeenCalledWith('John', 1, 50);
    });

    it('throws 403 for missing secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.searchUsers('John', 1, 50, ''),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws 403 for wrong secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.searchUsers('John', 1, 50, 'wrong-secret'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws 400 when q is empty', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.searchUsers('', 1, 50, VALID_SECRET),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws 400 when q is 1 character', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.searchUsers('a', 1, 50, VALID_SECRET),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getUserById', () => {
    it('returns user profile with name fields when found', async () => {
      const adminService = makeAdminService();
      const user = { id: 'u1', displayName: 'John Doe', email: 'john@example.com', firstName: 'John', secondName: null, lastName: 'Doe', role: 'user', createdAt: new Date('2026-01-01T00:00:00.000Z') };
      adminService.getUserById.mockResolvedValue(user);
      const controller = await createController(adminService);

      const result = await controller.getUserById('u1', VALID_SECRET);

      expect(adminService.getUserById).toHaveBeenCalledWith('u1');
      expect(result).toEqual(user);
    });

    it('throws 404 when user not found', async () => {
      const adminService = makeAdminService();
      adminService.getUserById.mockResolvedValue(null);
      const controller = await createController(adminService);

      await expect(
        controller.getUserById('missing', VALID_SECRET),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 403 for missing secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.getUserById('u1', ''),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws 403 for wrong secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.getUserById('u1', 'wrong'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('getUsersByIds', () => {
    it('returns batch user profiles with name fields for valid request', async () => {
      const adminService = makeAdminService();
      const users = [
        { id: 'u1', displayName: 'John Doe',  email: 'john@example.com', firstName: 'John', secondName: null, lastName: 'Doe',   role: 'user', createdAt: new Date('2026-01-01T00:00:00.000Z') },
        { id: 'u2', displayName: 'Jane Smith', email: 'jane@example.com', firstName: 'Jane', secondName: null, lastName: 'Smith', role: 'user', createdAt: new Date('2026-01-02T00:00:00.000Z') },
      ];
      adminService.getUsersByIds.mockResolvedValue(users);
      const controller = await createController(adminService);

      const result = await controller.getUsersByIds({ ids: ['u1', 'u2'] }, VALID_SECRET);

      expect(adminService.getUsersByIds).toHaveBeenCalledWith(['u1', 'u2']);
      expect(result).toEqual({ users });
    });

    it('throws 400 when ids is not an array', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.getUsersByIds({ ids: 'not-array' as unknown as string[] }, VALID_SECRET),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws 400 when ids is empty', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.getUsersByIds({ ids: [] }, VALID_SECRET),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws 400 when body is null', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.getUsersByIds(null as unknown as { ids: string[] }, VALID_SECRET),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws 403 for missing secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.getUsersByIds({ ids: ['u1'] }, ''),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws 403 for wrong secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.getUsersByIds({ ids: ['u1'] }, 'wrong'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('patchUser', () => {
    it('returns updated user profile on success', async () => {
      const adminService = makeAdminService();
      const updated = { id: 'u1', displayName: 'David A. Cohen', email: 'david@example.com', firstName: 'David', secondName: 'Amit', lastName: 'Cohen', role: 'user', createdAt: new Date('2026-01-01T00:00:00.000Z') };
      adminService.patchUser = jest.fn().mockResolvedValue(updated);
      const controller = await createController(adminService);

      const result = await controller.patchUser('u1', { firstName: 'David', secondName: 'Amit', lastName: 'Cohen' }, VALID_SECRET);

      expect(adminService.patchUser).toHaveBeenCalledWith('u1', { firstName: 'David', secondName: 'Amit', lastName: 'Cohen' });
      expect(result).toEqual(updated);
      expect(result.displayName).toBe('David A. Cohen');
    });

    it('throws 404 when user not found', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      const adminService = makeAdminService();
      adminService.patchUser = jest.fn().mockRejectedValue(new NotFoundException('User missing not found'));
      const controller = await createController(adminService);

      await expect(
        controller.patchUser('missing', { firstName: 'Jane' }, VALID_SECRET),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 403 for missing secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.patchUser('u1', { firstName: 'Jane' }, ''),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws 403 for wrong secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.patchUser('u1', { firstName: 'Jane' }, 'wrong'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertSecret — unconfigured ADMIN_SECRET', () => {
    it('throws 403 when ADMIN_SECRET env var is not set', async () => {
      const controller = await createController(
        makeAdminService(),
        jest.fn().mockReturnValue(undefined),
      );

      await expect(
        controller.searchUsers('John', 1, 50, VALID_SECRET),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('default parameter branches', () => {
    it('uses default page=1 and pageSize=50 when not provided', async () => {
      const adminService = makeAdminService();
      adminService.searchUsers.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 50 });
      const controller = await createController(adminService);

      // Call without page/pageSize to exercise the default branches
      await controller.searchUsers(
        'John',
        undefined as unknown as number,
        undefined as unknown as number,
        VALID_SECRET,
      );

      expect(adminService.searchUsers).toHaveBeenCalledWith('John', 1, 50);
    });
  });

  // ── feature 235: listUsersByRole endpoint ─────────────────────────────────

  describe('listUsersByRole (GET /admin/users)', () => {
    const adminProfile = {
      id:          'admin-uid',
      displayName: 'Site Admin',
      email:       'admin@ex.com',
      firstName:   'Site',
      secondName:  null,
      lastName:    'Admin',
      role:        'admin',
      createdAt:   new Date('2026-01-01T00:00:00.000Z'),
    };

    it('returns users matching the role filter', async () => {
      const adminService = makeAdminService();
      const expected = { data: [adminProfile], total: 1, page: 1, pageSize: 50 };
      adminService.listUsersByRole.mockResolvedValue(expected);
      const controller = await createController(adminService);

      const result = await controller.listUsersByRole('admin', 1, 50, VALID_SECRET);

      expect(adminService.listUsersByRole).toHaveBeenCalledWith('admin', 1, 50);
      expect(result).toEqual(expected);
    });

    it('clamps pageSize to 50 and defaults page=1', async () => {
      const adminService = makeAdminService();
      adminService.listUsersByRole.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 50 });
      const controller = await createController(adminService);

      await controller.listUsersByRole('admin', 0, 200, VALID_SECRET);

      expect(adminService.listUsersByRole).toHaveBeenCalledWith('admin', 1, 50);
    });

    it('falls back to pageSize=50 when pageSize is falsy (0)', async () => {
      const adminService = makeAdminService();
      adminService.listUsersByRole.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 50 });
      const controller = await createController(adminService);

      await controller.listUsersByRole('admin', 1, 0, VALID_SECRET);

      expect(adminService.listUsersByRole).toHaveBeenCalledWith('admin', 1, 50);
    });

    it('uses default page/pageSize when not provided', async () => {
      const adminService = makeAdminService();
      adminService.listUsersByRole.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 50 });
      const controller = await createController(adminService);

      await controller.listUsersByRole(
        'admin',
        undefined as unknown as number,
        undefined as unknown as number,
        VALID_SECRET,
      );

      expect(adminService.listUsersByRole).toHaveBeenCalledWith('admin', 1, 50);
    });

    it('throws 400 when role is empty', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.listUsersByRole('', 1, 50, VALID_SECRET),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws 400 when role is not a string', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.listUsersByRole(123 as unknown as string, 1, 50, VALID_SECRET),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws 403 for missing secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.listUsersByRole('admin', 1, 50, ''),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws 403 for wrong secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.listUsersByRole('admin', 1, 50, 'wrong'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── feature 235: getUserByEmail endpoint ──────────────────────────────────

  describe('getUserByEmail (GET /admin/users/by-email)', () => {
    const user = {
      id:          'u1',
      displayName: 'A User',
      email:       'a@example.com',
      firstName:   'A',
      secondName:  null,
      lastName:    'User',
      role:        'user',
      createdAt:   new Date('2026-01-01T00:00:00.000Z'),
    };

    it('returns the matching user profile', async () => {
      const adminService = makeAdminService();
      adminService.getByEmail.mockResolvedValue(user);
      const controller = await createController(adminService);

      const result = await controller.getUserByEmail('a@example.com', VALID_SECRET);

      expect(adminService.getByEmail).toHaveBeenCalledWith('a@example.com');
      expect(result).toEqual(user);
    });

    it('throws 404 when no user matches', async () => {
      const adminService = makeAdminService();
      adminService.getByEmail.mockResolvedValue(null);
      const controller = await createController(adminService);

      await expect(
        controller.getUserByEmail('ghost@example.com', VALID_SECRET),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 400 when email param is empty', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.getUserByEmail('', VALID_SECRET),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws 400 when email param is not a string', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.getUserByEmail(123 as unknown as string, VALID_SECRET),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws 403 for missing secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.getUserByEmail('a@example.com', ''),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws 403 for wrong secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.getUserByEmail('a@example.com', 'wrong'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── feature 235: grantAdminRole endpoint ──────────────────────────────────

  const ACTOR_UUID = '11111111-2222-3333-4444-555555555555';

  describe('grantAdminRole (POST /admin/users/:id/admin-role)', () => {
    const promoted = {
      id:          'u1',
      displayName: 'Promoted',
      email:       'p@ex.com',
      firstName:   'P',
      secondName:  null,
      lastName:    'Romoted',
      role:        'admin',
      createdAt:   new Date('2026-01-01T00:00:00.000Z'),
    };

    it('delegates to service and returns the updated profile', async () => {
      const adminService = makeAdminService();
      adminService.grantAdminRole.mockResolvedValue(promoted);
      const controller = await createController(adminService);

      const result = await controller.grantAdminRole(
        'u1',
        { actorUserId: ACTOR_UUID },
        VALID_SECRET,
      );

      expect(adminService.grantAdminRole).toHaveBeenCalledWith('u1', ACTOR_UUID);
      expect(result).toEqual(promoted);
    });

    it('propagates NotFoundException from the service', async () => {
      const adminService = makeAdminService();
      adminService.grantAdminRole.mockRejectedValue(new NotFoundException('User u1 not found'));
      const controller = await createController(adminService);

      await expect(
        controller.grantAdminRole('u1', { actorUserId: ACTOR_UUID }, VALID_SECRET),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 403 for missing secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.grantAdminRole('u1', { actorUserId: ACTOR_UUID }, ''),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws 403 for wrong secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.grantAdminRole('u1', { actorUserId: ACTOR_UUID }, 'wrong'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── feature 235: revokeAdminRole endpoint ─────────────────────────────────

  describe('revokeAdminRole (DELETE /admin/users/:id/admin-role)', () => {
    const demoted = {
      id:          'u1',
      displayName: 'Demoted',
      email:       'd@ex.com',
      firstName:   'D',
      secondName:  null,
      lastName:    'Emoted',
      role:        'user',
      createdAt:   new Date('2026-01-01T00:00:00.000Z'),
    };

    it('delegates to service and returns the updated profile', async () => {
      const adminService = makeAdminService();
      adminService.revokeAdminRole.mockResolvedValue(demoted);
      const controller = await createController(adminService);

      const result = await controller.revokeAdminRole(
        'u1',
        { actorUserId: ACTOR_UUID },
        VALID_SECRET,
      );

      expect(adminService.revokeAdminRole).toHaveBeenCalledWith('u1', ACTOR_UUID);
      expect(result).toEqual(demoted);
    });

    it('maps LastAdminError to 400 with code=LAST_ADMIN', async () => {
      const adminService = makeAdminService();
      adminService.revokeAdminRole.mockRejectedValue(new LastAdminError());
      const controller = await createController(adminService);

      await expect(
        controller.revokeAdminRole('u1', { actorUserId: ACTOR_UUID }, VALID_SECRET),
      ).rejects.toMatchObject({
        response: { code: 'LAST_ADMIN', message: expect.stringContaining('last remaining') },
        status:   400,
      });
    });

    it('maps CannotSelfDemoteError to 400 with code=CANNOT_SELF_DEMOTE', async () => {
      const adminService = makeAdminService();
      adminService.revokeAdminRole.mockRejectedValue(new CannotSelfDemoteError());
      const controller = await createController(adminService);

      await expect(
        controller.revokeAdminRole(ACTOR_UUID, { actorUserId: ACTOR_UUID }, VALID_SECRET),
      ).rejects.toMatchObject({
        response: { code: 'CANNOT_SELF_DEMOTE', message: expect.stringContaining('own Admin') },
        status:   400,
      });
    });

    it('propagates unknown errors from the service unchanged', async () => {
      const adminService = makeAdminService();
      const boom = new Error('unexpected');
      adminService.revokeAdminRole.mockRejectedValue(boom);
      const controller = await createController(adminService);

      await expect(
        controller.revokeAdminRole('u1', { actorUserId: ACTOR_UUID }, VALID_SECRET),
      ).rejects.toBe(boom);
    });

    it('propagates NotFoundException from the service', async () => {
      const adminService = makeAdminService();
      adminService.revokeAdminRole.mockRejectedValue(new NotFoundException('User u1 not found'));
      const controller = await createController(adminService);

      await expect(
        controller.revokeAdminRole('u1', { actorUserId: ACTOR_UUID }, VALID_SECRET),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 403 for missing secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.revokeAdminRole('u1', { actorUserId: ACTOR_UUID }, ''),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws 403 for wrong secret', async () => {
      const controller = await createController(makeAdminService());

      await expect(
        controller.revokeAdminRole('u1', { actorUserId: ACTOR_UUID }, 'wrong'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
