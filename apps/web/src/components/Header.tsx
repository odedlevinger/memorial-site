import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Role, SiteInfo, Topic } from '../content';
import { useI18n } from '../i18n';
import { hrefFor } from '../route';

interface HeaderProps {
  /** null while loading — the wordmark stays empty rather than flashing a default. */
  readonly site: SiteInfo | null;
  readonly topics: readonly Topic[];
  readonly role: Role;
}

export function Header({ site, topics, role }: HeaderProps): ReactElement {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const close = (): void => setMenuOpen(false);

  return (
    <header className="site-header">
      <a className="wordmark" href={hrefFor({ page: 'home' })} onClick={close} aria-label={site?.title ?? t('nav.home')}>
        <span className="wordmark-name">{site?.title}</span>
        {site?.tagline && <span className="wordmark-sub">{site.tagline}</span>}
      </a>
      <button
        className="menu-toggle"
        aria-expanded={menuOpen}
        aria-controls="site-nav"
        onClick={(): void => setMenuOpen((open) => !open)}
      >
        {menuOpen ? t('nav.close') : t('nav.menu')}
      </button>
      <nav id="site-nav" className={menuOpen ? 'site-nav open' : 'site-nav'} aria-label={t('nav.main')}>
        <div className="nav-group">
          <a href={hrefFor({ page: 'home' })} onClick={close}>{t('nav.galleries')}</a>
          <ul className="nav-sub">
            {topics.map((topic) => (
              <li key={topic.id}>
                <a href={hrefFor({ page: 'gallery', slug: topic.slug })} onClick={close}>{topic.title}</a>
              </li>
            ))}
          </ul>
        </div>
        <a href={hrefFor({ page: 'about' })} onClick={close}>{t('nav.about')}</a>
        <a href={hrefFor({ page: 'contact' })} onClick={close}>{t('nav.contact')}</a>
        {role !== 'viewer' && <a href={hrefFor({ page: 'admin' })} onClick={close}>{t('nav.admin')}</a>}
        <a href={hrefFor({ page: 'account' })} onClick={close}>{role === 'viewer' ? t('nav.signIn') : t('nav.account')}</a>
        <LanguageSwitch onPick={close} />
      </nav>
    </header>
  );
}

/** One button per language, each named in its own language; hidden when there is only one. */
function LanguageSwitch({ onPick }: { readonly onPick: () => void }): ReactElement | null {
  const { languages, current, setLanguage, t } = useI18n();
  if (languages.length < 2) return null;
  return (
    <div className="lang-switch" role="group" aria-label={t('nav.language')}>
      {languages.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          dir={l.direction}
          aria-pressed={l.code === current.code}
          onClick={(): void => {
            setLanguage(l.code);
            onPick();
          }}
        >
          {l.name}
        </button>
      ))}
    </div>
  );
}
