import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Gallery } from '../galleries';
import { hrefFor } from '../route';

interface HeaderProps {
  readonly galleries: readonly Gallery[];
}

export function Header({ galleries }: HeaderProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = (): void => setMenuOpen(false);

  return (
    <header className="site-header">
      <a className="wordmark" href={hrefFor({ page: 'home' })} onClick={close}>
        <span className="wordmark-name">Memory</span>
        <span className="wordmark-sub">a life in photographs</span>
      </a>
      <button
        className="menu-toggle"
        aria-expanded={menuOpen}
        aria-controls="site-nav"
        onClick={(): void => setMenuOpen((open) => !open)}
      >
        {menuOpen ? 'Close' : 'Menu'}
      </button>
      <nav id="site-nav" className={menuOpen ? 'site-nav open' : 'site-nav'} aria-label="Main">
        <div className="nav-group">
          <a href={hrefFor({ page: 'home' })} onClick={close}>Galleries</a>
          <ul className="nav-sub">
            {galleries.map((g) => (
              <li key={g.slug}>
                <a href={hrefFor({ page: 'gallery', slug: g.slug })} onClick={close}>{g.title}</a>
              </li>
            ))}
          </ul>
        </div>
        <a href={hrefFor({ page: 'about' })} onClick={close}>About</a>
        <a href={hrefFor({ page: 'contact' })} onClick={close}>Contact</a>
        <a href={hrefFor({ page: 'account' })} onClick={close}>Sign in</a>
      </nav>
    </header>
  );
}
