import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PAGE_SLUGS, type PageView, type SiteView, type TopicDetailView, type TopicView } from '../interfaces/content.interfaces.js';
import { PagesService } from '../services/pages.service.js';
import { SiteService } from '../services/site.service.js';
import { TopicsService } from '../services/topics.service.js';

/** Public, unauthenticated reads (Kong lets /content-service/content/public/* through). */
@ApiTags('public')
@Controller('content')
export class PublicController {
  constructor(
    private readonly topics: TopicsService,
    private readonly pages: PagesService,
    private readonly site: SiteService,
  ) {}

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

  @Get('public/pages/:slug')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Text of the About or Contact page' })
  @ApiParam({ name: 'slug', enum: PAGE_SLUGS })
  @ApiResponse({ status: 200, description: 'Page text' })
  @ApiResponse({ status: 404, description: 'No such page' })
  getPage(@Param('slug') slug: string): Promise<PageView> {
    return this.pages.get(slug);
  }

  @Get('public/site')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Site title and tagline' })
  @ApiResponse({ status: 200, description: 'Site settings' })
  getSite(): Promise<SiteView> {
    return this.site.get();
  }
}
