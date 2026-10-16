import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, ILike, Repository } from 'typeorm';
import { ROLE_ADMIN, ROLE_USER, UserEntity } from '../entities/user.entity.js';
import { AuditService } from '../audit.service.js';
import { computeDisplayName } from '../utils/display-name.js';
import type { UpdateUserNameDto } from './update-user-name.dto.js';

export interface AdminUserProfile {
  id: string;
  displayName: string | null;
  email: string;
  firstName: string | null;
  secondName: string | null;
  lastName: string | null;
  /** Canonical role value (e.g. 'user', 'admin'). Surfaced for feature 235. */
  role: string;
  /**
   * Account creation timestamp surfaced for admin user listings
   * "days since joined" engagement metric. Read-only.
   */
  createdAt: Date;
}

export interface AdminUserSearchResponse {
  data: AdminUserProfile[];
  total: number;
  page: number;
  pageSize: number;
}

/** Thrown when revoke would empty the Admin set (FR-012). */
export class LastAdminError extends Error {
  readonly code = 'LAST_ADMIN' as const;
  constructor() {
    super('Cannot remove the last remaining Admin.');
    this.name = 'LastAdminError';
  }
}

/** Thrown when the actor tries to remove their own Admin role (FR-013). */
export class CannotSelfDemoteError extends Error {
  readonly code = 'CANNOT_SELF_DEMOTE' as const;
  constructor() {
    super('An Admin cannot remove their own Admin role.');
    this.name = 'CannotSelfDemoteError';
  }
}

const USER_SELECT = ['id', 'displayName', 'firstName', 'secondName', 'lastName', 'email', 'role', 'createdAt'] as const;

function toProfile(u: UserEntity): AdminUserProfile {
  return {
    id: u.id,
    displayName: u.displayName ?? null,
    email: u.email,
    firstName: u.firstName ?? null,
    secondName: u.secondName ?? null,
    lastName: u.lastName ?? null,
    role: u.role,
    createdAt: u.createdAt,
  };
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly auditService: AuditService,
  ) {}

  async searchUsers(
    q: string,
    page: number,
    pageSize: number,
  ): Promise<AdminUserSearchResponse> {
    const pattern = `%${q}%`;
    const [users, total] = await this.userRepo.findAndCount({
      where: [
        { firstName: ILike(pattern) },
        { secondName: ILike(pattern) },
        { lastName: ILike(pattern) },
        { email: ILike(pattern) },
      ],
      select: [...USER_SELECT],
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { displayName: 'ASC' },
    });

    return { data: users.map(toProfile), total, page, pageSize };
  }

  async getUserById(id: string): Promise<AdminUserProfile | null> {
    const user = await this.userRepo.findOne({
      where: { id },
      select: [...USER_SELECT],
    });
    if (!user) return null;
    return toProfile(user);
  }

  async getUsersByIds(ids: string[]): Promise<AdminUserProfile[]> {
    if (ids.length === 0) return [];
    const users = await this.userRepo
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.displayName',
        'user.firstName',
        'user.secondName',
        'user.lastName',
        'user.email',
        'user.role',
        'user.createdAt',
      ])
      .where('user.id IN (:...ids)', { ids })
      .getMany();
    return users.map(toProfile);
  }

  async patchUser(id: string, dto: UpdateUserNameDto): Promise<AdminUserProfile> {
    const user = await this.userRepo.findOne({ where: { id }, select: [...USER_SELECT] });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    if (dto.firstName !== undefined) user.firstName = dto.firstName || undefined;
    if (dto.secondName !== undefined) user.secondName = dto.secondName || undefined;
    if (dto.lastName !== undefined) user.lastName = dto.lastName || undefined;

    // Recompute displayName from the updated structured fields.
    const recomputed = computeDisplayName(
      user.firstName ?? null,
      user.secondName ?? null,
      user.lastName ?? null,
    );
    if (recomputed !== null) user.displayName = recomputed;

    await this.userRepo.save(user);
    return toProfile(user);
  }

  // ── feature 235: Admin role management ────────────────────────────────────

  /**
   * List users filtered by exact role value. Used by the Roles page to render
   * the current Admin set.
   */
  async listUsersByRole(
    role: string,
    page: number,
    pageSize: number,
  ): Promise<AdminUserSearchResponse> {
    const [users, total] = await this.userRepo.findAndCount({
      where: { role },
      select: [...USER_SELECT],
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { displayName: 'ASC' },
    });
    return { data: users.map(toProfile), total, page, pageSize };
  }

  /**
   * Lookup a user by exact email (case-insensitive). Returns null when no
   * row matches.
   */
  async getByEmail(email: string): Promise<AdminUserProfile | null> {
    const user = await this.userRepo.findOne({
      where: { email: ILike(email) },
      select: [...USER_SELECT],
    });
    return user ? toProfile(user) : null;
  }

  /**
   * Grant the Admin role. Idempotent: returns the profile with no change
   * (and writes no audit row) when the user is already an Admin.
   */
  async grantAdminRole(
    targetUserId: string,
    actorUserId: string,
  ): Promise<AdminUserProfile> {
    const user = await this.userRepo.findOne({
      where: { id: targetUserId },
      select: [...USER_SELECT],
    });
    if (!user) throw new NotFoundException(`User ${targetUserId} not found`);

    if (user.role === ROLE_ADMIN) {
      return toProfile(user);
    }

    const fromRole = user.role;
    user.role = ROLE_ADMIN;
    await this.userRepo.save(user);

    await this.auditService.logEvent(
      'ROLE_CHANGE',
      actorUserId === 'rollout-migration' ? null : actorUserId,
      '127.0.0.1', // the calling admin client populates this from the actor's request
      'internal',
      'success',
      {
        targetUserId,
        fromRole,
        toRole: ROLE_ADMIN,
        actorUserId,
      },
    );

    return toProfile(user);
  }

  /**
   * Revoke the Admin role inside a transaction.
   *
   * Enforces, atomically:
   *   - FR-013: the target MUST NOT be the actor (`CannotSelfDemoteError`)
   *   - FR-012: removing this Admin MUST NOT empty the Admin set
   *             (`LastAdminError`)
   *
   * Idempotent: a target that is already non-Admin returns the profile with
   * no role change and no audit row.
   */
  async revokeAdminRole(
    targetUserId: string,
    actorUserId: string,
  ): Promise<AdminUserProfile> {
    if (targetUserId === actorUserId) {
      throw new CannotSelfDemoteError();
    }

    const result = await this.userRepo.manager.transaction(async (tx: EntityManager) => {
      const userRepo = tx.getRepository(UserEntity);

      const user = await userRepo.findOne({
        where: { id: targetUserId },
        select: [...USER_SELECT],
      });
      if (!user) throw new NotFoundException(`User ${targetUserId} not found`);

      if (user.role !== ROLE_ADMIN) {
        // Idempotent no-op.
        return { user, changed: false };
      }

      // Count admins INCLUDING the target row; if it's the only one, refuse.
      const adminCount = await userRepo.count({ where: { role: ROLE_ADMIN } });
      if (adminCount <= 1) {
        throw new LastAdminError();
      }

      user.role = ROLE_USER;
      await userRepo.save(user);

      return { user, changed: true };
    });

    if (result.changed) {
      await this.auditService.logEvent(
        'ROLE_CHANGE',
        actorUserId === 'rollout-migration' ? null : actorUserId,
        '127.0.0.1',
        'internal',
        'success',
        {
          targetUserId,
          fromRole: ROLE_ADMIN,
          toRole:   ROLE_USER,
          actorUserId,
        },
      );
    }

    return toProfile(result.user);
  }
}
