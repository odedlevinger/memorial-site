import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type LanguageView,
  PAGE_SLUGS,
  type PageView,
  type SiteView,
  type TopicDetailView,
  type TopicView,
} from '../interfaces/content.interfaces.js';
import { LanguagesService } from '../services/languages.service.js';
import { PagesService } from '../services/pages.service.js';
import { SiteService } from '../services/site.service.js';
import { SiteSummaryService } from '../services/site-summary.service.js';
import { TopicsService } from '../services/topics.service.js';

/**
 * Public, unauthenticated reads (Kong lets /content-service/content/public/* through).
 * Text comes back in `?lang=` (an unknown or missing code means the default language).
 */
@ApiTags('public')
@Controller('content')
export class PublicController {
  constructor(
    private readonly topics: TopicsService,
    private readonly pages: PagesService,
    private readonly site: SiteService,
    private readonly summary: SiteSummaryService,
    private readonly languages: LanguagesService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness check' })
  @ApiResponse({ status: 200, description: 'Service is up' })
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Get('public/topics')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Published topics (picture sets need at least one published picture), in display order' })
  @ApiQuery({ name: 'lang', required: false, description: 'language code; defaults to the default language' })
  @ApiResponse({ status: 200, description: 'Topic list' })
  async listTopics(@Query('lang') lang?: string): Promise<TopicView[]> {
    return this.topics.listPublished(await this.languages.context(lang, false));
  }

  @Get('public/topics/:slug')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'One published topic with its published pictures (and text / book fields)' })
  @ApiParam({ name: 'slug' })
  @ApiResponse({ status: 200, description: 'Topic with pictures' })
  @ApiQuery({ name: 'lang', required: false, description: 'language code; defaults to the default language' })
  @ApiResponse({ status: 404, description: 'No such published topic' })
  async getTopic(@Param('slug') slug: string, @Query('lang') lang?: string): Promise<TopicDetailView> {
    return this.topics.getPublished(slug, await this.languages.context(lang, false));
  }

  @Get('public/pages/:slug')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Text of the About or Contact page' })
  @ApiParam({ name: 'slug', enum: PAGE_SLUGS })
  @ApiResponse({ status: 200, description: 'Page text' })
  @ApiQuery({ name: 'lang', required: false, description: 'language code; defaults to the default language' })
  @ApiResponse({ status: 404, description: 'No such page' })
  async getPage(@Param('slug') slug: string, @Query('lang') lang?: string): Promise<PageView> {
    return this.pages.get(slug, await this.languages.context(lang, false));
  }

  @Get('public/site')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Site title and tagline' })
  @ApiQuery({ name: 'lang', required: false, description: 'language code; defaults to the default language' })
  @ApiResponse({ status: 200, description: 'Site settings' })
  async getSite(@Query('lang') lang?: string): Promise<SiteView> {
    return this.site.get(await this.languages.context(lang, false));
  }

  @Get('public/share-meta')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'HTML <head> tags for link previews (title, tagline, share picture); the web server includes them in index.html' })
  @ApiResponse({ status: 200, description: '<title> plus Open Graph / Twitter card <meta> tags' })
  async getShareMeta(): Promise<string> {
    return this.site.shareMeta(await this.languages.context(undefined, false));
  }

  @Get('public/site-summary')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'The site text (title, tagline, About, gallery list) as plain HTML; the web server includes it in index.html for readers without JavaScript' })
  @ApiResponse({ status: 200, description: '<main> element with the site text' })
  async getSiteSummary(): Promise<string> {
    return this.summary.html(await this.languages.context(undefined, false));
  }

  @Get('public/languages')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Languages the site is offered in (with label overrides), in switcher order' })
  @ApiResponse({ status: 200, description: 'Language list; exactly one isDefault' })
  listLanguages(): Promise<LanguageView[]> {
    return this.languages.list();
  }
}
