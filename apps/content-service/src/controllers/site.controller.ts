import { BadRequestException, Body, Controller, Delete, Get, Put, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UpdateSiteDto } from '../dto/content.dto.js';
import { CurrentCaller, RequireRole, RolesGuard } from '../guards/roles.guard.js';
import type { Caller, SiteView } from '../interfaces/content.interfaces.js';
import { MAX_UPLOAD_BYTES } from '../services/images.service.js';
import { LanguagesService } from '../services/languages.service.js';
import { SiteService } from '../services/site.service.js';

@ApiTags('site (back office)')
@Controller('content/site')
@UseGuards(RolesGuard)
@RequireRole('editor')
@ApiResponse({ status: 401, description: 'Not signed in' })
@ApiResponse({ status: 403, description: 'Not an editor' })
export class SiteController {
  constructor(
    private readonly site: SiteService,
    private readonly languages: LanguagesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Site title, tagline and home page layout, with every language’s text' })
  @ApiResponse({ status: 200, description: 'Site settings with translations' })
  async get(): Promise<SiteView> {
    return this.site.get(await this.languages.context(undefined, true), true);
  }

  @Put()
  @ApiOperation({ summary: 'Change the site title and tagline in one language, and the galleries in each home page row' })
  @ApiQuery({ name: 'lang', required: false, description: 'language code; defaults to the default language' })
  @ApiResponse({ status: 200, description: 'Updated site settings' })
  @ApiResponse({ status: 400, description: 'Validation error / unknown language' })
  async update(@Body() dto: UpdateSiteDto, @CurrentCaller() caller: Caller, @Query('lang') lang?: string): Promise<SiteView> {
    return this.site.update(dto.title, dto.tagline, dto.homeRows, caller, await this.languages.context(lang, true));
  }

  @Put('share-image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Set the picture shown when a link to the site is shared (JPEG/PNG/WebP, ≤ 20 MB)' })
  @ApiResponse({ status: 200, description: 'Updated site settings' })
  @ApiResponse({ status: 400, description: 'No file / unsupported or oversized image' })
  async setShareImage(@UploadedFile() file: Express.Multer.File | undefined, @CurrentCaller() caller: Caller): Promise<SiteView> {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.site.setShareImage(file.buffer, caller, await this.languages.context(undefined, true));
  }

  @Delete('share-image')
  @ApiOperation({ summary: 'Remove the link-preview picture' })
  @ApiResponse({ status: 200, description: 'Updated site settings' })
  async removeShareImage(@CurrentCaller() caller: Caller): Promise<SiteView> {
    return this.site.removeShareImage(caller, await this.languages.context(undefined, true));
  }
}
