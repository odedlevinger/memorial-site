import { Injectable } from '@nestjs/common';
import type { LangContext } from '../interfaces/content.interfaces.js';
import { PagesService } from './pages.service.js';
import { escapeHtml, SiteService } from './site.service.js';
import { TopicsService } from './topics.service.js';

/** Plain text with blank-line-separated paragraphs, as <p> elements. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((p) => `<p>${escapeHtml(p)}</p>`);
}

/**
 * The site's text as plain HTML, for whoever reads the page without running JavaScript.
 * Corporate web filters categorize a site by its HTML; an empty <div id="root"> reads as
 * "uncategorized" and gets blocked. The web server includes this inside #root, and React
 * replaces it once the app starts.
 */
@Injectable()
export class SiteSummaryService {
  constructor(
    private readonly site: SiteService,
    private readonly topics: TopicsService,
    private readonly pages: PagesService,
  ) {}

  async html(lang: LangContext): Promise<string> {
    const [site, topics, about] = await Promise.all([this.site.get(lang), this.topics.listPublished(lang), this.pages.get('about', lang)]);
    const parts = [`<h1>${escapeHtml(site.title)}</h1>`];
    if (site.tagline) parts.push(`<p>${escapeHtml(site.tagline)}</p>`);
    parts.push(...paragraphs(about.body));
    if (topics.length > 0) {
      const items = topics.map((t) => {
        const link = `<a href="#/galleries/${encodeURIComponent(t.slug)}">${escapeHtml(t.title)}</a>`;
        return `<li>${t.description ? `${link} — ${escapeHtml(t.description)}` : link}</li>`;
      });
      parts.push(`<ul>${items.join('')}</ul>`);
    }
    return `<main lang="${escapeHtml(lang.code)}" dir="auto" style="max-width:40rem;margin:3rem auto;padding:0 1rem;font-family:system-ui,sans-serif;line-height:1.6">${parts.join('\n')}</main>\n`;
  }
}
