import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';
import { publicRetry } from '../content';
import { fontStack } from '../fonts';
import { FakeServer } from '../test/fakeServer';
import { errorText } from './useAsync';

let server: FakeServer;
let confirmSpy: ReturnType<typeof vi.spyOn>;

function go(hash: string): void {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

async function openAdmin(hash = '#/admin'): Promise<void> {
  window.location.hash = hash;
  render(<App />);
  await screen.findByRole('navigation', { name: 'Back office' });
}

const jpg = (name: string): File => new File(['x'], name, { type: 'image/jpeg' });

beforeEach(() => {
  server = new FakeServer();
  vi.stubGlobal('fetch', server.fetch);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  publicRetry.backoffMs = 0;
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('access', () => {
  it('asks viewers to sign in as an editor', async () => {
    server.role = 'viewer';
    window.location.hash = '#/admin';
    render(<App />);
    expect(await screen.findByText('You need to be signed in as an editor to manage the site.')).toBeTruthy();
  });

  it('editors see Topics but not Editors (and the editors route falls back to topics)', async () => {
    server.role = 'editor';
    await openAdmin('#/admin/editors');
    const tabs = screen.getByRole('navigation', { name: 'Back office' });
    expect(within(tabs).queryByRole('link', { name: 'Editors' })).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Topics' })).toBeTruthy();
  });
});

describe('topics list', () => {
  it('creates a topic and opens it', async () => {
    await openAdmin();
    expect(await screen.findByText('No topics yet — add the first one above.')).toBeTruthy();
    const input = screen.getByLabelText('New topic title');
    fireEvent.submit(input.closest('form') as HTMLFormElement); // empty → ignored
    fireEvent.change(input, { target: { value: '  Family  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add topic' }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/admin\/topics\//));
    expect(server.topics.map((t) => t.title)).toEqual(['Family']);
  });

  it('toggles publish status and reorders by buttons and drag-and-drop', async () => {
    const a = server.addTopic('Alpha', 'draft', 0);
    const b = server.addTopic('Beta', 'published', 1);
    const c = server.addTopic('Gamma', 'published', 1);
    await openAdmin();

    fireEvent.click(await screen.findByRole('button', { name: 'Alpha: draft — toggle' }));
    await waitFor(() => expect(a.status).toBe('published'));
    fireEvent.click(await screen.findByRole('button', { name: 'Beta: published — toggle' }));
    await waitFor(() => expect(b.status).toBe('draft'));

    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    await waitFor(() => expect(server.topics.map((t) => t.title)).toEqual(['Beta', 'Alpha', 'Gamma']));
    expect((screen.getByRole('button', { name: 'Move Beta up' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Move Alpha up' }));
    await waitFor(() => expect(server.topics.map((t) => t.title)).toEqual(['Alpha', 'Beta', 'Gamma']));

    const items = (): HTMLElement[] => screen.getAllByRole('listitem').filter((li) => li.draggable);
    await waitFor(() => expect(items()[0]?.textContent).toContain('Alpha'));
    fireEvent.dragStart(items()[2]!);
    expect(items()[2]!.className).toBe('dragging');
    fireEvent.dragOver(items()[0]!);
    fireEvent.drop(items()[0]!);
    fireEvent.dragEnd(items()[0]!);
    await waitFor(() => expect(server.topics.map((t) => t.title)).toEqual(['Gamma', 'Alpha', 'Beta']));

    // dropping on itself or without a drag start does nothing
    const reorders = (): number => server.calls.filter((c) => c === 'PUT /api/content/topics/order').length;
    const before = reorders();
    fireEvent.drop(items()[1]!);
    fireEvent.dragStart(items()[1]!);
    fireEvent.drop(items()[1]!);
    expect(reorders()).toBe(before);
    expect(c.id).toBeTruthy();
  });

  it('shows server errors', async () => {
    server.addTopic('Alpha', 'draft', 0);
    server.failNext(/PATCH \/api\/content\/topics\//, 403, { message: 'Requires editor access' });
    await openAdmin();
    fireEvent.click(await screen.findByRole('button', { name: 'Alpha: draft — toggle' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Requires editor access');
  });

  it('shows a load error', async () => {
    server.failNext(/GET \/api\/content\/topics$/, 500, { message: 'Database down' });
    await openAdmin();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Database down');
  });
});

describe('topic page', () => {
  it('edits fields, sets the cover, uploads, reorders and deletes', async () => {
    const t = server.addTopic('Streets', 'draft', 2);
    t.description = 'Old';
    const [p1, p2] = server.pictures;
    await openAdmin(`#/admin/topics/${t.id}`);

    const title = await screen.findByLabelText('Title');
    fireEvent.change(title, { target: { value: 'City' } });
    fireEvent.change(screen.getByLabelText('Web address'), { target: { value: 'city' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'published' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save topic' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Saved');
    expect(t).toMatchObject({ title: 'City', slug: 'city', description: null, status: 'published' });

    expect(screen.getByText('Cover')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Make cover' }));
    await waitFor(() => expect(t.coverPictureId).toBe(p2!.id));

    const upload = screen.getByLabelText('Upload pictures');
    fireEvent.change(upload, { target: { files: [] } });
    fireEvent.change(upload, { target: { files: [jpg('a.jpg'), jpg('b.jpg')] } });
    expect(await screen.findByText('Uploaded 2 pictures as drafts')).toBeTruthy();
    expect(server.pictures.filter((p) => p.topicId === t.id)).toHaveLength(4);
    fireEvent.change(upload, { target: { files: [jpg('c.jpg')] } });
    expect(await screen.findByText('Uploaded 1 picture as drafts')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Edit picture/ })).toHaveLength(5));

    fireEvent.click(screen.getByRole('button', { name: 'Move picture 1 down' }));
    await waitFor(() => expect(server.pictures[0]!.id).toBe(p2!.id));
    expect(p1).toBeDefined();

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete topic' }));
    expect(server.topics).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete topic' }));
    await waitFor(() => expect(window.location.hash).toBe('#/admin'));
    expect(server.topics).toHaveLength(0);
  });

  it('reports failed uploads and saves, and an unknown topic', async () => {
    const t = server.addTopic('Streets', 'draft', 0);
    await openAdmin(`#/admin/topics/${t.id}`);
    expect(await screen.findByText('No pictures yet.')).toBeTruthy();
    server.failNext(/POST .*\/pictures$/, 400, { message: 'Only JPEG, PNG and WebP images are accepted' });
    fireEvent.change(screen.getByLabelText('Upload pictures'), { target: { files: [jpg('a.gif')] } });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Only JPEG, PNG and WebP images are accepted');

    server.failNext(/DELETE \/api\/content\/topics\//, 500, { message: 'Nope' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete topic' }));
    await screen.findByText('Nope');
    expect(window.location.hash).toBe(`#/admin/topics/${t.id}`);

    go('#/admin/topics/missing');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Topic not found');
  });

  it('edits a picture: captions, status, move, replace, delete, cancel, errors', async () => {
    const t = server.addTopic('Streets', 'draft', 0);
    const other = server.addTopic('Family', 'draft', 0);
    const pic = server.addPicture(t.id, 'draft', 'Old caption');
    server.addPicture(t.id, 'draft');
    await openAdmin(`#/admin/topics/${t.id}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Old caption' }));
    let dialog = screen.getByRole('dialog', { name: 'Edit picture' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Old caption' }));
    dialog = screen.getByRole('dialog', { name: 'Edit picture' });
    fireEvent.change(within(dialog).getByLabelText('Caption'), { target: { value: '  New caption ' } });
    fireEvent.change(within(dialog).getByLabelText('Date / year'), { target: { value: 'Summer 1974' } });
    fireEvent.change(within(dialog).getByLabelText('Place'), { target: { value: '   ' } });
    fireEvent.change(within(dialog).getByLabelText('Story'), { target: { value: 'A story' } });
    fireEvent.change(within(dialog).getByLabelText('Status'), { target: { value: 'published' } });
    server.failNext(/PATCH \/api\/content\/pictures\//, 400, { message: ['caption too long'] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveProperty('textContent', 'caption too long');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Picture saved')).toBeTruthy();
    expect(pic).toMatchObject({ caption: 'New caption', dateText: 'Summer 1974', place: null, story: 'A story', status: 'published' });

    fireEvent.click(await screen.findByRole('button', { name: 'Edit New caption' }));
    dialog = screen.getByRole('dialog', { name: 'Edit picture' });
    fireEvent.change(within(dialog).getByLabelText('Replace image'), { target: { files: [] } });
    fireEvent.change(within(dialog).getByLabelText('Replace image'), { target: { files: [jpg('n.jpg')] } });
    expect(await screen.findByText('Image replaced')).toBeTruthy();
    expect(pic.version).toBe(2);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit New caption' }));
    dialog = screen.getByRole('dialog', { name: 'Edit picture' });
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Family' })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText('Topic'), { target: { value: other.id } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Picture saved and moved')).toBeTruthy();
    expect(pic.topicId).toBe(other.id);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit picture 1' }));
    dialog = screen.getByRole('dialog', { name: 'Edit picture' });
    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Picture deleted')).toBeTruthy();
    expect(await screen.findByText('No pictures yet.')).toBeTruthy();
  });
});

describe('text and book topics', () => {
  it('creates a topic of a chosen kind and lists its kind', async () => {
    server.addTopic('Streets', 'published', 1);
    await openAdmin();
    expect(await screen.findByText('Picture set · 1 pictures')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('New topic title'), { target: { value: 'Her life' } });
    fireEvent.change(screen.getByLabelText('New topic kind'), { target: { value: 'text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add topic' }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/admin\/topics\//));
    expect(server.topics[1]).toMatchObject({ title: 'Her life', kind: 'text' });
  });

  it('writes a text page, inserts pictures at the cursor and keeps unsaved text across uploads', async () => {
    const t = server.addTopic('Her life', 'draft', 2, 'text');
    const [p1, p2] = server.pictures;
    await openAdmin(`#/admin/topics/${t.id}`);

    expect(await screen.findByLabelText('Introduction')).toBeTruthy();
    expect(screen.queryByLabelText('Book details')).toBeNull();
    const text = screen.getByLabelText('Text') as HTMLTextAreaElement;
    fireEvent.change(text, { target: { value: 'First.\n\nSecond.' } });

    // insert at the cursor, between the paragraphs
    text.setSelectionRange(7, 7);
    fireEvent.click(screen.getByRole('button', { name: 'Insert picture 2 in text' }));
    const ref2 = `[photo ${p2!.id.slice(0, 8)}]`;
    expect(text.value).toBe(`First.\n\n${ref2}\n\nSecond.`);
    expect(screen.getByRole('status').textContent).toBe(`Added ${ref2} to the text — save to keep it`);

    // an upload reloads the topic but leaves the unsaved text alone
    fireEvent.change(screen.getByLabelText('Upload pictures'), { target: { files: [jpg('a.jpg')] } });
    expect(await screen.findByText('Uploaded 1 picture as drafts')).toBeTruthy();
    expect((screen.getByLabelText('Text') as HTMLTextAreaElement).value).toBe(`First.\n\n${ref2}\n\nSecond.`);

    // into an empty text, at the very start
    fireEvent.change(text, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert picture 1 in text' }));
    expect(text.value).toBe(`[photo ${p1!.id.slice(0, 8)}]`);
    fireEvent.change(text, { target: { value: 'Final text' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save topic' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Saved');
    expect(t).toMatchObject({ body: 'Final text', kind: 'text' });
    expect(server.urls.filter((u) => u.startsWith('PATCH'))).toHaveLength(1);

    // clearing the text stores none; switching to a picture set hides the text fields
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save topic' }));
    await waitFor(() => expect(t.body).toBeNull());
    fireEvent.change(screen.getByLabelText('Page kind'), { target: { value: 'pictures' } });
    expect(screen.queryByLabelText('Text')).toBeNull();
    expect(screen.queryByRole('button', { name: /in text$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save topic' }));
    await waitFor(() => expect(t.kind).toBe('pictures'));
    expect(screen.getByLabelText('Description')).toBeTruthy();
  });

  it('edits a book: about text, details, buy link and button text, in two languages', async () => {
    server.addLanguage('he', 'עברית', 'rtl');
    const t = server.addTopic('The book', 'draft', 1, 'book');
    await openAdmin(`#/admin/topics/${t.id}`);

    fireEvent.change(await screen.findByLabelText('About the book'), { target: { value: 'A monograph.' } });
    expect((screen.getByLabelText('Buy button text') as HTMLInputElement).placeholder).toBe('Buy');
    fireEvent.change(screen.getByLabelText('Book details'), { target: { value: 'Pages: 288' } });
    fireEvent.change(screen.getByLabelText('Buy link'), { target: { value: ' https://shop.example/b ' } });
    fireEvent.change(screen.getByLabelText('Buy button text'), { target: { value: 'Order' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save topic' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Saved');
    expect(t).toMatchObject({ body: 'A monograph.', details: 'Pages: 288', buyUrl: 'https://shop.example/b', buyLabel: 'Order' });

    fireEvent.change(screen.getByLabelText('Editing language'), { target: { value: 'he' } });
    const details = screen.getByLabelText('Book details') as HTMLTextAreaElement;
    expect(details).toMatchObject({ value: '', placeholder: 'Pages: 288', dir: 'rtl' });
    expect((screen.getByLabelText('Buy button text') as HTMLInputElement).placeholder).toBe('Order');
    expect((screen.getByLabelText('About the book') as HTMLTextAreaElement).placeholder).toBe('A monograph.');
    expect((screen.getByLabelText('Buy link') as HTMLInputElement).value).toBe('https://shop.example/b');
    fireEvent.change(details, { target: { value: 'עמודים: 288' } });
    fireEvent.change(screen.getByLabelText('Buy link'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save topic' }));
    await waitFor(() => expect(t.translations['he']).toMatchObject({ details: 'עמודים: 288' }));
    expect(t).toMatchObject({ details: 'Pages: 288', buyUrl: null, buyLabel: 'Order' });
  });

  it('sets how many pictures a picture set shows per row', async () => {
    const t = server.addTopic('Streets', 'draft', 1);
    await openAdmin(`#/admin/topics/${t.id}`);
    const three = await screen.findByRole('radio', { name: '3' });
    expect((three as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save topic' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Saved');
    expect(t.columns).toBe(1);
    expect((screen.getByRole('radio', { name: '1' }) as HTMLInputElement).checked).toBe(true);

    fireEvent.change(screen.getByLabelText('Page kind'), { target: { value: 'text' } });
    expect(screen.queryByRole('group', { name: 'Pictures per row' })).toBeNull();
  });

  it('edits a movie: YouTube link (checked as you type) and optional text', async () => {
    const t = server.addTopic('Home movie', 'draft', 0, 'movie');
    await openAdmin(`#/admin/topics/${t.id}`);
    const link = await screen.findByLabelText('YouTube link');
    expect(screen.queryByLabelText('Book details')).toBeNull();
    fireEvent.change(link, { target: { value: 'https://vimeo.com/1' } });
    expect(screen.getByText('That doesn’t look like a YouTube link.')).toBeTruthy();
    fireEvent.change(link, { target: { value: ' https://youtu.be/dQw4w9WgXcQ ' } });
    expect(screen.queryByText('That doesn’t look like a YouTube link.')).toBeNull();
    fireEvent.change(screen.getByLabelText('Text about the movie (optional)'), { target: { value: 'Filmed in Haifa.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save topic' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Saved');
    expect(t).toMatchObject({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ', body: 'Filmed in Haifa.' });
    expect((screen.getByLabelText('YouTube link') as HTMLInputElement).value).toBe('https://youtu.be/dQw4w9WgXcQ');

    fireEvent.change(screen.getByLabelText('YouTube link'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save topic' }));
    await waitFor(() => expect(t.videoUrl).toBeNull());
  });

  it('uploads a movie\'s video file straight to storage, then replaces and removes it', async () => {
    const sent: FakeXhr[] = [];
    class FakeXhr {
      method = '';
      url = '';
      status = 200;
      body: unknown = null;
      upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      open(method: string, url: string): void {
        this.method = method;
        this.url = url;
      }
      send(body: unknown): void {
        this.body = body;
        sent.push(this);
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const t = server.addTopic('Home movie', 'draft', 0, 'movie');
    t.videoUrl = 'https://youtu.be/dQw4w9WgXcQ';
    await openAdmin(`#/admin/topics/${t.id}`);
    expect(await screen.findByText('No video file yet — the page plays the YouTube link.')).toBeTruthy();
    const input = (): HTMLElement => screen.getByLabelText('Upload video file');

    // the wrong kind of file, or too large, never leaves the browser
    fireEvent.change(input(), { target: { files: [new File(['x'], 'clip.avi', { type: 'video/x-msvideo' })] } });
    expect(screen.getByRole('alert').textContent).toBe('Choose an MP4, WebM or MOV video file.');
    const huge = new File(['x'], 'big.mp4', { type: 'video/mp4' });
    Object.defineProperty(huge, 'size', { value: 2 * 1024 ** 3 + 1 });
    fireEvent.change(input(), { target: { files: [huge] } });
    expect(screen.getByRole('alert').textContent).toBe('That video is larger than 2 GB.');
    fireEvent.change(input(), { target: { files: null } });
    expect(server.videoUploads).toHaveLength(0);

    const movie = new File(['abc'], 'movie.mp4', { type: 'video/mp4' });
    fireEvent.change(input(), { target: { files: [movie] } });
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(server.videoUploads[0]).toMatchObject({ contentType: 'video/mp4', size: 3, origin: window.location.origin });
    const xhr = sent[0]!;
    expect(xhr).toMatchObject({ method: 'PUT', url: `https://upload.test/${server.videoUploads[0]!.path}`, body: movie });
    act(() => xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 }));
    expect(screen.getByText('Uploading 50%…')).toBeTruthy();
    act(() => xhr.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 }));
    expect(screen.getByText('Uploading 50%…')).toBeTruthy();
    act(() => xhr.onload?.());
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Video uploaded');
    expect(t.videoFile).toBe(`https://img.test/${server.videoUploads[0]!.path}`);
    expect(await screen.findByLabelText('Uploaded video')).toHaveProperty('tagName', 'VIDEO');

    // a failed upload says so and keeps the current file
    fireEvent.change(screen.getByLabelText('Upload video file'), { target: { files: [movie] } });
    await waitFor(() => expect(sent).toHaveLength(2));
    sent[1]!.status = 403;
    act(() => sent[1]!.onload?.());
    expect((await screen.findByRole('alert')).textContent).toBe('Video upload failed (403)');
    fireEvent.change(screen.getByLabelText('Upload video file'), { target: { files: [movie] } });
    await waitFor(() => expect(sent).toHaveLength(3));
    act(() => sent[2]!.onerror?.());
    expect((await screen.findByRole('alert')).textContent).toBe('Video upload failed — check the connection and try again');
    expect(await screen.findByText('Replace video file')).toBeTruthy();

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Remove video file' }));
    expect(t.videoFile).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove video file' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Video file removed');
    expect(t.videoFile).toBeNull();
  });

  it('offers a video file only on movie pages', async () => {
    const movie = server.addTopic('Home movie', 'draft', 0, 'movie');
    await openAdmin(`#/admin/topics/${movie.id}`);
    expect(await screen.findByText('No video file yet.')).toBeTruthy();
    const text = server.addTopic('Her life', 'draft', 1, 'text');
    go(`#/admin/topics/${text.id}`);
    await screen.findByLabelText('Text');
    expect(screen.queryByLabelText('Upload video file')).toBeNull();
  });

  it('shows the book placeholders for an untranslated, empty book', async () => {
    server.addLanguage('he', 'עברית', 'rtl');
    const t = server.addTopic('Bare', 'draft', 0, 'book');
    await openAdmin(`#/admin/topics/${t.id}`);
    fireEvent.change(await screen.findByLabelText('Editing language'), { target: { value: 'he' } });
    expect((await screen.findByLabelText('Book details') as HTMLTextAreaElement).placeholder).toMatch(/^Author: /);
    expect((screen.getByLabelText('Buy button text') as HTMLInputElement).placeholder).toBe('Buy');
    expect((screen.getByLabelText('About the book') as HTMLTextAreaElement).placeholder).toBe('');
  });
});

describe('editors', () => {
  it('owner sees themselves as owner (no Remove), invites and removes editors', async () => {
    await openAdmin('#/admin/editors');
    expect(await screen.findByText('No editors yet.')).toBeTruthy();
    const ownerRow = screen.getByText('me@example.com').closest('li') as HTMLElement;
    expect(within(ownerRow).getByText('Owner')).toBeTruthy();
    expect(within(ownerRow).queryByRole('button')).toBeNull();

    fireEvent.change(screen.getByLabelText('Editor email'), { target: { value: ' cousin@gmail.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite editor' }));
    expect(await screen.findByText('cousin@gmail.com')).toBeTruthy();
    expect(screen.getByText('added by me@example.com')).toBeTruthy();
    expect(screen.queryByText('No editors yet.')).toBeNull();

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(server.editors).toHaveLength(1);
    server.failNext(/DELETE \/api\/content\/editors\//, 500, { message: 'Could not remove' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not remove');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('No editors yet.')).toBeTruthy();
  });

  it('owner hands ownership to an editor and loses the Editors tab', async () => {
    server.editors = [{ email: 'cousin@gmail.com', role: 'editor', addedBy: 'me@example.com', createdAt: '2026-10-16T00:00:00Z' }];
    await openAdmin('#/admin/editors');
    await screen.findByText('cousin@gmail.com');

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Make owner' }));
    expect(server.owner.email).toBe('me@example.com');

    server.failNext(/PUT \/api\/content\/editors\/owner$/, 400, { message: 'Invite them as an editor first' });
    fireEvent.click(screen.getByRole('button', { name: 'Make owner' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Invite them as an editor first');
    expect(screen.getByRole('link', { name: 'Editors' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Make owner' }));
    expect(confirmSpy).toHaveBeenLastCalledWith(expect.stringContaining('Make cousin@gmail.com the owner?'));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Editors' })).toBeNull());
    expect(server.owner).toMatchObject({ email: 'cousin@gmail.com', role: 'owner' });
    expect(server.editors.map((e) => e.email)).toEqual(['me@example.com']);
  });

  it('shows who made the owner the owner', async () => {
    server.owner = { email: 'me@example.com', role: 'owner', addedBy: 'old@example.com', createdAt: '2026-10-18T00:00:00Z' };
    await openAdmin('#/admin/editors');
    expect(await screen.findByText('made owner by old@example.com')).toBeTruthy();
  });
});

describe('pages', () => {
  it('editors change the About and Contact text', async () => {
    server.role = 'editor';
    await openAdmin('#/admin/pages');
    const tabs = screen.getByRole('navigation', { name: 'Back office' });
    expect(within(tabs).getByRole('link', { name: 'Pages' }).getAttribute('aria-current')).toBe('page');
    expect(within(tabs).queryByRole('link', { name: 'Editors' })).toBeNull();

    const about = await screen.findByLabelText('About text');
    expect((about as HTMLTextAreaElement).value).toBe('About this site.');
    fireEvent.change(about, { target: { value: 'Our story.\n\nMore.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save About' }));
    expect(await screen.findByText('About page saved')).toBeTruthy();
    expect(server.pages['about']?.body).toBe('Our story.\n\nMore.');

    server.failNext(/PUT \/api\/content\/pages\/contact$/, 400, { message: ['body must be shorter'] });
    fireEvent.click(screen.getByRole('button', { name: 'Save Contact' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'body must be shorter');
    expect(screen.getByRole('link', { name: 'Topics' }).getAttribute('aria-current')).toBeNull();
  });

  it('changes the site title and tagline everywhere they appear', async () => {
    await openAdmin('#/admin/pages');
    const header = screen.getByRole('banner');
    expect(await within(header).findByText('a life in photographs')).toBeTruthy();
    const title = await screen.findByLabelText('Title');
    const font = screen.getByLabelText('Font') as HTMLSelectElement;
    expect(font.value).toBe('');
    expect(Array.from(font.options, (o) => o.value)).toContain('EB Garamond');
    fireEvent.change(font, { target: { value: 'EB Garamond' } });
    expect((screen.getByLabelText('Font sample') as HTMLElement).style.fontFamily).toContain('EB Garamond');
    fireEvent.change(title, { target: { value: 'Grandpa Lavi' } });
    expect(screen.getByLabelText('Font sample').textContent).toBe('Grandpa Lavi');
    fireEvent.change(screen.getByLabelText('Tagline (optional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save site settings' }));
    expect(await screen.findByText('Site settings saved')).toBeTruthy();
    expect(server.site.fonts).toEqual({ en: 'EB Garamond' });
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--serif')).toBe(fontStack('EB Garamond')));
    expect(await within(header).findByText('Grandpa Lavi')).toBeTruthy();
    await waitFor(() => expect(document.title).toBe('Grandpa Lavi'));
    expect(within(header).queryByText('a life in photographs')).toBeNull();
    expect(screen.getByRole('contentinfo').textContent).toContain('Grandpa Lavi');

    const rows = screen.getByRole('group', { name: 'Galleries per row on the home page' });
    const row = (n: number): HTMLElement => within(rows).getByRole('group', { name: `Row ${n}` });
    expect((within(row(1)).getByRole('radio', { name: '3' }) as HTMLInputElement).checked).toBe(true);
    expect(within(rows).getByRole('button', { name: 'Remove row 1' })).toHaveProperty('disabled', true);
    fireEvent.click(within(row(1)).getByRole('radio', { name: '1' }));
    fireEvent.click(within(rows).getByRole('button', { name: '+ Add row' }));
    expect((within(row(2)).getByRole('radio', { name: '1' }) as HTMLInputElement).checked).toBe(true); // copies the last row
    fireEvent.click(within(row(2)).getByRole('radio', { name: '3' }));
    fireEvent.click(within(rows).getByRole('button', { name: '+ Add row' }));
    fireEvent.click(within(row(3)).getByRole('radio', { name: '2' }));
    expect(within(rows).getByText('Galleries after row 3 use 2 per row.')).toBeTruthy();
    fireEvent.click(within(rows).getByRole('button', { name: 'Remove row 2' }));
    expect(within(rows).getByText('Galleries after row 2 use 2 per row.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save site settings' }));
    await waitFor(() => expect(server.site.homeRows).toEqual([1, 2]));

    server.failNext(/PUT \/api\/content\/site$/, 400, { message: ['title must not be empty'] });
    fireEvent.click(screen.getByRole('button', { name: 'Save site settings' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'title must not be empty');
  });

  it('uploads, replaces and removes the link preview picture', async () => {
    await openAdmin('#/admin/pages');
    const group = await screen.findByRole('group', { name: 'Link preview picture' });
    expect(within(group).getByText('No picture yet — previews show the title and tagline only.')).toBeTruthy();
    const input = within(group).getByLabelText('Upload link preview picture');
    fireEvent.change(input, { target: { files: [] } });
    fireEvent.change(input, { target: { files: [jpg('share.jpg')] } });
    expect(await within(group).findByRole('status')).toHaveProperty('textContent', 'Link preview picture saved');
    const first = server.site.shareImage;
    expect(within(group).getByRole('img', { name: 'Link preview picture' }).getAttribute('src')).toBe(first);
    expect(within(group).getByText('Replace picture')).toBeTruthy();

    fireEvent.change(input, { target: { files: [jpg('other.jpg')] } });
    await waitFor(() => expect(within(group).getByRole('img', { name: 'Link preview picture' }).getAttribute('src')).not.toBe(first));

    server.failNext(/PUT \/api\/content\/site\/share-image$/, 400, { message: 'Only JPEG, PNG and WebP images are accepted' });
    fireEvent.change(input, { target: { files: [jpg('bad.jpg')] } });
    expect(await within(group).findByRole('alert')).toHaveProperty('textContent', 'Only JPEG, PNG and WebP images are accepted');

    fireEvent.click(within(group).getByRole('button', { name: 'Remove picture' }));
    expect(await within(group).findByRole('status')).toHaveProperty('textContent', 'Link preview picture removed');
    expect(server.site.shareImage).toBeNull();
    expect(within(group).queryByRole('button', { name: 'Remove picture' })).toBeNull();
    expect(server.calls).toContain('DELETE /api/content/site/share-image');
  });

  it('shows a load error for a page it cannot fetch', async () => {
    server.failNext(/GET \/api\/content\/pages\/about$/, 503, { message: 'Unavailable' });
    await openAdmin('#/admin/pages');
    const about = screen.getByRole('region', { name: 'About' });
    expect(await within(about).findByRole('alert')).toHaveProperty('textContent', 'Unavailable');
  });

  it('shows a load error when the site title cannot be fetched', async () => {
    server.failNext(/GET \/api\/content\/site$/, 503, { message: 'No site' });
    await openAdmin('#/admin/pages');
    const form = screen.getByRole('region', { name: 'Site' });
    expect(await within(form).findByRole('alert')).toHaveProperty('textContent', 'No site');
    expect(await screen.findByLabelText('Contact text')).toBeTruthy();
  });
});

describe('more edge cases', () => {
  it('shows an editors load error', async () => {
    server.failNext(/GET \/api\/content\/editors$/, 500, { message: 'Editors unavailable' });
    await openAdmin('#/admin/editors');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Editors unavailable');
  });

  it('opens the picture editor even if the topic list failed to load', async () => {
    const t = server.addTopic('Streets', 'draft', 0);
    server.addPicture(t.id, 'draft', 'Only one');
    server.failNext(/GET \/api\/content\/topics$/, 500);
    await openAdmin(`#/admin/topics/${t.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Only one' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit picture' });
    expect(within(within(dialog).getByLabelText('Topic')).queryAllByRole('option')).toHaveLength(0);
  });

  it('ignores a cleared file selection', async () => {
    const t = server.addTopic('Streets', 'draft', 0);
    await openAdmin(`#/admin/topics/${t.id}`);
    const upload = await screen.findByLabelText('Upload pictures');
    fireEvent.change(upload, { target: { files: null } });
    expect(server.calls.some((c) => c.endsWith('/pictures'))).toBe(false);
  });
});

describe('errorText', () => {
  it('handles non-Error values', () => {
    expect(errorText('plain')).toBe('plain');
    expect(errorText(new Error('boom'))).toBe('boom');
  });
});

describe('languages', () => {
  const row = (name: RegExp): HTMLElement => screen.getByRole('form', { name });

  it('adds, renames, re-directs, sets the default, edits labels and removes languages', async () => {
    server.role = 'editor';
    await openAdmin('#/admin/languages');
    expect(screen.getByRole('link', { name: 'Languages' }).getAttribute('aria-current')).toBe('page');
    expect(within(row(/^English/)).getByText('Default')).toBeTruthy();
    expect(within(row(/^English/)).queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByLabelText('Editing language')).toBeNull();

    const add = screen.getByRole('region', { name: 'Add a language' });
    fireEvent.change(within(add).getByLabelText('Language code'), { target: { value: 'HE' } });
    fireEvent.change(within(add).getByLabelText(/^Name/), { target: { value: 'עברית' } });
    fireEvent.change(within(add).getByLabelText('Text direction'), { target: { value: 'rtl' } });
    fireEvent.click(within(add).getByRole('button', { name: 'Add language' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'עברית added');
    expect(server.languages[1]).toMatchObject({ code: 'he', name: 'עברית', direction: 'rtl', isDefault: false });
    expect((within(add).getByLabelText('Language code') as HTMLInputElement).value).toBe('');

    fireEvent.change(within(add).getByLabelText('Language code'), { target: { value: 'he' } });
    fireEvent.change(within(add).getByLabelText(/^Name/), { target: { value: 'Hebrew' } });
    fireEvent.click(within(add).getByRole('button', { name: 'Add language' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'That language is already on the site');
    expect((within(add).getByLabelText('Language code') as HTMLInputElement).value).toBe('he');

    const he = row(/^עברית/);
    fireEvent.change(within(he).getByLabelText('Name'), { target: { value: ' Hebrew ' } });
    fireEvent.change(within(he).getByLabelText('Direction'), { target: { value: 'ltr' } });
    fireEvent.click(within(he).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Hebrew saved')).toBeTruthy();
    expect(server.languages[1]).toMatchObject({ name: 'Hebrew', direction: 'ltr' });

    fireEvent.click(within(row(/^Hebrew/)).getByRole('button', { name: 'Make default' }));
    expect(await screen.findByText('Hebrew is now the default language')).toBeTruthy();
    expect(server.languages.map((l) => l.isDefault)).toEqual([false, true]);

    fireEvent.click(within(row(/^English/)).getByRole('button', { name: 'Labels' }));
    const labels = screen.getByRole('region', { name: 'English labels' });
    const galleries = within(labels).getByLabelText('Galleries') as HTMLInputElement;
    expect(galleries.placeholder).toBe('Galleries');
    fireEvent.change(galleries, { target: { value: 'Albums' } });
    fireEvent.change(within(labels).getByLabelText('About'), { target: { value: '  ' } });
    fireEvent.click(within(labels).getByRole('button', { name: 'Save labels' }));
    expect(await screen.findByText('English labels saved')).toBeTruthy();
    expect(server.languages[0]?.labels).toEqual({ 'nav.galleries': 'Albums' });
    fireEvent.click(within(row(/^English/)).getByRole('button', { name: 'Labels' }));
    expect(screen.queryByRole('region', { name: 'English labels' })).toBeNull();

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(within(row(/^English/)).getByRole('button', { name: 'Remove' }));
    expect(server.languages).toHaveLength(2);
    fireEvent.click(within(row(/^English/)).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('English removed')).toBeTruthy();
    expect(server.languages.map((l) => l.code)).toEqual(['he']);
  });

  it('keeps a saved font this language would not offer, and clears it to the built-in serif', async () => {
    server.addLanguage('he', 'עברית', 'rtl');
    server.site.fonts = { he: 'Lora' };
    await openAdmin('#/admin/pages');
    fireEvent.change(await screen.findByLabelText('Editing language'), { target: { value: 'he' } });
    const site = screen.getByRole('region', { name: 'Site' });
    const font = (await within(site).findByLabelText('Font')) as HTMLSelectElement;
    expect(font.value).toBe('Lora');
    expect(Array.from(font.options, (o) => o.value).filter((v) => v === 'Lora')).toHaveLength(1);
    fireEvent.change(font, { target: { value: '' } });
    expect(within(site).getByLabelText('Font sample').style.fontFamily).not.toContain('Lora');
    fireEvent.click(within(site).getByRole('button', { name: 'Save site settings' }));
    expect(await within(site).findByRole('status')).toHaveProperty('textContent', 'Site settings saved');
    expect(server.site.fonts).toEqual({});
  });

  it('edits topics, pictures, the site title and pages in another language', async () => {
    server.addLanguage('he', 'עברית', 'rtl');
    const t = server.addTopic('Streets', 'published', 0);
    const pic = server.addPicture(t.id, 'published', 'Corner');
    await openAdmin(`#/admin/topics/${t.id}`);

    const picker = await screen.findByLabelText('Editing language');
    expect((await screen.findByLabelText('Title') as HTMLInputElement).value).toBe('Streets');
    fireEvent.change(picker, { target: { value: 'he' } });
    expect(screen.getByText(/You are editing the עברית text/)).toBeTruthy();
    const title = screen.getByLabelText('Title') as HTMLInputElement;
    expect(title).toMatchObject({ value: '', placeholder: 'Streets', dir: 'rtl', required: false });
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).placeholder).toBe('');
    fireEvent.change(title, { target: { value: 'רחובות' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save topic' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Saved');
    expect(server.urls).toContain(`PATCH /api/content/topics/${t.id}?lang=he`);
    expect(t).toMatchObject({ title: 'Streets', translations: { he: { title: 'רחובות' } } });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Corner' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit picture' });
    const caption = within(dialog).getByLabelText('Caption') as HTMLInputElement;
    expect(caption).toMatchObject({ value: '', placeholder: 'Corner', dir: 'rtl' });
    expect((within(dialog).getByLabelText('Date / year') as HTMLInputElement).placeholder).toBe('e.g. Summer 1974');
    fireEvent.change(caption, { target: { value: 'מכולת' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Picture saved')).toBeTruthy();
    expect(pic).toMatchObject({ caption: 'Corner', translations: { he: { caption: 'מכולת' } } });

    go('#/admin/pages');
    const site = screen.getByRole('region', { name: 'Site' });
    const siteTitle = (await within(site).findByLabelText('Title')) as HTMLInputElement;
    expect(siteTitle).toMatchObject({ value: '', placeholder: 'Memory', required: false });
    const font = within(site).getByLabelText('Font') as HTMLSelectElement;
    expect(Array.from(font.options, (o) => o.value)).toContain('Frank Ruhl Libre');
    expect(Array.from(font.options, (o) => o.value)).not.toContain('EB Garamond'); // no Hebrew letters
    expect(within(site).getByLabelText('Font sample').textContent).toBe('Memory');
    fireEvent.change(font, { target: { value: 'Frank Ruhl Libre' } });
    fireEvent.change(siteTitle, { target: { value: 'זיכרון' } });
    fireEvent.click(within(site).getByRole('button', { name: 'Save site settings' }));
    expect(await within(site).findByRole('status')).toHaveProperty('textContent', 'Site settings saved');
    expect(server.site.translations).toEqual({ he: { title: 'זיכרון' } });
    expect(server.site.fonts).toEqual({ he: 'Frank Ruhl Libre' });

    const about = (await screen.findByLabelText('About text')) as HTMLTextAreaElement;
    expect(about).toMatchObject({ value: '', placeholder: 'About this site.' });
    fireEvent.change(about, { target: { value: 'על האתר.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save About' }));
    expect(await screen.findByText('About page saved')).toBeTruthy();
    expect(server.pages['about']).toMatchObject({ body: 'About this site.', translations: { he: { body: 'על האתר.' } } });

    go('#/admin');
    expect(screen.queryByLabelText('Editing language')).toBeNull();
  });
});

describe('activity', () => {
  const day = (i: number): string => new Date(Date.UTC(2026, 9, 17) - (89 - i) * 86_400_000).toISOString().slice(0, 10);

  beforeEach(() => {
    server.activity = Array.from({ length: 90 }, (_, i) => ({ day: day(i), count: i === 89 ? 1 : i % 3 }));
    server.activityPeople = 4;
  });

  it('charts signed-in people per day for 7, 30 or 90 days, with a table view', async () => {
    server.role = 'editor';
    await openAdmin('#/admin/activity');
    expect(screen.getByRole('link', { name: 'Activity' }).getAttribute('aria-current')).toBe('page');
    expect(await screen.findByText('4')).toBeTruthy();
    expect(screen.getByText(/different people signed in over the last 30 days · 1 today/)).toBeTruthy();
    expect(server.urls).toContain('GET /api/content/activity?days=30');
    const chart = screen.getByRole('group', { name: 'Signed-in people per day' });
    expect(chart.querySelectorAll('.chart-bar')).toHaveLength(server.activity.slice(-30).filter((d) => d.count > 0).length);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(31);

    const today = within(chart).getByLabelText('Sat, Oct 17, 2026: 1 person');
    fireEvent.mouseEnter(today);
    expect(screen.getByRole('status').textContent).toBe('1 personSat, Oct 17, 2026');
    fireEvent.mouseLeave(today);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.focus(within(chart).getByLabelText('Thu, Oct 15, 2026: 0 people'));
    expect(screen.getByRole('status').textContent).toContain('0 people');
    fireEvent.blur(within(chart).getByLabelText('Thu, Oct 15, 2026: 0 people'));

    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(await screen.findByText(/over the last 7 days/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '7 days' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    expect(await screen.findByText(/over the last 90 days/)).toBeTruthy();
  });

  it('says “person” for one, and shows a load error', async () => {
    server.activityPeople = 1;
    await openAdmin('#/admin/activity');
    expect(await screen.findByText(/different person signed in/)).toBeTruthy();
    server.failNext(/GET \/api\/content\/activity$/, 500, { message: 'Stats unavailable' });
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Stats unavailable');
  });
});
