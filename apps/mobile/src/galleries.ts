// Gallery catalogue for the mobile app. The manifest and images are served by the web
// app (apps/web/public/gallery), so mobile and web always show the same photographs.
// Set EXPO_PUBLIC_WEB_URL to the deployed web origin, e.g. https://memorial-site-web-….run.app

export interface Gallery {
  readonly slug: string;
  readonly title: string;
  readonly images: readonly string[];
}

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

export function webOrigin(): string {
  return (process.env['EXPO_PUBLIC_WEB_URL'] ?? '').replace(/\/+$/, '');
}

export function imageUrl(origin: string, name: string): string {
  return `${origin}/gallery/${name}`;
}

function isGallery(value: unknown): value is Gallery {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['slug'] === 'string' &&
    typeof v['title'] === 'string' &&
    Array.isArray(v['images']) &&
    v['images'].every((i) => typeof i === 'string')
  );
}

/** Loads the manifest from the web host; returns [] when unreachable or malformed. */
export async function loadGalleries(origin: string): Promise<readonly Gallery[]> {
  if (!origin) return [];
  try {
    const res = await fetch(`${origin}/gallery/galleries.json`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? data.filter(isGallery) : [];
  } catch {
    return [];
  }
}
