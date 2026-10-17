import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { CreateLanguageDto, UpdateLanguageDto } from '../dto/content.dto.js';
import { LanguageEntity } from '../entities/language.entity.js';
import { PageEntity } from '../entities/page.entity.js';
import { PictureEntity } from '../entities/picture.entity.js';
import { SiteEntity } from '../entities/site.entity.js';
import { TopicEntity } from '../entities/topic.entity.js';
import type { Caller, LangContext, LanguageView } from '../interfaces/content.interfaces.js';
import { AuditService } from './audit.service.js';
import { type FieldSpec, switchDefault, type Translatable } from './translations.js';

/** The site's only language until an editor adds another. */
export const BUILT_IN_LANGUAGE: LanguageView = { code: 'en', name: 'English', direction: 'ltr', isDefault: true, labels: {} };

const TOPIC_FIELDS: FieldSpec<TopicEntity> = { title: false, description: true };
const PICTURE_FIELDS: FieldSpec<PictureEntity> = { caption: true, dateText: true, place: true, story: true };
const PAGE_FIELDS: FieldSpec<PageEntity> = { body: false };
const SITE_FIELDS: FieldSpec<SiteEntity> = { title: false, tagline: false };

@Injectable()
export class LanguagesService {
  constructor(
    @InjectRepository(LanguageEntity) private readonly languages: Repository<LanguageEntity>,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<LanguageView[]> {
    const rows = await this.languages.find({ order: { position: 'ASC' } });
    return rows.length > 0 ? rows.map(view) : [BUILT_IN_LANGUAGE];
  }

  /**
   * The language a request asked for (`?lang=`), or the default when it asked for none.
   * Public reads (`strict` false) quietly use the default for an unknown code; writes refuse it.
   */
  async context(code: string | undefined, strict: boolean): Promise<LangContext> {
    const langs = await this.list();
    // list() always holds exactly one default (see update()).
    const defaultCode = (langs.find((l) => l.isDefault) as LanguageView).code;
    if (code && langs.some((l) => l.code === code)) return { code, defaultCode };
    if (code && strict) throw new BadRequestException(`Unknown language "${code}"`);
    return { code: defaultCode, defaultCode };
  }

  async add(dto: CreateLanguageDto, actor: Caller): Promise<LanguageView[]> {
    const rows = await this.materialize(actor);
    if (rows.some((r) => r.code === dto.code)) throw new ConflictException('That language is already on the site');
    const position = Math.max(...rows.map((r) => r.position)) + 1;
    await this.languages.save(
      this.languages.create({ code: dto.code, name: dto.name.trim(), direction: dto.direction, isDefault: false, position, labels: {}, updatedBy: actor.email }),
    );
    await this.audit.record(actor, 'language.add', null, { code: dto.code, name: dto.name.trim(), direction: dto.direction });
    return this.list();
  }

  async update(code: string, dto: UpdateLanguageDto, actor: Caller): Promise<LanguageView[]> {
    const rows = await this.materialize(actor);
    const row = rows.find((r) => r.code === code);
    if (!row) throw new NotFoundException('Language not found');
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.direction !== undefined) row.direction = dto.direction;
    if (dto.labels !== undefined) row.labels = Object.fromEntries(Object.entries(dto.labels).filter(([, text]) => text.trim() !== ''));
    row.updatedBy = actor.email;
    const previous = rows.find((r) => r.isDefault) as LanguageEntity;
    const makeDefault = dto.isDefault === true && previous.code !== code;
    await this.languages.manager.transaction(async (m) => {
      if (makeDefault) {
        await moveContentDefault(m, previous.code, code);
        await m.update(LanguageEntity, { code: previous.code }, { isDefault: false });
        row.isDefault = true;
      }
      await m.save(row);
    });
    const { labels, ...rest } = dto;
    await this.audit.record(actor, 'language.update', null, { code, ...rest, ...(labels ? { labels: Object.keys(labels).length } : {}) });
    return this.list();
  }

  async remove(code: string, actor: Caller): Promise<LanguageView[]> {
    const rows = await this.materialize(actor);
    const row = rows.find((r) => r.code === code);
    if (!row) throw new NotFoundException('Language not found');
    if (row.isDefault) throw new BadRequestException('Choose another default language before removing this one');
    await this.languages.delete({ code });
    await this.audit.record(actor, 'language.remove', null, { code });
    return this.list();
  }

  /** Stores the built-in language as a real row the first time an editor changes the list. */
  private async materialize(actor: Caller): Promise<LanguageEntity[]> {
    const rows = await this.languages.find({ order: { position: 'ASC' } });
    if (rows.length > 0) return rows;
    const { code, name, direction } = BUILT_IN_LANGUAGE;
    return [await this.languages.save(this.languages.create({ code, name, direction, isDefault: true, position: 0, labels: {}, updatedBy: actor.email }))];
  }
}

function view(row: LanguageEntity): LanguageView {
  return { code: row.code, name: row.name, direction: row.direction, isDefault: row.isDefault, labels: row.labels };
}

/** Rewrites every translatable row so its columns hold the new default language's text. */
async function moveContentDefault(m: EntityManager, from: string, to: string): Promise<void> {
  const each = async <E extends Translatable>(entity: new () => E, fields: FieldSpec<E>): Promise<void> => {
    const repo = m.getRepository(entity);
    const rows = await repo.find();
    for (const row of rows) switchDefault(row, fields, from, to);
    await repo.save(rows, { chunk: 200 });
  };
  await each(TopicEntity, TOPIC_FIELDS);
  await each(PictureEntity, PICTURE_FIELDS);
  await each(PageEntity, PAGE_FIELDS);
  await each(SiteEntity, SITE_FIELDS);
}
