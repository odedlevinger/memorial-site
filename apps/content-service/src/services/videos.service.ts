import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type ImageStore, VIDEO_TYPES, type VideoType, type VideoUploadView } from '../interfaces/content.interfaces.js';
import { IMAGE_STORE } from './image-store.service.js';

export const MAX_VIDEO_BYTES = 2 * 1024 ** 3;
/** A path startUpload hands out: videos/<uuid>/video.<ext>. */
export const VIDEO_PATH = /^videos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/video\.(?:mp4|webm|mov)$/;

/**
 * Movie video files. The browser uploads them straight to storage (see ImageStore.createUpload)
 * and the website plays them as they are: no re-encoding, unlike pictures.
 */
@Injectable()
export class VideosService {
  constructor(@Inject(IMAGE_STORE) private readonly blobs: ImageStore) {}

  async startUpload(contentType: VideoType, origin: string): Promise<VideoUploadView> {
    const path = `videos/${randomUUID()}/video.${VIDEO_TYPES[contentType]}`;
    return { path, uploadUrl: await this.blobs.createUpload(path, contentType, origin) };
  }

  /** Checks the upload at `path` has finished; an oversized one is deleted. */
  async confirm(path: string): Promise<void> {
    const size = await this.blobs.sizeOf(path);
    if (size === null) throw new BadRequestException('The video file hasn’t finished uploading');
    if (size > MAX_VIDEO_BYTES) {
      await this.remove(path);
      throw new BadRequestException('Video is larger than 2 GB');
    }
  }

  async remove(path: string): Promise<void> {
    await this.blobs.remove(path.slice(0, path.lastIndexOf('/')));
  }

  url(path: string): string {
    return this.blobs.publicUrl(path);
  }
}
