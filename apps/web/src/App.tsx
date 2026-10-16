import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { contentApi, type Role, type Topic } from './content';
import { useRoute, type Route } from './route';
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
  const [version, setVersion] = useState(0);
  const refresh = useCallback((): void => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    contentApi.publicTopics().then(
      (list) => active && setTopics(list),
      () => active && setTopics([]),
    );
    void contentApi.me().then((r) => active && setRole(r));
    return (): void => {
      active = false;
    };
  }, [version]);

  return (
    <div className="site">
      <Header topics={topics ?? []} role={role} />
      <main className="site-main">
        {topics === null ? <p className="empty">Loading…</p> : renderPage(route, topics, role, refresh)}
      </main>
      <footer className="site-footer">
        <p>© {new Date().getFullYear()} Memory</p>
      </footer>
    </div>
  );
}

function renderPage(route: Route, topics: readonly Topic[], role: Role, refresh: () => void): ReactElement {
  switch (route.page) {
    case 'home':
      return <Home topics={topics} />;
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
      return <AdminApp route={route} role={role} onContentChanged={refresh} />;
    default:
      return <NotFound />;
  }
}
