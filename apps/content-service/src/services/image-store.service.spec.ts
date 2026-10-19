import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Storage } from '@google-cloud/storage';
import { GcsImageStore, LocalImageStore } from './image-store.service.js';

describe('LocalImageStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'content-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes nested files, removes a prefix, and builds URLs', async () => {
    const store = new LocalImageStore(dir, 'http://localhost:3002/content/files/');
    await store.put('pictures/abc/thumb.jpg', Buffer.from('x'));
    expect(await readFile(join(dir, 'pictures/abc/thumb.jpg'), 'utf8')).toBe('x');
    await store.remove('pictures/abc');
    await expect(stat(join(dir, 'pictures/abc'))).rejects.toThrow();
    expect(store.publicUrl('pictures/abc/thumb.jpg')).toBe('http://localhost:3002/content/files/pictures/abc/thumb.jpg');
  });

  it('uploads to the public URL and reports stored sizes', async () => {
    const store = new LocalImageStore(dir, 'http://localhost:3002/content/files');
    expect(await store.createUpload('videos/v/video.mp4')).toBe('http://localhost:3002/content/files/videos/v/video.mp4');
    expect(await store.sizeOf('videos/v/video.mp4')).toBeNull();
    await store.put('videos/v/video.mp4', Buffer.from('abc'));
    expect(await store.sizeOf('videos/v/video.mp4')).toBe(3);
  });
});

describe('GcsImageStore', () => {
  it('saves with cache headers, deletes by prefix, and builds public URLs', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const deleteFiles = jest.fn().mockResolvedValue(undefined);
    const file = jest.fn().mockReturnValue({ save });
    const bucket = jest.fn().mockReturnValue({ file, deleteFiles });
    const store = new GcsImageStore({ bucket } as unknown as Storage, 'photos');

    await store.put('pictures/a/display.jpg', Buffer.from('x'), 'image/jpeg');
    expect(bucket).toHaveBeenCalledWith('photos');
    expect(file).toHaveBeenCalledWith('pictures/a/display.jpg');
    expect(save).toHaveBeenCalledWith(Buffer.from('x'), {
      contentType: 'image/jpeg',
      resumable: false,
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    });

    await store.remove('pictures/a');
    expect(deleteFiles).toHaveBeenCalledWith({ prefix: 'pictures/a/', force: true });
    expect(store.publicUrl('pictures/a/thumb.jpg')).toBe('https://storage.googleapis.com/photos/pictures/a/thumb.jpg');
  });

  it('starts browser uploads for the page\'s origin and reports stored sizes', async () => {
    const createResumableUpload = jest.fn().mockResolvedValue(['https://upload.example/session']);
    const exists = jest.fn().mockResolvedValueOnce([false]).mockResolvedValueOnce([true]);
    const getMetadata = jest.fn().mockResolvedValue([{ size: '1234' }]);
    const file = jest.fn().mockReturnValue({ createResumableUpload, exists, getMetadata });
    const store = new GcsImageStore({ bucket: jest.fn().mockReturnValue({ file }) } as unknown as Storage, 'photos');

    expect(await store.createUpload('videos/v/video.mp4', 'video/mp4', 'https://example.org')).toBe('https://upload.example/session');
    expect(file).toHaveBeenCalledWith('videos/v/video.mp4');
    expect(createResumableUpload).toHaveBeenCalledWith({
      origin: 'https://example.org',
      metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=31536000, immutable' },
    });
    expect(await store.sizeOf('videos/v/video.mp4')).toBeNull();
    expect(await store.sizeOf('videos/v/video.mp4')).toBe(1234);
  });

  it('builds URLs under a public base (the site\'s /media proxy) when given', () => {
    const store = new GcsImageStore({} as unknown as Storage, 'photos', 'https://example.org/media/');
    expect(store.publicUrl('pictures/a/thumb.jpg')).toBe('https://example.org/media/pictures/a/thumb.jpg');
  });
});
