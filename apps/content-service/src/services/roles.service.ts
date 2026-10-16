import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { EditorEntity } from '../entities/editor.entity.js';
import type { Caller, IdentityLookup, Role } from '../interfaces/content.interfaces.js';

export const IDENTITY_LOOKUP = Symbol('IDENTITY_LOOKUP');

/** Owner = configured OWNER_EMAILS; Editor = on the editors list; otherwise Viewer. */
@Injectable()
export class RolesService {
  private readonly owners: ReadonlySet<string>;

  constructor(
    config: ConfigService,
    @Inject(IDENTITY_LOOKUP) private readonly identity: IdentityLookup,
    @InjectRepository(EditorEntity) private readonly editors: Repository<EditorEntity>,
  ) {
    this.owners = new Set(
      (config.get<string>('OWNER_EMAILS') ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  isOwnerEmail(email: string): boolean {
    return this.owners.has(email.toLowerCase());
  }

  async resolve(userId: string): Promise<Caller> {
    const email = await this.identity.emailForUser(userId);
    if (!email) return { userId, email: '', role: 'viewer' };
    return { userId, email, role: await this.roleFor(email) };
  }

  private async roleFor(email: string): Promise<Role> {
    if (this.isOwnerEmail(email)) return 'owner';
    return (await this.editors.findOneBy({ email })) ? 'editor' : 'viewer';
  }
}
