import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateTopicDto, OrderDto, SetVideoDto, UpdateTopicDto, VideoUploadDto } from '../dto/content.dto.js';
import { CurrentCaller, RequireRole, RolesGuard } from '../guards/roles.guard.js';
import type { Caller, TopicDetailView, TopicView, VideoUploadView } from '../interfaces/content.interfaces.js';
import { LanguagesService } from '../services/languages.service.js';
import { TopicsService } from '../services/topics.service.js';

@ApiTags('topics (back office)')
@Controller('content/topics')
@UseGuards(RolesGuard)
@RequireRole('editor')
@ApiResponse({ status: 401, description: 'Not signed in' })
@ApiResponse({ status: 403, description: 'Not an editor' })
@ApiQuery({ name: 'lang', required: false, description: 'language to read / write title and description in; defaults to the default language' })
export class TopicsController {
  constructor(
    private readonly topics: TopicsService,
    private readonly languages: LanguagesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'All topics, drafts included, in display order' })
  @ApiResponse({ status: 200, description: 'Topic list' })
  async list(@Query('lang') lang?: string): Promise<TopicView[]> {
    return this.topics.listAll(await this.languages.context(lang, true));
  }

  @Put('order')
  @ApiOperation({ summary: 'Reorder topics — body lists every topic id once' })
  @ApiResponse({ status: 200, description: 'Reordered topic list' })
  @ApiResponse({ status: 400, description: 'ids do not match the topic set' })
  async reorder(@Body() dto: OrderDto, @CurrentCaller() caller: Caller, @Query('lang') lang?: string): Promise<TopicView[]> {
    return this.topics.reorder(dto.ids, caller, await this.languages.context(lang, true));
  }

  @Get(':id')
  @ApiOperation({ summary: 'One topic with all its pictures' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Topic with pictures' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  async get(@Param('id', ParseUUIDPipe) id: string, @Query('lang') lang?: string): Promise<TopicDetailView> {
    return this.topics.getAny(id, await this.languages.context(lang, true));
  }

  @Post()
  @ApiOperation({ summary: 'Create a topic — a picture set, text, book or movie page (starts as draft, added last)' })
  @ApiResponse({ status: 201, description: 'Created topic' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(@Body() dto: CreateTopicDto, @CurrentCaller() caller: Caller, @Query('lang') lang?: string): Promise<TopicDetailView> {
    return this.topics.create(dto, caller, await this.languages.context(lang, true));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit title, slug, description, page kind, text, book details, movie link, pictures per row, cover or publish status' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated topic' })
  @ApiResponse({ status: 400, description: 'Validation error / cover not in topic / unknown language' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  @ApiResponse({ status: 409, description: 'Slug already in use' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTopicDto,
    @CurrentCaller() caller: Caller,
    @Query('lang') lang?: string,
  ): Promise<TopicDetailView> {
    return this.topics.update(id, dto, caller, await this.languages.context(lang, true));
  }

  @Post(':id/video-upload')
  @ApiOperation({ summary: 'Start uploading a movie\'s video file — the browser PUTs the file to uploadUrl, then confirms with PUT video' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Upload URL and the path to confirm' })
  @ApiResponse({ status: 400, description: 'Validation error / not a movie page' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  startVideoUpload(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VideoUploadDto, @CurrentCaller() caller: Caller): Promise<VideoUploadView> {
    return this.topics.startVideoUpload(id, dto, caller);
  }

  @Put(':id/video')
  @ApiOperation({ summary: 'Use an uploaded file as the movie\'s video (replaces and deletes the previous one)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated topic' })
  @ApiResponse({ status: 400, description: 'Validation error / not a movie page / upload not finished / file too large' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  @ApiResponse({ status: 409, description: 'The file belongs to another page' })
  async setVideo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetVideoDto,
    @CurrentCaller() caller: Caller,
    @Query('lang') lang?: string,
  ): Promise<TopicDetailView> {
    return this.topics.setVideo(id, dto.path, caller, await this.languages.context(lang, true));
  }

  @Delete(':id/video')
  @ApiOperation({ summary: 'Remove the movie\'s video file (the page falls back to its YouTube link)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated topic' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  async removeVideo(@Param('id', ParseUUIDPipe) id: string, @CurrentCaller() caller: Caller, @Query('lang') lang?: string): Promise<TopicDetailView> {
    return this.topics.removeVideo(id, caller, await this.languages.context(lang, true));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a topic and all its pictures' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentCaller() caller: Caller): Promise<void> {
    return this.topics.remove(id, caller);
  }
}
