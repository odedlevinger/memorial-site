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

/** Menu button top left, site title in the middle, language flags top right — in every language. */
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
        {role !== 'viewer' && <a href={hrefFor({ page: 'admin' })} onClick={close}>{t('nav.admin')}</a>}
        <a href={hrefFor({ page: 'account' })} onClick={close}>{role === 'viewer' ? t('nav.signIn') : t('nav.account')}</a>
      </nav>
    </header>
  );
}

/** One flag per language, named in its own language; an empty slot when there is only one. */
function LanguageSwitch(): ReactElement {
  const { languages, current, setLanguage, t } = useI18n();
  if (languages.length < 2) return <span className="lang-switch" />;
  return (
    <div className="lang-switch" role="group" aria-label={t('nav.language')}>
      {languages.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          aria-label={l.name}
          title={l.name}
          aria-pressed={l.code === current.code}
          onClick={(): void => setLanguage(l.code)}
        >
          <Flag code={l.code} />
        </button>
      ))}
    </div>
  );
}
