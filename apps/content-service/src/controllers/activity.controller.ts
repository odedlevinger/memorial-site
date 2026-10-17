import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireRole, RolesGuard } from '../guards/roles.guard.js';
import type { ActivityView } from '../interfaces/content.interfaces.js';
import { ActivityService, MAX_DAYS } from '../services/activity.service.js';

@ApiTags('activity (back office)')
@Controller('content/activity')
@UseGuards(RolesGuard)
@RequireRole('editor')
@ApiResponse({ status: 401, description: 'Not signed in' })
@ApiResponse({ status: 403, description: 'Not an editor' })
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @ApiOperation({ summary: 'Signed-in people per day (each person once a day), ending today' })
  @ApiQuery({ name: 'days', required: false, description: `how many days, 1–${MAX_DAYS} (default 30)` })
  @ApiResponse({ status: 200, description: 'Daily counts, oldest first, plus different people over the period' })
  @ApiResponse({ status: 400, description: 'days out of range' })
  daily(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number): Promise<ActivityView> {
    return this.activity.daily(days);
  }
}
