import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UpdatePageDto } from '../dto/content.dto.js';
import { CurrentCaller, RequireRole, RolesGuard } from '../guards/roles.guard.js';
import { type Caller, PAGE_SLUGS, type PageView } from '../interfaces/content.interfaces.js';
import { PagesService } from '../services/pages.service.js';

@ApiTags('pages (back office)')
@Controller('content/pages')
@UseGuards(RolesGuard)
@RequireRole('editor')
@ApiResponse({ status: 401, description: 'Not signed in' })
@ApiResponse({ status: 403, description: 'Not an editor' })
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Put(':slug')
  @ApiOperation({ summary: 'Replace the text of the About or Contact page' })
  @ApiParam({ name: 'slug', enum: PAGE_SLUGS })
  @ApiResponse({ status: 200, description: 'Updated page' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'No such page' })
  update(@Param('slug') slug: string, @Body() dto: UpdatePageDto, @CurrentCaller() caller: Caller): Promise<PageView> {
    return this.pages.update(slug, dto.body, caller);
  }
}
