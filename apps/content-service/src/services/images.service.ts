import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { ImageStore, PictureImages, StoredImage } from '../interfaces/content.interfaces.js';
import { IMAGE_STORE } from './image-store.service.js';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ACCEPTED = new Set(['jpeg', 'png', 'webp']);
const SIZES = { original: 4000, display: 2000, thumb: 600 } as const;
/** Link previews: large enough for Facebook / WhatsApp, small enough for WhatsApp's size limit. */
const SHARE_EDGE = 1200;
export const SHARE_FILE = 'share.jpg';

/**
 * Validates an upload and stores three JPEG derivatives under pictures/<uuid>/.
 * Every derivative is re-encoded, which drops EXIF/GPS metadata (sharp strips
 * metadata unless asked to keep it); orientation is applied first.
 */
@Injectable()
export class ImagesService {
  constructor(@Inject(IMAGE_STORE) private readonly blobs: ImageStore) {}

  async store(data: Buffer): Promise<StoredImage> {
    await this.validate(data);
    const key = `pictures/${randomUUID()}`;
    let width = 0;
    let height = 0;
    for (const [name, edge] of Object.entries(SIZES)) {
      const { data: out, info } = await sharp(data)
        .rotate()
        .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: name === 'thumb' ? 78 : 86, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      await this.blobs.put(`${key}/${name}.jpg`, out, 'image/jpeg');
      if (name === 'display') {
        width = info.width;
        height = info.height;
      }
    }
    return { key, width, height };
  }

  /** Stores the site's link-preview picture as site/<uuid>/share.jpg; returns its key. */
  async storeShare(data: Buffer): Promise<string> {
    await this.validate(data);
    const key = `site/${randomUUID()}`;
    const out = await sharp(data)
      .rotate()
      .resize({ width: SHARE_EDGE, height: SHARE_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    await this.blobs.put(`${key}/${SHARE_FILE}`, out, 'image/jpeg');
    return key;
  }

  shareUrl(key: string): string {
    return this.blobs.publicUrl(`${key}/${SHARE_FILE}`);
  }

  private async validate(data: Buffer): Promise<void> {
    if (data.length > MAX_UPLOAD_BYTES) throw new BadRequestException('Image is larger than 20 MB');
    const meta = await sharp(data)
      .metadata()
      .catch(() => {
        throw new BadRequestException('File is not a readable image');
      });
    if (!meta.format || !ACCEPTED.has(meta.format)) {
      throw new BadRequestException('Only JPEG, PNG and WebP images are accepted');
    }
  }

  async remove(key: string): Promise<void> {
    await this.blobs.remove(key);
  }

  urls(key: string): PictureImages {
    return { display: this.blobs.publicUrl(`${key}/display.jpg`), thumb: this.blobs.publicUrl(`${key}/thumb.jpg`) };
  }
}
