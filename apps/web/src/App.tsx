import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { contentApi, DEFAULT_SITE, type GridColumns, type Language, type Role, type SiteInfo, type Topic } from './content';
import { BUILT_IN_LANGUAGE, I18nProvider, makeI18n, storedLanguage, storeLanguage, useI18n } from './i18n';
import { useRoute, type Route } from './route';
import { setFavicon } from './favicon';
import { Header } from './components/Header';
import { Home } from './components/Home';
import { GalleryPage } from './components/GalleryPage';
import { About, Contact, NotFound } from './components/TextPages';
import { Account } from './components/Account';
import { AdminApp } from './admin/AdminApp';

/** Memory — a photographic memorial: public galleries plus a back office for editors. */
export default function App(): ReactElement {
  const route = useRoute();
  const [topics, setTopics] = useState<readonly Topic[] | null>(null);
  const [role, setRole] = useState<Role>('viewer');
  const [site, setSite] = useState<SiteInfo | null>(null);
  const [languages, setLanguages] = useState<readonly Language[] | null>(null);
  // The visitor's choice, sent as-is: content-service answers an unknown code in the
  // default language, which is also what makeI18n falls back to.
  const [chosen, setChosen] = useState<string | null>(storedLanguage);
  const [loadFailed, setLoadFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const refresh = useCallback((): void => setVersion((v) => v + 1), []);
  const lang = chosen ?? undefined;

  const setLanguage = useCallback((code: string): void => {
    storeLanguage(code);
    setChosen(code);
  }, []);
  const i18n = useMemo(() => makeI18n(languages ?? [BUILT_IN_LANGUAGE], chosen, setLanguage), [languages, chosen, setLanguage]);

  useEffect(() => {
    let active = true;
    contentApi.publicLanguages().then(
      // Keep the same objects when nothing changed, so open back-office forms keep their edits.
      (list) => active && setLanguages((current) => (JSON.stringify(current) === JSON.stringify(list) ? current : list)),
      () => active && setLanguages((current) => current ?? [BUILT_IN_LANGUAGE]),
    );
    void contentApi.me().then((r) => active && setRole(r));
    return (): void => {
      active = false;
    };
  }, [version]);

  useEffect(() => {
    let active = true;
    setLoadFailed(false);
    contentApi.publicTopics(lang).then(
      (list) => active && setTopics(list),
      () => active && setLoadFailed(true),
    );
    contentApi.publicSite(lang).then(
      (s) => active && setSite(s),
      () => active && setSite(DEFAULT_SITE),
    );
    return (): void => {
      active = false;
    };
  }, [version, lang]);

  useEffect(() => {
    if (!site) return;
    document.title = site.title;
    setFavicon(site.title);
  }, [site]);

  useEffect(() => {
    document.documentElement.lang = i18n.current.code;
    document.documentElement.dir = i18n.current.direction;
  }, [i18n]);

  // Hold the page until the language list arrives, so labels and direction don't flash.
  if (languages === null) return <div className="site" />;

  return (
    <I18nProvider value={i18n}>
      <div className="site">
        <Header site={site} topics={topics ?? []} role={role} />
        <main className="site-main">
          {topics !== null ? renderPage(route, topics, site?.homeRows ?? DEFAULT_SITE.homeRows, role, refresh) : <SiteStatus failed={loadFailed} onRetry={refresh} />}
        </main>
        <footer className="site-footer">
          <p>© {new Date().getFullYear()} {site?.title}</p>
        </footer>
      </div>
    </I18nProvider>
  );
}

function SiteStatus({ failed, onRetry }: { readonly failed: boolean; readonly onRetry: () => void }): ReactElement {
  const { t } = useI18n();
  if (!failed) return <p className="empty">{t('site.loading')}</p>;
  return (
    <div className="empty">
      <p>{t('site.loadFailed')}</p>
      <button className="btn" onClick={onRetry}>
        {t('site.tryAgain')}
      </button>
    </div>
  );
}

function renderPage(route: Route, topics: readonly Topic[], homeRows: readonly GridColumns[], role: Role, refresh: () => void): ReactElement {
  switch (route.page) {
    case 'home':
      return <Home topics={topics} rows={homeRows} />;
    case 'gallery':
      return <GalleryPage key={route.slug} slug={route.slug} />;
    case 'about':
      return <About />;
    case 'contact':
      return <Contact />;
    case 'account':
      return <Account onSessionChange={refresh} />;
    case 'admin':
    case 'admin-topic':
    case 'admin-editors':
    case 'admin-pages':
    case 'admin-languages':
    case 'admin-activity':
      return <AdminApp route={route} role={role} onContentChanged={refresh} />;
    default:
      return <NotFound />;
  }
}
