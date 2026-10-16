import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AddEditorDto } from '../dto/content.dto.js';
import { CurrentCaller, RequireRole, RolesGuard } from '../guards/roles.guard.js';
import type { Caller } from '../interfaces/content.interfaces.js';
import { EditorsService, type EditorView } from '../services/editors.service.js';

@ApiTags('editors (owner)')
@Controller('content/editors')
@UseGuards(RolesGuard)
@RequireRole('owner')
@ApiResponse({ status: 401, description: 'Not signed in' })
@ApiResponse({ status: 403, description: 'Not an owner' })
export class EditorsController {
  constructor(private readonly editors: EditorsService) {}

  @Get()
  @ApiOperation({ summary: 'List invited editors' })
  @ApiResponse({ status: 200, description: 'Editor list' })
  list(): Promise<EditorView[]> {
    return this.editors.list();
  }

  @Post()
  @ApiOperation({ summary: 'Invite an editor by Google account email (idempotent)' })
  @ApiResponse({ status: 201, description: 'Updated editor list' })
  @ApiResponse({ status: 400, description: 'Invalid email / already an owner' })
  add(@Body() dto: AddEditorDto, @CurrentCaller() caller: Caller): Promise<EditorView[]> {
    return this.editors.add(dto.email, caller);
  }

  @Delete(':email')
  @ApiOperation({ summary: 'Remove an editor' })
  @ApiParam({ name: 'email' })
  @ApiResponse({ status: 200, description: 'Updated editor list' })
  @ApiResponse({ status: 404, description: 'Not an editor' })
  remove(@Param('email') email: string, @CurrentCaller() caller: Caller): Promise<EditorView[]> {
    return this.editors.remove(email, caller);
  }
}
