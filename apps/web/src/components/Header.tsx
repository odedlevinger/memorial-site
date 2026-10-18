import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Role, SiteInfo, Topic } from '../content';
import { useI18n } from '../i18n';
import { hrefFor } from '../route';
import { Flag } from './Flag';

interface HeaderProps {
  /** null while loading — the wordmark stays empty rather than flashing a default. */
  readonly site: SiteInfo | null;
  readonly topics: readonly Topic[];
  readonly role: Role;
}

/**
 * A brown bar: ☰ Menu top left, the site title in the middle, the language flag top right —
 * in every language. The menu drops down from under the bar. The back office is reached from
 * the Account page, not the menu.
 */
export function Header({ site, topics, role }: HeaderProps): ReactElement {
  const { current, t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const close = (): void => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return (): void => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="header-bar">
        <button
          className={menuOpen ? 'menu-toggle open' : 'menu-toggle'}
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          aria-label={menuOpen ? t('nav.close') : t('nav.menu')}
          onClick={(): void => setMenuOpen((open) => !open)}
        >
          <span className="hamburger" aria-hidden="true" />
          <span className="menu-label" aria-hidden="true">{t('nav.menu')}</span>
        </button>
        <a className="wordmark" dir={current.direction} href={hrefFor({ page: 'home' })} onClick={close} aria-label={site?.title ?? t('nav.home')}>
          <span className="wordmark-name">{site?.title}</span>
          {site?.tagline && <span className="wordmark-sub">{site.tagline}</span>}
        </a>
        <LanguageSwitch />
      </div>
      {menuOpen && <div className="nav-backdrop" onClick={close} aria-hidden="true" />}
      <nav id="site-nav" className={menuOpen ? 'site-nav open' : 'site-nav'} aria-label={t('nav.main')}>
        <a href={hrefFor({ page: 'home' })} onClick={close}>{t('nav.galleries')}</a>
        <ul className="nav-sub">
          {topics.map((topic) => (
            <li key={topic.id}>
              <a href={hrefFor({ page: 'gallery', slug: topic.slug })} onClick={close}>{topic.title}</a>
            </li>
          ))}
        </ul>
        <a href={hrefFor({ page: 'about' })} onClick={close}>{t('nav.about')}</a>
        <a href={hrefFor({ page: 'contact' })} onClick={close}>{t('nav.contact')}</a>
        <a href={hrefFor({ page: 'account' })} onClick={close}>{role === 'viewer' ? t('nav.signIn') : t('nav.account')}</a>
      </nav>
    </header>
  );
}

/**
 * Only the current language's flag shows; it opens a list of the others (flag and name, in
 * their own language). An empty slot keeps the title centred when there is one language.
 */
function LanguageSwitch(): ReactElement {
  const { languages, current, setLanguage, t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return (): void => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (languages.length < 2) return <span className="lang-switch" />;
  return (
    <div className="lang-switch" role="group" aria-label={t('nav.language')}>
      <button
        type="button"
        className="lang-current"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${t('nav.language')}: ${current.name}`}
        title={current.name}
        onClick={(): void => setOpen((o) => !o)}
      >
        <Flag code={current.code} />
      </button>
      {open && (
        <>
          <div className="lang-backdrop" onClick={(): void => setOpen(false)} aria-hidden="true" />
          <ul className="lang-menu">
            {languages
              .filter((l) => l.code !== current.code)
              .map((l) => (
                <li key={l.code}>
                  <button
                    type="button"
                    lang={l.code}
                    dir={l.direction}
                    onClick={(): void => {
                      setLanguage(l.code);
                      setOpen(false);
                    }}
                  >
                    <Flag code={l.code} />
                    <span>{l.name}</span>
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
