import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrderDto, UpdatePictureDto } from '../dto/content.dto.js';
import { CurrentCaller, RequireRole, RolesGuard } from '../guards/roles.guard.js';
import type { Caller, PictureView } from '../interfaces/content.interfaces.js';
import { MAX_UPLOAD_BYTES } from '../services/images.service.js';
import { LanguagesService } from '../services/languages.service.js';
import { PicturesService } from '../services/pictures.service.js';

const MAX_FILES = 50;
const limits = { fileSize: MAX_UPLOAD_BYTES };

@ApiTags('pictures (back office)')
@Controller('content')
@UseGuards(RolesGuard)
@RequireRole('editor')
@ApiResponse({ status: 401, description: 'Not signed in' })
@ApiResponse({ status: 403, description: 'Not an editor' })
@ApiQuery({ name: 'lang', required: false, description: 'language to read / write caption, date, place and story in; defaults to the default language' })
export class PicturesController {
  constructor(
    private readonly pictures: PicturesService,
    private readonly languages: LanguagesService,
  ) {}

  @Post('topics/:id/pictures')
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, { limits }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } } } })
  @ApiOperation({ summary: 'Upload pictures (JPEG/PNG/WebP, ≤ 20 MB each) to the end of a topic, as drafts' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Created pictures' })
  @ApiResponse({ status: 400, description: 'No files / unsupported or oversized image' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  async upload(
    @Param('id', ParseUUIDPipe) topicId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentCaller() caller: Caller,
    @Query('lang') lang?: string,
  ): Promise<PictureView[]> {
    return this.pictures.upload(topicId, (files ?? []).map((f) => f.buffer), caller, await this.languages.context(lang, true));
  }

  @Put('topics/:id/pictures/order')
  @ApiOperation({ summary: 'Reorder a topic’s pictures — body lists every picture id once' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Reordered pictures' })
  @ApiResponse({ status: 400, description: 'ids do not match the topic’s pictures' })
  async reorder(
    @Param('id', ParseUUIDPipe) topicId: string,
    @Body() dto: OrderDto,
    @CurrentCaller() caller: Caller,
    @Query('lang') lang?: string,
  ): Promise<PictureView[]> {
    return this.pictures.reorder(topicId, dto.ids, caller, await this.languages.context(lang, true));
  }

  @Patch('pictures/:id')
  @ApiOperation({ summary: 'Edit caption, date, place, story, status, or move to another topic' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated picture' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Picture or target topic not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePictureDto,
    @CurrentCaller() caller: Caller,
    @Query('lang') lang?: string,
  ): Promise<PictureView> {
    return this.pictures.update(id, dto, caller, await this.languages.context(lang, true));
  }

  @Put('pictures/:id/image')
  @UseInterceptors(FileInterceptor('file', { limits }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Replace a picture’s image, keeping its captions' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated picture' })
  @ApiResponse({ status: 400, description: 'No file / unsupported or oversized image' })
  @ApiResponse({ status: 404, description: 'Picture not found' })
  async replaceImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentCaller() caller: Caller,
    @Query('lang') lang?: string,
  ): Promise<PictureView> {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.pictures.replaceImage(id, file.buffer, caller, await this.languages.context(lang, true));
  }

  @Delete('pictures/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a picture' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Picture not found' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentCaller() caller: Caller): Promise<void> {
    return this.pictures.remove(id, caller);
  }
}
