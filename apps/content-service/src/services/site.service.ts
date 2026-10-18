import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { SiteEntity } from '../entities/site.entity.js';
import type { Caller, GridColumns, LangContext, SiteView } from '../interfaces/content.interfaces.js';
import { AuditService } from './audit.service.js';
import { requireText, setText, textOf, translationsOf } from './translations.js';

const ROW_ID = 1;

/** Shown until an editor first saves the site settings. */
export const DEFAULT_SITE: Readonly<Pick<SiteView, 'title' | 'tagline' | 'homeColumns'>> = { title: 'Memory', tagline: 'a life in photographs', homeColumns: 3 };

@Injectable()
export class SiteService {
  constructor(
    @InjectRepository(SiteEntity) private readonly site: Repository<SiteEntity>,
    private readonly audit: AuditService,
  ) {}

  /** The title and tagline in `lang` and the home page layout; `admin` adds every language's text. */
  async get(lang: LangContext, admin = false): Promise<SiteView> {
    const row = await this.site.findOneBy({ id: ROW_ID });
    if (!row) return { ...DEFAULT_SITE, updatedAt: null, ...(admin ? { translations: {} } : {}) };
    return {
      title: textOf(row, 'title', lang),
      tagline: textOf(row, 'tagline', lang),
      homeColumns: row.homeColumns,
      updatedAt: row.updatedAt.toISOString(),
      ...(admin ? { translations: translationsOf(row) } : {}),
    };
  }

  /**
   * Saves the title and tagline in `lang`, and the home page's galleries per row when given.
   * In another language an empty tagline falls back to the default language's tagline.
   */
  async update(title: string, tagline: string, homeColumns: GridColumns | undefined, actor: Caller, lang: LangContext): Promise<SiteView> {
    requireText(title, 'title', lang);
    const row = (await this.site.findOneBy({ id: ROW_ID })) ?? this.site.create({ id: ROW_ID, ...DEFAULT_SITE, translations: null });
    setText(row, 'title', title.trim(), lang);
    setText(row, 'tagline', tagline.trim(), lang);
    if (homeColumns !== undefined) row.homeColumns = homeColumns;
    row.updatedBy = actor.email;
    await this.site.save(row);
    await this.audit.record(actor, 'site.update', null, { title: title.trim(), tagline: tagline.trim(), homeColumns: row.homeColumns, lang: lang.code });
    return this.get(lang, true);
  }
}
