import { Body, Controller, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UpdateSiteDto } from '../dto/content.dto.js';
import { CurrentCaller, RequireRole, RolesGuard } from '../guards/roles.guard.js';
import type { Caller, SiteView } from '../interfaces/content.interfaces.js';
import { SiteService } from '../services/site.service.js';

@ApiTags('site (back office)')
@Controller('content/site')
@UseGuards(RolesGuard)
@RequireRole('editor')
@ApiResponse({ status: 401, description: 'Not signed in' })
@ApiResponse({ status: 403, description: 'Not an editor' })
export class SiteController {
  constructor(private readonly site: SiteService) {}

  @Put()
  @ApiOperation({ summary: 'Change the site title and tagline' })
  @ApiResponse({ status: 200, description: 'Updated site settings' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  update(@Body() dto: UpdateSiteDto, @CurrentCaller() caller: Caller): Promise<SiteView> {
    return this.site.update(dto.title, dto.tagline, caller);
  }
}
