import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { TopicDetailView, TopicView } from '../interfaces/content.interfaces.js';
import { TopicsService } from '../services/topics.service.js';

/** Public, unauthenticated reads (Kong lets /content-service/content/public/* through). */
@ApiTags('public')
@Controller('content')
export class PublicController {
  constructor(private readonly topics: TopicsService) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness check' })
  @ApiResponse({ status: 200, description: 'Service is up' })
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Get('public/topics')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Published topics (with at least one published picture), in display order' })
  @ApiResponse({ status: 200, description: 'Topic list' })
  listTopics(): Promise<TopicView[]> {
    return this.topics.listPublished();
  }

  @Get('public/topics/:slug')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'One published topic with its published pictures' })
  @ApiParam({ name: 'slug' })
  @ApiResponse({ status: 200, description: 'Topic with pictures' })
  @ApiResponse({ status: 404, description: 'No such published topic' })
  getTopic(@Param('slug') slug: string): Promise<TopicDetailView> {
    return this.topics.getPublished(slug);
  }
}
