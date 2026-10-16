// Gallery catalogue. Images and the manifest live in public/gallery/ (generated
// placeholders until real photographs are uploaded — tools/generate_placeholders.py).

export interface Gallery {
  readonly slug: string;
  readonly title: string;
  readonly images: readonly string[];
}

export const GALLERY_BASE = '/gallery';

export function imageUrl(name: string): string {
  return `${GALLERY_BASE}/${name}`;
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

/** Loads the gallery manifest; returns [] when it is missing or malformed. */
export async function loadGalleries(): Promise<readonly Gallery[]> {
  try {
    const res = await fetch(`${GALLERY_BASE}/galleries.json`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? data.filter(isGallery) : [];
  } catch {
    return [];
  }
}
