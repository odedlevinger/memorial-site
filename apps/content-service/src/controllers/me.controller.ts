import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentCaller, RolesGuard } from '../guards/roles.guard.js';
import type { Caller, Role } from '../interfaces/content.interfaces.js';

@ApiTags('me')
@Controller('content')
@UseGuards(RolesGuard)
export class MeController {
  @Get('me')
  @ApiOperation({ summary: 'The signed-in caller’s back-office role' })
  @ApiResponse({ status: 200, description: '{ email, role } where role is owner | editor | viewer' })
  @ApiResponse({ status: 401, description: 'Not signed in' })
  me(@CurrentCaller() caller: Caller): { email: string; role: Role } {
    return { email: caller.email, role: caller.role };
  }
}
