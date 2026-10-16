import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateTopicDto, OrderDto, UpdateTopicDto } from '../dto/content.dto.js';
import { CurrentCaller, RequireRole, RolesGuard } from '../guards/roles.guard.js';
import type { Caller, TopicDetailView, TopicView } from '../interfaces/content.interfaces.js';
import { TopicsService } from '../services/topics.service.js';

@ApiTags('topics (back office)')
@Controller('content/topics')
@UseGuards(RolesGuard)
@RequireRole('editor')
@ApiResponse({ status: 401, description: 'Not signed in' })
@ApiResponse({ status: 403, description: 'Not an editor' })
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  @Get()
  @ApiOperation({ summary: 'All topics, drafts included, in display order' })
  @ApiResponse({ status: 200, description: 'Topic list' })
  list(): Promise<TopicView[]> {
    return this.topics.listAll();
  }

  @Put('order')
  @ApiOperation({ summary: 'Reorder topics — body lists every topic id once' })
  @ApiResponse({ status: 200, description: 'Reordered topic list' })
  @ApiResponse({ status: 400, description: 'ids do not match the topic set' })
  reorder(@Body() dto: OrderDto, @CurrentCaller() caller: Caller): Promise<TopicView[]> {
    return this.topics.reorder(dto.ids, caller);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One topic with all its pictures' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Topic with pictures' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TopicDetailView> {
    return this.topics.getAny(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a topic (starts as draft, added last)' })
  @ApiResponse({ status: 201, description: 'Created topic' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  create(@Body() dto: CreateTopicDto, @CurrentCaller() caller: Caller): Promise<TopicDetailView> {
    return this.topics.create(dto, caller);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit title, slug, description, cover or publish status' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated topic' })
  @ApiResponse({ status: 400, description: 'Validation error / cover not in topic' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  @ApiResponse({ status: 409, description: 'Slug already in use' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTopicDto,
    @CurrentCaller() caller: Caller,
  ): Promise<TopicDetailView> {
    return this.topics.update(id, dto, caller);
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
