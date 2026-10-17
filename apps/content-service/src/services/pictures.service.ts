import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { PictureEntity } from '../entities/picture.entity.js';
import { TopicEntity } from '../entities/topic.entity.js';
import type { UpdatePictureDto } from '../dto/content.dto.js';
import type { Caller, ContentStatus, LangContext, PictureView } from '../interfaces/content.interfaces.js';
import { AuditService } from './audit.service.js';
import { ImagesService } from './images.service.js';
import { TopicsService } from './topics.service.js';
import { setText } from './translations.js';

export interface UploadOptions {
  readonly status?: ContentStatus;
  readonly caption?: string | null;
}

@Injectable()
export class PicturesService {
  constructor(
    @InjectRepository(PictureEntity) private readonly pictures: Repository<PictureEntity>,
    @InjectRepository(TopicEntity) private readonly topicsRepo: Repository<TopicEntity>,
    private readonly topics: TopicsService,
    private readonly images: ImagesService,
    private readonly audit: AuditService,
  ) {}

  /** Adds uploaded files to the end of a topic; new pictures start as drafts. */
  async upload(topicId: string, files: readonly Buffer[], actor: Caller, lang: LangContext, opts: UploadOptions = {}): Promise<PictureView[]> {
    await this.topics.require(topicId);
    if (files.length === 0) throw new BadRequestException('No files uploaded');
    let position = (await this.topics.picturesOf(topicId, false)).length;
    const created: PictureView[] = [];
    for (const file of files) {
      const img = await this.images.store(file);
      const pic = await this.pictures.save(
        this.pictures.create({
          topicId,
          storageKey: img.key,
          width: img.width,
          height: img.height,
          caption: opts.caption ?? null,
          dateText: null,
          place: null,
          story: null,
          position: position++,
          status: opts.status ?? 'draft',
        }),
      );
      created.push(this.topics.pictureView(pic, lang, true));
    }
    await this.audit.record(actor, 'picture.upload', topicId, { count: created.length });
    return created;
  }

  async replaceImage(id: string, file: Buffer, actor: Caller, lang: LangContext): Promise<PictureView> {
    const pic = await this.require(id);
    const img = await this.images.store(file);
    const oldKey = pic.storageKey;
    Object.assign(pic, { storageKey: img.key, width: img.width, height: img.height });
    await this.pictures.save(pic);
    await this.images.remove(oldKey);
    await this.audit.record(actor, 'picture.replace-image', id, null);
    return this.topics.pictureView(pic, lang, true);
  }

  /** Caption, date, place and story are written in `lang`; status and topic are shared. */
  async update(id: string, dto: UpdatePictureDto, actor: Caller, lang: LangContext): Promise<PictureView> {
    const pic = await this.require(id);
    if (dto.topicId !== undefined && dto.topicId !== pic.topicId) {
      await this.topics.require(dto.topicId);
      await this.clearCoverIfUsed(pic);
      pic.position = (await this.topics.picturesOf(dto.topicId, false)).length;
      pic.topicId = dto.topicId;
    }
    if (dto.caption !== undefined) setText(pic, 'caption', dto.caption, lang);
    if (dto.dateText !== undefined) setText(pic, 'dateText', dto.dateText, lang);
    if (dto.place !== undefined) setText(pic, 'place', dto.place, lang);
    if (dto.story !== undefined) setText(pic, 'story', dto.story, lang);
    if (dto.status !== undefined) pic.status = dto.status;
    await this.pictures.save(pic);
    await this.audit.record(actor, 'picture.update', id, { ...dto, lang: lang.code });
    return this.topics.pictureView(pic, lang, true);
  }

  async remove(id: string, actor: Caller): Promise<void> {
    const pic = await this.require(id);
    await this.clearCoverIfUsed(pic);
    await this.pictures.delete({ id });
    await this.images.remove(pic.storageKey);
    await this.audit.record(actor, 'picture.delete', id, { topicId: pic.topicId });
  }

  async reorder(topicId: string, ids: readonly string[], actor: Caller, lang: LangContext): Promise<PictureView[]> {
    const all = await this.topics.picturesOf(topicId, false);
    const found = await this.topics.picturesByIds(topicId, ids);
    if (ids.length !== all.length || new Set(ids).size !== ids.length || found.length !== all.length) {
      throw new BadRequestException('ids must list every picture in the topic exactly once');
    }
    await this.pictures.manager.transaction(async (m) => {
      for (const [i, id] of ids.entries()) await m.update(PictureEntity, { id }, { position: i });
    });
    await this.audit.record(actor, 'picture.reorder', topicId, { ids: [...ids] });
    return (await this.topics.picturesOf(topicId, false)).map((p) => this.topics.pictureView(p, lang, true));
  }

  private async require(id: string): Promise<PictureEntity> {
    const pic = await this.pictures.findOneBy({ id });
    if (!pic) throw new NotFoundException('Picture not found');
    return pic;
  }

  private async clearCoverIfUsed(pic: PictureEntity): Promise<void> {
    await this.topicsRepo.update({ id: pic.topicId, coverPictureId: pic.id }, { coverPictureId: null });
  }
}
