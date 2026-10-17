import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { PictureEntity } from '../entities/picture.entity.js';
import { TopicEntity } from '../entities/topic.entity.js';
import type { CreateTopicDto, UpdateTopicDto } from '../dto/content.dto.js';
import type { Caller, LangContext, PictureView, TopicDetailView, TopicView } from '../interfaces/content.interfaces.js';
import { AuditService } from './audit.service.js';
import { ImagesService } from './images.service.js';
import { requireText, setText, textOf, translationsOf } from './translations.js';

export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return slug || 'topic';
}

@Injectable()
export class TopicsService {
  constructor(
    @InjectRepository(TopicEntity) private readonly topics: Repository<TopicEntity>,
    @InjectRepository(PictureEntity) private readonly pictures: Repository<PictureEntity>,
    private readonly images: ImagesService,
    private readonly audit: AuditService,
  ) {}

  // ── reads ────────────────────────────────────────────────────────────────

  /** Published topics that have at least one published picture (public site). */
  async listPublished(lang: LangContext): Promise<TopicView[]> {
    const topics = await this.topics.find({ where: { status: 'published' }, order: { position: 'ASC' } });
    const views: TopicView[] = [];
    for (const t of topics) {
      const pics = await this.picturesOf(t.id, true);
      if (pics.length > 0) views.push(this.toView(t, pics, lang, false));
    }
    return views;
  }

  async getPublished(slug: string, lang: LangContext): Promise<TopicDetailView> {
    const topic = await this.topics.findOneBy({ slug, status: 'published' });
    const pics = topic ? await this.picturesOf(topic.id, true) : [];
    if (!topic || pics.length === 0) throw new NotFoundException('Topic not found');
    return { ...this.toView(topic, pics, lang, false), pictures: pics.map((p) => this.pictureView(p, lang, false)) };
  }

  /** Everything, drafts included, with every language's text (back office). */
  async listAll(lang: LangContext): Promise<TopicView[]> {
    const topics = await this.topics.find({ order: { position: 'ASC' } });
    const views: TopicView[] = [];
    for (const t of topics) views.push(this.toView(t, await this.picturesOf(t.id, false), lang, true));
    return views;
  }

  async getAny(id: string, lang: LangContext): Promise<TopicDetailView> {
    const topic = await this.require(id);
    const pics = await this.picturesOf(id, false);
    return { ...this.toView(topic, pics, lang, true), pictures: pics.map((p) => this.pictureView(p, lang, true)) };
  }

  // ── writes ───────────────────────────────────────────────────────────────

  /** Creates the topic in the default language (`lang` only picks the language of the reply). */
  async create(dto: CreateTopicDto, actor: Caller, lang: LangContext): Promise<TopicDetailView> {
    const last = await this.topics.find({ order: { position: 'DESC' }, take: 1 });
    const topic = await this.topics.save(
      this.topics.create({
        title: dto.title.trim(),
        slug: await this.uniqueSlug(slugify(dto.title)),
        description: dto.description ?? null,
        position: last.length > 0 ? (last[0] as TopicEntity).position + 1 : 0,
        status: 'draft',
        coverPictureId: null,
      }),
    );
    await this.audit.record(actor, 'topic.create', topic.id, { title: topic.title });
    return this.getAny(topic.id, lang);
  }

  /** Title and description are written in `lang`; the other fields are shared by all languages. */
  async update(id: string, dto: UpdateTopicDto, actor: Caller, lang: LangContext): Promise<TopicDetailView> {
    const topic = await this.require(id);
    if (dto.title !== undefined) requireText(dto.title, 'title', lang);
    if (dto.slug !== undefined && dto.slug !== topic.slug) {
      if (await this.topics.findOneBy({ slug: dto.slug })) throw new ConflictException('Slug already in use');
      topic.slug = dto.slug;
    }
    if (dto.coverPictureId !== undefined && dto.coverPictureId !== null) {
      const pic = await this.pictures.findOneBy({ id: dto.coverPictureId, topicId: id });
      if (!pic) throw new BadRequestException('Cover must be one of this topic’s pictures');
    }
    if (dto.title !== undefined) setText(topic, 'title', dto.title.trim(), lang);
    if (dto.description !== undefined) setText(topic, 'description', dto.description, lang);
    if (dto.status !== undefined) topic.status = dto.status;
    if (dto.coverPictureId !== undefined) topic.coverPictureId = dto.coverPictureId;
    await this.topics.save(topic);
    await this.audit.record(actor, 'topic.update', id, { ...dto, lang: lang.code });
    return this.getAny(id, lang);
  }

  async remove(id: string, actor: Caller): Promise<void> {
    const topic = await this.require(id);
    const pics = await this.pictures.findBy({ topicId: id });
    for (const p of pics) await this.images.remove(p.storageKey);
    await this.pictures.delete({ topicId: id });
    await this.topics.delete({ id });
    await this.audit.record(actor, 'topic.delete', id, { title: topic.title, pictures: pics.length });
  }

  async reorder(ids: readonly string[], actor: Caller, lang: LangContext): Promise<TopicView[]> {
    const all = await this.topics.find();
    if (ids.length !== all.length || new Set(ids).size !== ids.length || !all.every((t) => ids.includes(t.id))) {
      throw new BadRequestException('ids must list every topic exactly once');
    }
    await this.topics.manager.transaction(async (m) => {
      for (const [i, id] of ids.entries()) await m.update(TopicEntity, { id }, { position: i });
    });
    await this.audit.record(actor, 'topic.reorder', null, { ids: [...ids] });
    return this.listAll(lang);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  async require(id: string): Promise<TopicEntity> {
    const topic = await this.topics.findOneBy({ id });
    if (!topic) throw new NotFoundException('Topic not found');
    return topic;
  }

  async picturesOf(topicId: string, publishedOnly: boolean): Promise<PictureEntity[]> {
    return this.pictures.find({
      where: publishedOnly ? { topicId, status: 'published' } : { topicId },
      order: { position: 'ASC' },
    });
  }

  /** `admin` adds every language's text, for the back office. */
  pictureView(p: PictureEntity, lang: LangContext, admin: boolean): PictureView {
    return {
      id: p.id,
      topicId: p.topicId,
      caption: textOf(p, 'caption', lang),
      dateText: textOf(p, 'dateText', lang),
      place: textOf(p, 'place', lang),
      story: textOf(p, 'story', lang),
      position: p.position,
      status: p.status,
      width: p.width,
      height: p.height,
      images: this.images.urls(p.storageKey),
      ...(admin ? { translations: translationsOf(p) } : {}),
    };
  }

  private toView(t: TopicEntity, pics: readonly PictureEntity[], lang: LangContext, admin: boolean): TopicView {
    const cover = pics.find((p) => p.id === t.coverPictureId) ?? pics[0];
    return {
      id: t.id,
      slug: t.slug,
      title: textOf(t, 'title', lang),
      description: textOf(t, 'description', lang),
      position: t.position,
      status: t.status,
      coverPictureId: t.coverPictureId,
      cover: cover ? this.images.urls(cover.storageKey) : null,
      pictureCount: pics.length,
      ...(admin ? { translations: translationsOf(t) } : {}),
    };
  }

  private async uniqueSlug(base: string): Promise<string> {
    const taken = new Set(
      (await this.topics.find({ select: { slug: true } })).map((t) => t.slug).filter((s) => s === base || s.startsWith(`${base}-`)),
    );
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  }

  /** Used by PicturesService to validate a set of ids belongs to one topic. */
  async picturesByIds(topicId: string, ids: readonly string[]): Promise<PictureEntity[]> {
    return this.pictures.findBy({ topicId, id: In([...ids]) });
  }
}
