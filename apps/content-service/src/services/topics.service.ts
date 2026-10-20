import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, type Repository } from 'typeorm';
import { PictureEntity } from '../entities/picture.entity.js';
import { TopicEntity } from '../entities/topic.entity.js';
import type { CreateTopicDto, UpdateTopicDto, VideoUploadDto } from '../dto/content.dto.js';
import type { Caller, LangContext, PictureImages, PictureView, TopicDetailView, TopicView, VideoUploadView } from '../interfaces/content.interfaces.js';
import { AuditService } from './audit.service.js';
import { ImagesService } from './images.service.js';
import { VideosService } from './videos.service.js';
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

/** The video id in a YouTube link (watch?v=, youtu.be/, shorts/, embed/, live/), else null. */
export function youtubeId(url: string): string | null {
  const m = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{6,})/.exec(url);
  return m ? (m[1] as string) : null;
}

/**
 * A published picture set needs at least one published picture; a text, book or movie page
 * shows as soon as it is published.
 */
function isShown(t: TopicEntity, publishedPictures: readonly PictureEntity[]): boolean {
  return t.kind !== 'pictures' || publishedPictures.length > 0;
}

/** A movie without pictures uses the video's YouTube thumbnail as its cover. */
function videoCover(t: TopicEntity): PictureImages | null {
  const id = t.kind === 'movie' && t.videoUrl ? youtubeId(t.videoUrl) : null;
  return id ? { display: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } : null;
}

@Injectable()
export class TopicsService {
  constructor(
    @InjectRepository(TopicEntity) private readonly topics: Repository<TopicEntity>,
    @InjectRepository(PictureEntity) private readonly pictures: Repository<PictureEntity>,
    private readonly images: ImagesService,
    private readonly videos: VideosService,
    private readonly audit: AuditService,
  ) {}

  // ── reads ────────────────────────────────────────────────────────────────

  /** Published topics the public can see (see isShown), in display order. */
  async listPublished(lang: LangContext): Promise<TopicView[]> {
    const topics = await this.topics.find({ where: { status: 'published' }, order: { position: 'ASC' } });
    const views: TopicView[] = [];
    for (const t of topics) {
      const pics = await this.picturesOf(t.id, true);
      if (isShown(t, pics)) views.push(this.toView(t, pics, lang, false));
    }
    return views;
  }

  async getPublished(slug: string, lang: LangContext): Promise<TopicDetailView> {
    const topic = await this.topics.findOneBy({ slug, status: 'published' });
    const pics = topic ? await this.picturesOf(topic.id, true) : [];
    if (!topic || !isShown(topic, pics)) throw new NotFoundException('Topic not found');
    return this.detailView(topic, pics, lang, false);
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
    return this.detailView(topic, await this.picturesOf(id, false), lang, true);
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
        kind: dto.kind ?? 'pictures',
        body: null,
        details: null,
        buyUrl: null,
        buyEmbed: false,
        buyLabel: null,
        videoUrl: null,
        videoKey: null,
        columns: 3,
        position: last.length > 0 ? (last[0] as TopicEntity).position + 1 : 0,
        status: 'draft',
        coverPictureId: null,
      }),
    );
    await this.audit.record(actor, 'topic.create', topic.id, { title: topic.title });
    return this.getAny(topic.id, lang);
  }

  /**
   * Title, description, body, details and buy label are written in `lang`; the other fields
   * are shared by all languages.
   */
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
    if (dto.body !== undefined) setText(topic, 'body', dto.body, lang);
    if (dto.details !== undefined) setText(topic, 'details', dto.details, lang);
    if (dto.buyLabel !== undefined) setText(topic, 'buyLabel', dto.buyLabel, lang);
    if (dto.buyUrl !== undefined) topic.buyUrl = dto.buyUrl;
    if (dto.buyEmbed !== undefined) topic.buyEmbed = dto.buyEmbed;
    if (dto.videoUrl !== undefined) topic.videoUrl = dto.videoUrl;
    if (dto.columns !== undefined) topic.columns = dto.columns;
    if (dto.kind !== undefined) topic.kind = dto.kind;
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
    if (topic.videoKey) await this.videos.remove(topic.videoKey);
    await this.pictures.delete({ topicId: id });
    await this.topics.delete({ id });
    await this.audit.record(actor, 'topic.delete', id, { title: topic.title, pictures: pics.length });
  }

  // ── movie video files ────────────────────────────────────────────────────

  /** Where the browser sends a movie's video file; nothing changes until setVideo. */
  async startVideoUpload(id: string, dto: VideoUploadDto, actor: Caller): Promise<VideoUploadView> {
    await this.requireMovie(id);
    const upload = await this.videos.startUpload(dto.contentType, dto.origin);
    await this.audit.record(actor, 'topic.video.upload', id, { path: upload.path, contentType: dto.contentType, size: dto.size });
    return upload;
  }

  /** Makes the uploaded file at `path` the movie's video, replacing (and deleting) any previous one. */
  async setVideo(id: string, path: string, actor: Caller, lang: LangContext): Promise<TopicDetailView> {
    const topic = await this.requireMovie(id);
    if (await this.topics.findOneBy({ id: Not(id), videoKey: path })) throw new ConflictException('That video belongs to another page');
    await this.videos.confirm(path);
    const previous = topic.videoKey;
    topic.videoKey = path;
    await this.topics.save(topic);
    if (previous && previous !== path) await this.videos.remove(previous);
    await this.audit.record(actor, 'topic.video.set', id, { path });
    return this.getAny(id, lang);
  }

  async removeVideo(id: string, actor: Caller, lang: LangContext): Promise<TopicDetailView> {
    const topic = await this.require(id);
    if (topic.videoKey) {
      await this.videos.remove(topic.videoKey);
      topic.videoKey = null;
      await this.topics.save(topic);
    }
    await this.audit.record(actor, 'topic.video.remove', id, {});
    return this.getAny(id, lang);
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

  private async requireMovie(id: string): Promise<TopicEntity> {
    const topic = await this.require(id);
    if (topic.kind !== 'movie') throw new BadRequestException('Only movie pages have a video file');
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
      kind: t.kind,
      title: textOf(t, 'title', lang),
      description: textOf(t, 'description', lang),
      position: t.position,
      status: t.status,
      coverPictureId: t.coverPictureId,
      cover: cover ? this.images.urls(cover.storageKey) : videoCover(t),
      pictureCount: pics.length,
      ...(admin ? { translations: translationsOf(t) } : {}),
    };
  }

  private detailView(t: TopicEntity, pics: readonly PictureEntity[], lang: LangContext, admin: boolean): TopicDetailView {
    return {
      ...this.toView(t, pics, lang, admin),
      pictures: pics.map((p) => this.pictureView(p, lang, admin)),
      body: textOf(t, 'body', lang),
      details: textOf(t, 'details', lang),
      buyUrl: t.buyUrl,
      buyEmbed: t.buyEmbed,
      buyLabel: textOf(t, 'buyLabel', lang),
      videoUrl: t.videoUrl,
      videoFile: t.videoKey ? this.videos.url(t.videoKey) : null,
      columns: t.columns,
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
