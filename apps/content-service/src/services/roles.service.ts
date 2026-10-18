import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { EditorEntity } from '../entities/editor.entity.js';
import { OwnerEntity } from '../entities/owner.entity.js';
import type { Caller, IdentityLookup, Role } from '../interfaces/content.interfaces.js';

export const IDENTITY_LOOKUP = Symbol('IDENTITY_LOOKUP');

/** The current owner(s) and, when chosen in the back office, by whom and when. */
export interface OwnerInfo {
  readonly emails: readonly string[];
  readonly changedBy: string | null;
  readonly changedAt: Date | null;
}

/**
 * Owner = the one chosen in the back office (`site_owner`), or OWNER_EMAILS until one is;
 * Editor = on the editors list; otherwise Viewer.
 */
@Injectable()
export class RolesService {
  private readonly configOwners: readonly string[];

  constructor(
    config: ConfigService,
    @Inject(IDENTITY_LOOKUP) private readonly identity: IdentityLookup,
    @InjectRepository(EditorEntity) private readonly editors: Repository<EditorEntity>,
    @InjectRepository(OwnerEntity) private readonly owner: Repository<OwnerEntity>,
  ) {
    this.configOwners = [
      ...new Set(
        (config.get<string>('OWNER_EMAILS') ?? '')
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
  }

  async owners(): Promise<OwnerInfo> {
    const row = await this.owner.findOneBy({ id: 1 });
    if (!row) return { emails: this.configOwners, changedBy: null, changedAt: null };
    return { emails: [row.email], changedBy: row.changedBy, changedAt: row.updatedAt };
  }

  async isOwnerEmail(email: string): Promise<boolean> {
    return (await this.owners()).emails.includes(email.toLowerCase());
  }

  async resolve(userId: string): Promise<Caller> {
    const email = await this.identity.emailForUser(userId);
    if (!email) return { userId, email: '', role: 'viewer' };
    return { userId, email, role: await this.roleFor(email) };
  }

  private async roleFor(email: string): Promise<Role> {
    if (await this.isOwnerEmail(email)) return 'owner';
    return (await this.editors.findOneBy({ email: email.toLowerCase() })) ? 'editor' : 'viewer';
  }
}
