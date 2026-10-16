import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { EditorEntity } from '../entities/editor.entity.js';
import type { Caller } from '../interfaces/content.interfaces.js';
import { AuditService } from './audit.service.js';
import { RolesService } from './roles.service.js';

export interface EditorView {
  readonly email: string;
  readonly addedBy: string;
  readonly createdAt: string;
}

@Injectable()
export class EditorsService {
  constructor(
    @InjectRepository(EditorEntity) private readonly editors: Repository<EditorEntity>,
    private readonly roles: RolesService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<EditorView[]> {
    const rows = await this.editors.find({ order: { createdAt: 'ASC' } });
    return rows.map((e) => ({ email: e.email, addedBy: e.addedBy, createdAt: e.createdAt.toISOString() }));
  }

  async add(rawEmail: string, actor: Caller): Promise<EditorView[]> {
    const email = rawEmail.trim().toLowerCase();
    if (this.roles.isOwnerEmail(email)) throw new BadRequestException('That account is already an owner');
    if (!(await this.editors.findOneBy({ email }))) {
      await this.editors.insert({ email, addedBy: actor.email });
      await this.audit.record(actor, 'editor.add', null, { email });
    }
    return this.list();
  }

  async remove(rawEmail: string, actor: Caller): Promise<EditorView[]> {
    const email = rawEmail.trim().toLowerCase();
    const result = await this.editors.delete({ email });
    if (!result.affected) throw new NotFoundException('Editor not found');
    await this.audit.record(actor, 'editor.remove', null, { email });
    return this.list();
  }
}
