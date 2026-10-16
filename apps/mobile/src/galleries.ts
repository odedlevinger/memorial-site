// Content for the mobile app — the same public API the website uses
// (<web origin>/api/content/public/*), so both always show the same topics and pictures.
// Set EXPO_PUBLIC_WEB_URL to the deployed web origin, e.g. https://memorial-site-web-….run.app

export interface PictureImages {
  readonly display: string;
  readonly thumb: string;
}

export interface Picture {
  readonly id: string;
  readonly caption: string | null;
  readonly dateText: string | null;
  readonly place: string | null;
  readonly story: string | null;
  readonly images: PictureImages;
}

export interface Topic {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly cover: PictureImages | null;
}

export interface TopicDetail extends Topic {
  readonly pictures: readonly Picture[];
}

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

export function webOrigin(): string {
  return (process.env['EXPO_PUBLIC_WEB_URL'] ?? '').replace(/\/+$/, '');
}

async function get<T>(origin: string, path: string, fallback: T): Promise<T> {
  if (!origin) return fallback;
  try {
    const res = await fetch(`${origin}/api/content/public${path}`);
    return res.ok ? ((await res.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Published topics; [] when the site is unreachable. */
export function loadTopics(origin: string): Promise<readonly Topic[]> {
  return get<readonly Topic[]>(origin, '/topics', []);
}

/** One published topic with its pictures; null when missing or unreachable. */
export function loadTopic(origin: string, slug: string): Promise<TopicDetail | null> {
  return get<TopicDetail | null>(origin, `/topics/${encodeURIComponent(slug)}`, null);
}

/** "Summer 1974 · Haifa" style line for a picture (empty when neither is set). */
export function pictureMeta(p: Picture): string {
  return [p.dateText, p.place].filter(Boolean).join(' · ');
}
