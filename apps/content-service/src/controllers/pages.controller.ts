import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UpdatePageDto } from '../dto/content.dto.js';
import { CurrentCaller, RequireRole, RolesGuard } from '../guards/roles.guard.js';
import { type Caller, PAGE_SLUGS, type PageView } from '../interfaces/content.interfaces.js';
import { LanguagesService } from '../services/languages.service.js';
import { PagesService } from '../services/pages.service.js';

@ApiTags('pages (back office)')
@Controller('content/pages')
@UseGuards(RolesGuard)
@RequireRole('editor')
@ApiResponse({ status: 401, description: 'Not signed in' })
@ApiResponse({ status: 403, description: 'Not an editor' })
export class PagesController {
  constructor(
    private readonly pages: PagesService,
    private readonly languages: LanguagesService,
  ) {}

  @Get(':slug')
  @ApiOperation({ summary: 'The About or Contact page with every language’s text' })
  @ApiParam({ name: 'slug', enum: PAGE_SLUGS })
  @ApiResponse({ status: 200, description: 'Page with translations' })
  @ApiResponse({ status: 404, description: 'No such page' })
  async get(@Param('slug') slug: string): Promise<PageView> {
    return this.pages.get(slug, await this.languages.context(undefined, true), true);
  }

  @Put(':slug')
  @ApiOperation({ summary: 'Replace the text of the About or Contact page in one language' })
  @ApiParam({ name: 'slug', enum: PAGE_SLUGS })
  @ApiQuery({ name: 'lang', required: false, description: 'language code; defaults to the default language' })
  @ApiResponse({ status: 200, description: 'Updated page' })
  @ApiResponse({ status: 400, description: 'Validation error / unknown language' })
  @ApiResponse({ status: 404, description: 'No such page' })
  async update(
    @Param('slug') slug: string,
    @Body() dto: UpdatePageDto,
    @CurrentCaller() caller: Caller,
    @Query('lang') lang?: string,
  ): Promise<PageView> {
    return this.pages.update(slug, dto.body, caller, await this.languages.context(lang, true));
  }
}
