import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { PageEntity } from '../entities/page.entity.js';
import { type Caller, type LangContext, PAGE_SLUGS, type PageSlug, type PageView } from '../interfaces/content.interfaces.js';
import { AuditService } from './audit.service.js';
import { requireText, setText, textOf, translationsOf } from './translations.js';

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

  /** The page in `lang`; `admin` adds every language's text, for the back office. */
  async get(rawSlug: string, lang: LangContext, admin = false): Promise<PageView> {
    const slug = toSlug(rawSlug);
    const row = await this.pages.findOneBy({ slug });
    if (!row) return { slug, body: DEFAULT_PAGE_BODIES[slug], updatedAt: null, ...(admin ? { translations: {} } : {}) };
    return {
      slug,
      body: textOf(row, 'body', lang),
      updatedAt: row.updatedAt.toISOString(),
      ...(admin ? { translations: translationsOf(row) } : {}),
    };
  }

  /** Saves the page's text in `lang` (another language starts from the built-in default). */
  async update(rawSlug: string, body: string, actor: Caller, lang: LangContext): Promise<PageView> {
    const slug = toSlug(rawSlug);
    requireText(body, 'body', lang);
    const row = (await this.pages.findOneBy({ slug })) ?? this.pages.create({ slug, body: DEFAULT_PAGE_BODIES[slug], translations: null });
    setText(row, 'body', body, lang);
    row.updatedBy = actor.email;
    await this.pages.save(row);
    await this.audit.record(actor, 'page.update', null, { slug, lang: lang.code });
    return this.get(slug, lang, true);
  }
}

function toSlug(raw: string): PageSlug {
  const slug = PAGE_SLUGS.find((s) => s === raw);
  if (!slug) throw new NotFoundException('Page not found');
  return slug;
}
