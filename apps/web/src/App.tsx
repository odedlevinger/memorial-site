import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { loadGalleries, type Gallery } from './galleries';
import { useRoute, type Route } from './route';
import { Header } from './components/Header';
import { Home } from './components/Home';
import { GalleryPage } from './components/GalleryPage';
import { About, Contact, NotFound } from './components/TextPages';
import { Account } from './components/Account';

/** Memory — a photographic memorial: gallery tiles, gallery pages, a lightbox, and sign-in. */
export default function App(): ReactElement {
  const route = useRoute();
  const [galleries, setGalleries] = useState<readonly Gallery[] | null>(null);

  useEffect(() => {
    let active = true;
    void loadGalleries().then((list) => {
      if (active) setGalleries(list);
    });
    return (): void => {
      active = false;
    };
  }, []);

  return (
    <div className="site">
      <Header galleries={galleries ?? []} />
      <main className="site-main">
        {galleries === null ? <p className="empty">Loading…</p> : renderPage(route, galleries)}
      </main>
      <footer className="site-footer">
        <p>© {new Date().getFullYear()} Memory · Photographs are placeholders until the archive is added.</p>
      </footer>
    </div>
  );
}

function renderPage(route: Route, galleries: readonly Gallery[]): ReactElement {
  switch (route.page) {
    case 'home':
      return <Home galleries={galleries} />;
    case 'gallery': {
      const gallery = galleries.find((g) => g.slug === route.slug);
      return gallery ? <GalleryPage gallery={gallery} /> : <NotFound />;
    }
    case 'about':
      return <About />;
    case 'contact':
      return <Contact />;
    case 'account':
      return <Account />;
    default:
      return <NotFound />;
  }
}
