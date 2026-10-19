import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { SiteEntity } from '../entities/site.entity.js';
import type { Caller, GridColumns, LangContext, SiteFont, SiteView } from '../interfaces/content.interfaces.js';
import { AuditService } from './audit.service.js';
import { ImagesService } from './images.service.js';
import { requireText, setText, textOf, translationsOf } from './translations.js';

const ROW_ID = 1;

/** Shown until an editor first saves the site settings. */
export const DEFAULT_SITE: Readonly<Pick<SiteView, 'title' | 'tagline' | 'homeRows' | 'shareImage' | 'font'>> = {
  title: 'Memory',
  tagline: 'a life in photographs',
  homeRows: [3],
  shareImage: null,
  font: null,
};

/** Escapes text for an HTML attribute or element body. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

@Injectable()
export class SiteService {
  constructor(
    @InjectRepository(SiteEntity) private readonly site: Repository<SiteEntity>,
    private readonly audit: AuditService,
    private readonly images: ImagesService,
  ) {}

  /** The title, tagline and font in `lang` and the home page layout; `admin` adds every language's text and font. */
  async get(lang: LangContext, admin = false): Promise<SiteView> {
    const row = await this.site.findOneBy({ id: ROW_ID });
    if (!row) return { ...DEFAULT_SITE, updatedAt: null, ...(admin ? { translations: {}, fonts: {} } : {}) };
    const fonts = row.fonts ?? {};
    return {
      title: textOf(row, 'title', lang),
      tagline: textOf(row, 'tagline', lang),
      homeRows: row.homeRows ?? DEFAULT_SITE.homeRows,
      shareImage: row.shareImageKey ? this.images.shareUrl(row.shareImageKey) : null,
      // Not inherited from the default language: its font may lack this language's letters.
      font: fonts[lang.code] ?? null,
      updatedAt: row.updatedAt.toISOString(),
      ...(admin ? { translations: translationsOf(row), fonts } : {}),
    };
  }

  /**
   * Saves the title and tagline in `lang`, and the home page's row layout and the
   * language's font when given (a null font returns it to the built-in serif).
   * In another language an empty tagline falls back to the default language's tagline.
   */
  async update(
    title: string,
    tagline: string,
    homeRows: readonly GridColumns[] | undefined,
    font: SiteFont | null | undefined,
    actor: Caller,
    lang: LangContext,
  ): Promise<SiteView> {
    requireText(title, 'title', lang);
    const row = await this.row();
    setText(row, 'title', title.trim(), lang);
    setText(row, 'tagline', tagline.trim(), lang);
    if (homeRows !== undefined) row.homeRows = [...homeRows];
    if (font !== undefined) {
      const fonts = { ...(row.fonts ?? {}) };
      if (font) fonts[lang.code] = font;
      else delete fonts[lang.code];
      row.fonts = fonts;
    }
    row.updatedBy = actor.email;
    await this.site.save(row);
    await this.audit.record(actor, 'site.update', null, {
      title: title.trim(),
      tagline: tagline.trim(),
      homeRows: row.homeRows,
      ...(font !== undefined ? { font } : {}),
      lang: lang.code,
    });
    return this.get(lang, true);
  }

  /** Replaces the picture shown in link previews (the old one is deleted). */
  async setShareImage(file: Buffer, actor: Caller, lang: LangContext): Promise<SiteView> {
    const key = await this.images.storeShare(file);
    const row = await this.row();
    const old = row.shareImageKey;
    row.shareImageKey = key;
    row.updatedBy = actor.email;
    await this.site.save(row);
    if (old) await this.images.remove(old);
    await this.audit.record(actor, 'site.share-image', null, null);
    return this.get(lang, true);
  }

  /** Removes the link-preview picture; previews then show text only. */
  async removeShareImage(actor: Caller, lang: LangContext): Promise<SiteView> {
    const row = await this.row();
    const old = row.shareImageKey;
    row.shareImageKey = null;
    row.updatedBy = actor.email;
    await this.site.save(row);
    if (old) await this.images.remove(old);
    await this.audit.record(actor, 'site.share-image.remove', null, null);
    return this.get(lang, true);
  }

  /**
   * The <head> tags link previews read (WhatsApp, Facebook, iMessage…): the page title,
   * description and Open Graph / Twitter card tags, from the title, tagline and share picture.
   */
  async shareMeta(lang: LangContext): Promise<string> {
    const site = await this.get(lang);
    const title = escapeHtml(site.title);
    const tags = [
      `<title>${title}</title>`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${title}" />`,
      `<meta property="og:title" content="${title}" />`,
    ];
    if (site.tagline) {
      const tagline = escapeHtml(site.tagline);
      tags.push(`<meta name="description" content="${tagline}" />`, `<meta property="og:description" content="${tagline}" />`);
    }
    if (site.shareImage) {
      tags.push(`<meta property="og:image" content="${escapeHtml(site.shareImage)}" />`, `<meta name="twitter:card" content="summary_large_image" />`);
    } else {
      tags.push(`<meta name="twitter:card" content="summary" />`);
    }
    return `${tags.join('\n    ')}\n`;
  }

  private async row(): Promise<SiteEntity> {
    return (
      (await this.site.findOneBy({ id: ROW_ID })) ??
      this.site.create({ id: ROW_ID, title: DEFAULT_SITE.title, tagline: DEFAULT_SITE.tagline, homeRows: null, fonts: null, shareImageKey: null, translations: null })
    );
  }
}
