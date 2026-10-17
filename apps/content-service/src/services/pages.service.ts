import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { PageEntity } from '../entities/page.entity.js';
import { type Caller, PAGE_SLUGS, type PageSlug, type PageView } from '../interfaces/content.interfaces.js';
import { AuditService } from './audit.service.js';

/** Shown until an editor saves the page for the first time. */
export const DEFAULT_PAGE_BODIES: Readonly<Record<PageSlug, string>> = {
  about: [
    'This site gathers the photographs and moments of a life worth remembering — the streets walked, the faces loved, the light noticed on an ordinary afternoon.',
    'The pictures shown here are placeholders. They will be replaced with real photographs, together with the story behind them, as the family collects and shares them.',
  ].join('\n\n'),
  contact:
    'To share a photograph, a memory, or a correction, please get in touch with the family. Contact details will be added here.',
};

@Injectable()
export class PagesService {
  constructor(
    @InjectRepository(PageEntity) private readonly pages: Repository<PageEntity>,
    private readonly audit: AuditService,
  ) {}

  async get(rawSlug: string): Promise<PageView> {
    const slug = toSlug(rawSlug);
    const row = await this.pages.findOneBy({ slug });
    return row ? view(row) : { slug, body: DEFAULT_PAGE_BODIES[slug], updatedAt: null };
  }

  async update(rawSlug: string, body: string, actor: Caller): Promise<PageView> {
    const slug = toSlug(rawSlug);
    await this.pages.save(this.pages.create({ slug, body, updatedBy: actor.email }));
    await this.audit.record(actor, 'page.update', null, { slug });
    return this.get(slug);
  }
}

function toSlug(raw: string): PageSlug {
  const slug = PAGE_SLUGS.find((s) => s === raw);
  if (!slug) throw new NotFoundException('Page not found');
  return slug;
}

function view(row: PageEntity): PageView {
  return { slug: row.slug as PageSlug, body: row.body, updatedAt: row.updatedAt.toISOString() };
}
