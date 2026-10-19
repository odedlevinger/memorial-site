import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Storage } from '@google-cloud/storage';
import type { ImageStore } from '../interfaces/content.interfaces.js';

export const IMAGE_STORE = Symbol('IMAGE_STORE');

/**
 * Cloud Storage bucket with public-read objects (production). URLs point at `publicBase`
 * when given (the site's own /media path, proxied to the bucket by infra/cloudflare —
 * corporate web filters block storage.googleapis.com as "cloud storage"), else at the bucket.
 */
export class GcsImageStore implements ImageStore {
  constructor(
    private readonly storage: Storage,
    private readonly bucketName: string,
    private readonly publicBase?: string,
  ) {}

  async put(path: string, data: Buffer, contentType: string): Promise<void> {
    await this.storage
      .bucket(this.bucketName)
      .file(path)
      .save(data, { contentType, resumable: false, metadata: { cacheControl: 'public, max-age=31536000, immutable' } });
  }

  async remove(prefix: string): Promise<void> {
    await this.storage.bucket(this.bucketName).deleteFiles({ prefix: `${prefix}/`, force: true });
  }

  publicUrl(path: string): string {
    const base = this.publicBase ? this.publicBase.replace(/\/+$/, '') : `https://storage.googleapis.com/${this.bucketName}`;
    return `${base}/${path}`;
  }

  /** A resumable upload session; creating it with `origin` makes storage answer that page's CORS requests. */
  async createUpload(path: string, contentType: string, origin: string): Promise<string> {
    const [url] = await this.storage
      .bucket(this.bucketName)
      .file(path)
      .createResumableUpload({ origin, metadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } });
    return url;
  }

  async sizeOf(path: string): Promise<number | null> {
    const file = this.storage.bucket(this.bucketName).file(path);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [meta] = await file.getMetadata();
    return Number(meta.size);
  }
}

/** Local folder served by the service itself at /content/files (docker-compose dev). */
export class LocalImageStore implements ImageStore {
  constructor(
    private readonly root: string,
    private readonly baseUrl: string,
  ) {}

  async put(path: string, data: Buffer): Promise<void> {
    const file = join(this.root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async remove(prefix: string): Promise<void> {
    await rm(join(this.root, prefix), { recursive: true, force: true });
  }

  publicUrl(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/${path}`;
  }

  /** The browser PUTs the file to its public URL; main.ts accepts those PUTs in local dev. */
  async createUpload(path: string): Promise<string> {
    return this.publicUrl(path);
  }

  async sizeOf(path: string): Promise<number | null> {
    const info = await stat(join(this.root, path)).catch(() => null);
    return info ? info.size : null;
  }
}
