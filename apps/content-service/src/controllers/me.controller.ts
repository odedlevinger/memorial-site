import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentCaller, RolesGuard } from '../guards/roles.guard.js';
import type { Caller, Role } from '../interfaces/content.interfaces.js';
import { ActivityService } from '../services/activity.service.js';

@ApiTags('me')
@Controller('content')
@UseGuards(RolesGuard)
export class MeController {
  constructor(private readonly activity: ActivityService) {}

  @Get('me')
  @ApiOperation({
    summary: 'The signed-in caller’s back-office role',
    description: 'Also notes that the caller used the site today (once per person per day) for the activity chart.',
  })
  @ApiResponse({ status: 200, description: '{ email, role } where role is owner | editor | viewer' })
  @ApiResponse({ status: 401, description: 'Not signed in' })
  async me(@CurrentCaller() caller: Caller): Promise<{ email: string; role: Role }> {
    await this.activity.record(caller.userId);
    return { email: caller.email, role: caller.role };
  }
}
