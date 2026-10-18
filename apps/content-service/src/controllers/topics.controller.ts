import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateTopicDto, OrderDto, UpdateTopicDto } from '../dto/content.dto.js';
import { CurrentCaller, RequireRole, RolesGuard } from '../guards/roles.guard.js';
import type { Caller, TopicDetailView, TopicView } from '../interfaces/content.interfaces.js';
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
  @ApiOperation({ summary: 'Edit title, slug, description, page kind, text, book details, movie link, cover or publish status' })
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
