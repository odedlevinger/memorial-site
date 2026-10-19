import { BadRequestException } from '@nestjs/common';
import type { ImageStore } from '../interfaces/content.interfaces.js';
import { MAX_VIDEO_BYTES, VideosService } from './videos.service.js';

describe('VideosService', () => {
  it('deletes an upload that turns out larger than allowed', async () => {
    const store = { sizeOf: jest.fn().mockResolvedValue(MAX_VIDEO_BYTES + 1), remove: jest.fn().mockResolvedValue(undefined) };
    const videos = new VideosService(store as unknown as ImageStore);
    await expect(videos.confirm('videos/abc/video.mp4')).rejects.toThrow(BadRequestException);
    expect(store.remove).toHaveBeenCalledWith('videos/abc');
  });
});
