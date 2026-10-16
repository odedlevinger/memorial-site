import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AdminService,
  CannotSelfDemoteError,
  LastAdminError,
} from './admin.service.js';
import type { AdminUserProfile, AdminUserSearchResponse } from './admin.service.js';
import { UpdateUserNameDto } from './update-user-name.dto.js';
import { GrantRevokeRequestDto } from './role-management.dto.js';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly configService: ConfigService,
  ) {}

  @Get('users/search')
  @ApiOperation({ summary: 'Search users by display name (internal — requires X-Admin-Secret)' })
  @ApiQuery({ name: 'q', required: true, description: 'Partial name (min 2 chars)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Matching users' })
  @ApiResponse({ status: 400, description: 'Query too short' })
  @ApiResponse({ status: 403, description: 'Invalid or missing X-Admin-Secret' })
  async searchUsers(
    @Query('q') q: string,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 50,
    @Headers('x-admin-secret') secret: string,
  ): Promise<AdminUserSearchResponse> {
    this.assertSecret(secret);
    if (!q || q.length < 2) {
      throw new BadRequestException('Query must be at least 2 characters');
    }
    const pg = Number(page);
    const ps = Math.min(Number(pageSize), 50);
    return this.adminService.searchUsers(q, pg, ps);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user profile by UUID (internal — requires X-Admin-Secret)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User profile' })
  @ApiResponse({ status: 403, description: 'Invalid or missing X-Admin-Secret' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(
    @Param('id') id: string,
    @Headers('x-admin-secret') secret: string,
  ): Promise<AdminUserProfile> {
    this.assertSecret(secret);
    const user = await this.adminService.getUserById(id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  @Post('users/batch')
  @ApiOperation({ summary: 'Get multiple user profiles by IDs (internal — requires X-Admin-Secret)' })
  @ApiResponse({ status: 200, description: 'Array of found user profiles' })
  @ApiResponse({ status: 400, description: 'ids must be a non-empty array' })
  @ApiResponse({ status: 403, description: 'Invalid or missing X-Admin-Secret' })
  async getUsersByIds(
    @Body() body: { ids: string[] },
    @Headers('x-admin-secret') secret: string,
  ): Promise<{ users: AdminUserProfile[] }> {
    this.assertSecret(secret);
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      throw new BadRequestException('ids must be a non-empty array');
    }
    const users = await this.adminService.getUsersByIds(body.ids);
    return { users };
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update user name fields (internal — requires X-Admin-Secret)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Updated user profile' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Invalid or missing X-Admin-Secret' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async patchUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserNameDto,
    @Headers('x-admin-secret') secret: string,
  ): Promise<AdminUserProfile> {
    this.assertSecret(secret);
    return this.adminService.patchUser(id, dto);
  }

  // ── feature 235: Admin role management ────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List users filtered by role (internal — requires X-Admin-Secret)' })
  @ApiQuery({ name: 'role', required: true, description: "Exact role value, e.g. 'admin'" })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Page of matching users' })
  @ApiResponse({ status: 400, description: 'Invalid query' })
  @ApiResponse({ status: 403, description: 'Invalid or missing X-Admin-Secret' })
  async listUsersByRole(
    @Query('role') role: string,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 50,
    @Headers('x-admin-secret') secret: string,
  ): Promise<AdminUserSearchResponse> {
    this.assertSecret(secret);
    if (!role || typeof role !== 'string') {
      throw new BadRequestException('role query parameter is required');
    }
    const pg = Math.max(1, Number(page) || 1);
    const ps = Math.min(50, Math.max(1, Number(pageSize) || 50));
    return this.adminService.listUsersByRole(role, pg, ps);
  }

  @Get('users/by-email')
  @ApiOperation({ summary: 'Lookup user by exact email (internal — requires X-Admin-Secret)' })
  @ApiQuery({ name: 'email', required: true })
  @ApiResponse({ status: 200, description: 'User profile' })
  @ApiResponse({ status: 400, description: 'Email query parameter required' })
  @ApiResponse({ status: 403, description: 'Invalid or missing X-Admin-Secret' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserByEmail(
    @Query('email') email: string,
    @Headers('x-admin-secret') secret: string,
  ): Promise<AdminUserProfile> {
    this.assertSecret(secret);
    if (!email || typeof email !== 'string') {
      throw new BadRequestException('email query parameter is required');
    }
    const user = await this.adminService.getByEmail(email);
    if (!user) throw new NotFoundException(`User with email ${email} not found`);
    return user;
  }

  @Post('users/:id/admin-role')
  @ApiOperation({ summary: 'Grant the Admin role to a user (internal — requires X-Admin-Secret)' })
  @ApiParam({ name: 'id', description: 'Target user UUID' })
  @ApiResponse({ status: 200, description: 'User now has the Admin role' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Invalid or missing X-Admin-Secret' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async grantAdminRole(
    @Param('id') id: string,
    @Body() dto: GrantRevokeRequestDto,
    @Headers('x-admin-secret') secret: string,
  ): Promise<AdminUserProfile> {
    this.assertSecret(secret);
    return this.adminService.grantAdminRole(id, dto.actorUserId);
  }

  @Delete('users/:id/admin-role')
  @ApiOperation({ summary: 'Revoke the Admin role from a user (internal — requires X-Admin-Secret)' })
  @ApiParam({ name: 'id', description: 'Target user UUID' })
  @ApiResponse({ status: 200, description: 'User no longer has the Admin role' })
  @ApiResponse({
    status: 400,
    description: 'LAST_ADMIN or CANNOT_SELF_DEMOTE',
  })
  @ApiResponse({ status: 403, description: 'Invalid or missing X-Admin-Secret' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async revokeAdminRole(
    @Param('id') id: string,
    @Body() dto: GrantRevokeRequestDto,
    @Headers('x-admin-secret') secret: string,
  ): Promise<AdminUserProfile> {
    this.assertSecret(secret);
    try {
      return await this.adminService.revokeAdminRole(id, dto.actorUserId);
    } catch (err) {
      if (err instanceof LastAdminError) {
        throw new BadRequestException({ code: err.code, message: err.message });
      }
      if (err instanceof CannotSelfDemoteError) {
        throw new BadRequestException({ code: err.code, message: err.message });
      }
      throw err;
    }
  }

  private assertSecret(secret: string): void {
    const expected = this.configService.get<string>('ADMIN_SECRET');
    if (!expected || secret !== expected) {
      throw new ForbiddenException('Invalid or missing X-Admin-Secret');
    }
  }
}
