import { ConfigService } from '@nestjs/config';
import { GcsImageStore, LocalImageStore } from '../services/image-store.service.js';
import { imageStoreFactory, typeOrmOptions } from './content.module.js';

// ConfigService prefers process.env over passed values, and Jest sets NODE_ENV=test.
function ssl(c: Record<string, string>): unknown {
  const saved = process.env['NODE_ENV'];
  if (c['NODE_ENV']) process.env['NODE_ENV'] = c['NODE_ENV'];
  else delete process.env['NODE_ENV'];
  try {
    return (typeOrmOptions(new ConfigService(c)) as { ssl?: unknown }).ssl;
  } finally {
    process.env['NODE_ENV'] = saved;
  }
}

describe('imageStoreFactory', () => {
  it('uses Cloud Storage when STORAGE_BUCKET is set', () => {
    const store = imageStoreFactory(new ConfigService({ STORAGE_BUCKET: 'photos' }));
    expect(store).toBeInstanceOf(GcsImageStore);
    expect(store.publicUrl('a.jpg')).toBe('https://storage.googleapis.com/photos/a.jpg');
  });

  it('falls back to local disk with configurable or default paths', () => {
    expect(imageStoreFactory(new ConfigService({}))).toBeInstanceOf(LocalImageStore);
    expect(imageStoreFactory(new ConfigService({})).publicUrl('a.jpg')).toBe('http://localhost:3002/content/files/a.jpg');
    const custom = imageStoreFactory(new ConfigService({ STORAGE_LOCAL_DIR: '/x', STORAGE_PUBLIC_BASE: 'http://h/f' }));
    expect(custom.publicUrl('a.jpg')).toBe('http://h/f/a.jpg');
  });
});

describe('typeOrmOptions', () => {
  it('disables SSL for the Cloud SQL socket and for non-production', () => {
    expect(ssl({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u@localhost/db?host=/cloudsql/p:r:i' })).toBe(false);
    expect(ssl({})).toBe(false);
  });

  it('enables SSL for production TCP connections', () => {
    expect(ssl({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u@10.0.0.1/db' })).toEqual({ rejectUnauthorized: false });
    expect(typeOrmOptions(new ConfigService({}))).toMatchObject({ type: 'postgres', synchronize: true });
  });
});
