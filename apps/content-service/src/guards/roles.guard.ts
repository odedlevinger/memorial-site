import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Caller, Role } from '../interfaces/content.interfaces.js';
import { RolesService } from '../services/roles.service.js';

const ROLE_KEY = 'content:minRole';
const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CallerRequest = Request & { caller?: Caller };

/** Minimum role for a handler/controller. Without it, any signed-in caller passes. */
export const RequireRole = (role: Role): MethodDecorator & ClassDecorator => SetMetadata(ROLE_KEY, role);

/** The resolved caller (set by RolesGuard). */
export const CurrentCaller = createParamDecorator((_: unknown, ctx: ExecutionContext): Caller => {
  return (ctx.switchToHttp().getRequest<CallerRequest>().caller as Caller);
});

/**
 * Trusts X-User-Id because content-service only accepts traffic from Kong, which
 * strips any client-supplied value and injects the session-verified user id.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly roles: RolesService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<CallerRequest>();
    const userId = req.header('x-user-id');
    if (!userId || !UUID.test(userId)) throw new UnauthorizedException('Sign in required');
    const caller = await this.roles.resolve(userId);
    req.caller = caller;
    const needed = this.reflector.getAllAndOverride<Role | undefined>(ROLE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (needed && RANK[caller.role] < RANK[needed]) throw new ForbiddenException(`Requires ${needed} access`);
    return true;
  }
}
