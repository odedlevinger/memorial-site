import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { EditorEntity } from '../entities/editor.entity.js';
import { OwnerEntity } from '../entities/owner.entity.js';
import type { Caller } from '../interfaces/content.interfaces.js';
import { AuditService } from './audit.service.js';
import { RolesService } from './roles.service.js';

/** One back-office admin: the owner(s) first, then the invited editors. */
export interface EditorView {
  readonly email: string;
  readonly role: 'owner' | 'editor';
  /** null for an owner taken from configuration. */
  readonly addedBy: string | null;
  readonly createdAt: string | null;
}

@Injectable()
export class EditorsService {
  constructor(
    @InjectRepository(EditorEntity) private readonly editors: Repository<EditorEntity>,
    private readonly roles: RolesService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<EditorView[]> {
    const owners = await this.roles.owners();
    const rows = await this.editors.find({ order: { createdAt: 'ASC' } });
    return [
      ...owners.emails.map((email) => ({
        email,
        role: 'owner' as const,
        addedBy: owners.changedBy,
        createdAt: owners.changedAt?.toISOString() ?? null,
      })),
      ...rows
        .filter((e) => !owners.emails.includes(e.email))
        .map((e) => ({ email: e.email, role: 'editor' as const, addedBy: e.addedBy, createdAt: e.createdAt.toISOString() })),
    ];
  }

  async add(rawEmail: string, actor: Caller): Promise<EditorView[]> {
    const email = rawEmail.trim().toLowerCase();
    if (await this.roles.isOwnerEmail(email)) throw new BadRequestException('That account is already an owner');
    if (!(await this.editors.findOneBy({ email }))) {
      await this.editors.insert({ email, addedBy: actor.email });
      await this.audit.record(actor, 'editor.add', null, { email });
    }
    return this.list();
  }

  async remove(rawEmail: string, actor: Caller): Promise<EditorView[]> {
    const email = rawEmail.trim().toLowerCase();
    if (await this.roles.isOwnerEmail(email)) throw new BadRequestException('The owner cannot be removed — make someone else the owner first');
    const result = await this.editors.delete({ email });
    if (!result.affected) throw new NotFoundException('Editor not found');
    await this.audit.record(actor, 'editor.remove', null, { email });
    return this.list();
  }

  /**
   * Hands ownership to an existing editor (so a mistyped email can never take it).
   * The previous owner(s) stay on as editors; the caller loses owner access.
   */
  async changeOwner(rawEmail: string, actor: Caller): Promise<EditorView[]> {
    const email = rawEmail.trim().toLowerCase();
    const previous = (await this.roles.owners()).emails;
    if (previous.includes(email)) throw new BadRequestException('That account is already the owner');
    if (!(await this.editors.findOneBy({ email }))) throw new BadRequestException('Invite them as an editor first');
    await this.editors.manager.transaction(async (m) => {
      await m.delete(EditorEntity, { email });
      for (const old of previous) {
        if (!(await m.findOneBy(EditorEntity, { email: old }))) await m.insert(EditorEntity, { email: old, addedBy: actor.email });
      }
      await m.save(OwnerEntity, { id: 1, email, changedBy: actor.email });
    });
    await this.audit.record(actor, 'owner.change', null, { from: previous, to: email });
    return this.list();
  }
}
