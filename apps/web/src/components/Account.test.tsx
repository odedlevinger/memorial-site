import { fireEvent, render, screen } from '@testing-library/react';
import { FakeServer } from '../test/fakeServer';
import { Account } from './Account';

// Stand-in for the Google button: signs in immediately when clicked.
vi.mock('../Login', () => ({
  Login: ({ onSignedIn }: { onSignedIn: (u: { id: string; email: string }) => void }) => (
    <button onClick={(): void => onSignedIn({ id: 'u1', email: 'new@example.com' })}>Google</button>
  ),
}));

afterEach(() => vi.unstubAllGlobals());

describe('Account', () => {
  it('signs in and notifies the app, and works without a callback', async () => {
    const server = new FakeServer();
    server.signedIn = false;
    vi.stubGlobal('fetch', server.fetch);
    const onSessionChange = vi.fn();
    const { unmount } = render(<Account onSessionChange={onSessionChange} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Google' }));
    expect(await screen.findByText('new@example.com')).toBeTruthy();
    expect(onSessionChange).toHaveBeenCalledTimes(1);
    unmount();

    render(<Account />);
    fireEvent.click(await screen.findByRole('button', { name: 'Google' }));
    expect(await screen.findByText('new@example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });
});
