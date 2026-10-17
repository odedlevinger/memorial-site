import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { SiteEntity } from '../entities/site.entity.js';
import type { Caller, SiteView } from '../interfaces/content.interfaces.js';
import { AuditService } from './audit.service.js';

const ROW_ID = 1;

/** Shown until an editor first saves the site title. */
export const DEFAULT_SITE: Readonly<Pick<SiteView, 'title' | 'tagline'>> = { title: 'Memory', tagline: 'a life in photographs' };

@Injectable()
export class SiteService {
  constructor(
    @InjectRepository(SiteEntity) private readonly site: Repository<SiteEntity>,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<SiteView> {
    const row = await this.site.findOneBy({ id: ROW_ID });
    return row ? { title: row.title, tagline: row.tagline, updatedAt: row.updatedAt.toISOString() } : { ...DEFAULT_SITE, updatedAt: null };
  }

  async update(title: string, tagline: string, actor: Caller): Promise<SiteView> {
    await this.site.save(this.site.create({ id: ROW_ID, title: title.trim(), tagline: tagline.trim(), updatedBy: actor.email }));
    await this.audit.record(actor, 'site.update', null, { title: title.trim(), tagline: tagline.trim() });
    return this.get();
  }
}
