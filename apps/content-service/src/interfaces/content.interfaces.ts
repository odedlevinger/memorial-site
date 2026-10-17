// Contracts for the content-service. Implementations live in ../services.

export type ContentStatus = 'draft' | 'published';
export const CONTENT_STATUSES: readonly ContentStatus[] = ['draft', 'published'];

export type Role = 'owner' | 'editor' | 'viewer';

/** Image URLs for one picture (display size + thumbnail). */
export interface PictureImages {
  readonly display: string;
  readonly thumb: string;
}

export interface PictureView {
  readonly id: string;
  readonly topicId: string;
  readonly caption: string | null;
  readonly dateText: string | null;
  readonly place: string | null;
  readonly story: string | null;
  readonly position: number;
  readonly status: ContentStatus;
  readonly width: number;
  readonly height: number;
  readonly images: PictureImages;
}

export interface TopicView {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
  readonly status: ContentStatus;
  readonly coverPictureId: string | null;
  readonly cover: PictureImages | null;
  readonly pictureCount: number;
}

export interface TopicDetailView extends TopicView {
  readonly pictures: readonly PictureView[];
}

/** Who is calling, as resolved from Kong's X-User-Id. */
export interface Caller {
  readonly userId: string;
  readonly email: string;
  readonly role: Role;
}

/** Looks up a user's email from auth-service. */
export interface IdentityLookup {
  emailForUser(userId: string): Promise<string | null>;
}

/** Stored image derivatives for one upload. */
export interface StoredImage {
  readonly key: string;
  readonly width: number;
  readonly height: number;
}

/** Blob storage for images (Cloud Storage in prod, local disk / memory in dev & tests). */
export interface ImageStore {
  put(path: string, data: Buffer, contentType: string): Promise<void>;
  remove(prefix: string): Promise<void>;
  publicUrl(path: string): string;
}

/** The fixed site pages whose text editors can change. */
export type PageSlug = 'about' | 'contact';
export const PAGE_SLUGS: readonly PageSlug[] = ['about', 'contact'];

/** A site page's text: plain text, paragraphs separated by blank lines. */
export interface PageView {
  readonly slug: PageSlug;
  readonly body: string;
  /** null while the page still shows its built-in default text. */
  readonly updatedAt: string | null;
}
