// Client for content-service, reached same-origin at /api/content (nginx → Kong).
// Public reads need no session; back-office calls send the app_session cookie.

export type ContentStatus = 'draft' | 'published';
export type Role = 'owner' | 'editor' | 'viewer';

export interface PictureImages {
  readonly display: string;
  readonly thumb: string;
}

export interface Picture {
  readonly id: string;
  readonly topicId: string;
  readonly caption: string | null;
  readonly dateText: string | null;
  readonly place: string | null;
  readonly story: string | null;
  readonly position: number;
  readonly status: ContentStatus;
  readonly width: number;
  readonly height: number;
  readonly images: PictureImages;
}

export interface Topic {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
  readonly status: ContentStatus;
  readonly coverPictureId: string | null;
  readonly cover: PictureImages | null;
  readonly pictureCount: number;
}

export interface TopicDetail extends Topic {
  readonly pictures: readonly Picture[];
}

export interface Editor {
  readonly email: string;
  readonly addedBy: string;
  readonly createdAt: string;
}

export type TopicPatch = Partial<Pick<Topic, 'title' | 'slug' | 'description' | 'status' | 'coverPictureId'>>;
export type PicturePatch = Partial<Pick<Picture, 'caption' | 'dateText' | 'place' | 'story' | 'status' | 'topicId'>>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const BASE = '/api/content';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: isForm ? init.headers : { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: unknown };
    const message = Array.isArray(body.message) ? body.message.join(', ') : typeof body.message === 'string' ? body.message : res.statusText;
    throw new ApiError(res.status, message || `Request failed (${res.status})`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const file = (field: string, f: File): FormData => {
  const form = new FormData();
  form.append(field, f);
  return form;
};

export const contentApi = {
  publicTopics: (): Promise<Topic[]> => call('/public/topics'),
  publicTopic: (slug: string): Promise<TopicDetail> => call(`/public/topics/${encodeURIComponent(slug)}`),

  /** The caller's back-office role; 'viewer' when signed out. */
  me: async (): Promise<Role> => {
    try {
      return (await call<{ role: Role }>('/me')).role;
    } catch {
      return 'viewer';
    }
  },

  topics: (): Promise<Topic[]> => call('/topics'),
  topic: (id: string): Promise<TopicDetail> => call(`/topics/${id}`),
  createTopic: (title: string): Promise<TopicDetail> => call('/topics', json('POST', { title })),
  updateTopic: (id: string, patch: TopicPatch): Promise<TopicDetail> => call(`/topics/${id}`, json('PATCH', patch)),
  deleteTopic: (id: string): Promise<void> => call(`/topics/${id}`, { method: 'DELETE' }),
  reorderTopics: (ids: readonly string[]): Promise<Topic[]> => call('/topics/order', json('PUT', { ids })),

  /** One file per request keeps each upload well under Cloud Run's 32 MB request cap. */
  uploadPicture: (topicId: string, f: File): Promise<Picture[]> =>
    call(`/topics/${topicId}/pictures`, { method: 'POST', body: file('files', f) }),
  updatePicture: (id: string, patch: PicturePatch): Promise<Picture> => call(`/pictures/${id}`, json('PATCH', patch)),
  replacePictureImage: (id: string, f: File): Promise<Picture> => call(`/pictures/${id}/image`, { method: 'PUT', body: file('file', f) }),
  deletePicture: (id: string): Promise<void> => call(`/pictures/${id}`, { method: 'DELETE' }),
  reorderPictures: (topicId: string, ids: readonly string[]): Promise<Picture[]> =>
    call(`/topics/${topicId}/pictures/order`, json('PUT', { ids })),

  editors: (): Promise<Editor[]> => call('/editors'),
  addEditor: (email: string): Promise<Editor[]> => call('/editors', json('POST', { email })),
  removeEditor: (email: string): Promise<Editor[]> => call(`/editors/${encodeURIComponent(email)}`, { method: 'DELETE' }),
};

/** Returns a copy of `list` with the item at `from` moved to `to`. */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}
