import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';
import { publicRetry } from '../content';
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

describe('editors', () => {
  it('owner invites and removes editors', async () => {
    await openAdmin('#/admin/editors');
    expect(await screen.findByText('No editors yet.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Editor email'), { target: { value: ' cousin@gmail.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite editor' }));
    expect(await screen.findByText('cousin@gmail.com')).toBeTruthy();
    expect(screen.getByText('added by me@example.com')).toBeTruthy();

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(server.editors).toHaveLength(1);
    server.failNext(/DELETE \/api\/content\/editors\//, 500, { message: 'Could not remove' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not remove');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('No editors yet.')).toBeTruthy();
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

  it('shows a load error for a page it cannot fetch', async () => {
    for (let i = 0; i < publicRetry.attempts; i++) server.failNext(/GET \/api\/content\/public\/pages\/about$/, 503, { message: 'Unavailable' });
    await openAdmin('#/admin/pages');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Unavailable');
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
