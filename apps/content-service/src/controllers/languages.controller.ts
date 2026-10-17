import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateLanguageDto, UpdateLanguageDto } from '../dto/content.dto.js';
import { CurrentCaller, RequireRole, RolesGuard } from '../guards/roles.guard.js';
import type { Caller, LanguageView } from '../interfaces/content.interfaces.js';
import { LanguagesService } from '../services/languages.service.js';

/** The site's languages. The list itself is public: GET /content/public/languages. */
@ApiTags('languages (back office)')
@Controller('content/languages')
@UseGuards(RolesGuard)
@RequireRole('editor')
@ApiResponse({ status: 401, description: 'Not signed in' })
@ApiResponse({ status: 403, description: 'Not an editor' })
export class LanguagesController {
  constructor(private readonly languages: LanguagesService) {}

  @Post()
  @ApiOperation({ summary: 'Offer the site in another language (added last, not default)' })
  @ApiResponse({ status: 201, description: 'Updated language list' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Language already on the site' })
  add(@Body() dto: CreateLanguageDto, @CurrentCaller() caller: Caller): Promise<LanguageView[]> {
    return this.languages.add(dto, caller);
  }

  @Patch(':code')
  @ApiOperation({ summary: 'Rename a language, set its direction or labels, or make it the default' })
  @ApiParam({ name: 'code', example: 'he' })
  @ApiResponse({ status: 200, description: 'Updated language list' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Language not found' })
  update(@Param('code') code: string, @Body() dto: UpdateLanguageDto, @CurrentCaller() caller: Caller): Promise<LanguageView[]> {
    return this.languages.update(code, dto, caller);
  }

  @Delete(':code')
  @ApiOperation({ summary: 'Stop offering a language (its translations are kept, in case it is added back)' })
  @ApiParam({ name: 'code', example: 'he' })
  @ApiResponse({ status: 200, description: 'Updated language list' })
  @ApiResponse({ status: 400, description: 'Cannot remove the default language' })
  @ApiResponse({ status: 404, description: 'Language not found' })
  remove(@Param('code') code: string, @CurrentCaller() caller: Caller): Promise<LanguageView[]> {
    return this.languages.remove(code, caller);
  }
}
