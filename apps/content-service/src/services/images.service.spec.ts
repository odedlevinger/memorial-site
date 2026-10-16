import sharp from 'sharp';
import { MemoryImageStore, sampleImage } from '../testing/harness.js';
import { ImagesService, MAX_UPLOAD_BYTES } from './images.service.js';

describe('ImagesService', () => {
  it('rejects oversized uploads before decoding', async () => {
    const svc = new ImagesService(new MemoryImageStore());
    await expect(svc.store(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).rejects.toThrow('larger than 20 MB');
  });

  it('rejects images whose format sharp cannot report', async () => {
    const svc = new ImagesService(new MemoryImageStore());
    const metadata = jest.spyOn(sharp.prototype, 'metadata').mockResolvedValueOnce({} as sharp.Metadata);
    await expect(svc.store(await sampleImage())).rejects.toThrow('Only JPEG, PNG and WebP');
    metadata.mockRestore();
  });

  it('strips EXIF (incl. GPS) from every stored derivative', async () => {
    const store = new MemoryImageStore();
    const withExif = await sharp(await sampleImage('jpeg', 800, 600))
      .withExif({ IFD0: { Copyright: 'someone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '32/1 48/1 0/1' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const { key } = await new ImagesService(store).store(withExif);
    for (const name of ['original', 'display', 'thumb']) {
      const meta = await sharp(store.files.get(`${key}/${name}.jpg`) as Buffer).metadata();
      expect(meta.exif).toBeUndefined();
    }
  });
});
