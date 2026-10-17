import { useEffect, useState } from 'react';

// Hash-based routing (#/galleries/streets) — works on the static nginx host without
// extra rewrite rules and needs no router dependency for this handful of pages.

export type Route =
  | { readonly page: 'home' }
  | { readonly page: 'gallery'; readonly slug: string }
  | { readonly page: 'about' }
  | { readonly page: 'contact' }
  | { readonly page: 'account' }
  | { readonly page: 'admin' }
  | { readonly page: 'admin-topic'; readonly id: string }
  | { readonly page: 'admin-editors' }
  | { readonly page: 'admin-pages' }
  | { readonly page: 'not-found' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts.length === 0) return { page: 'home' };
  const [head, slug] = parts;
  if (head === 'galleries' && slug && parts.length === 2) return { page: 'gallery', slug };
  if (head === 'admin') {
    if (parts.length === 1) return { page: 'admin' };
    if (parts.length === 2 && slug === 'editors') return { page: 'admin-editors' };
    if (parts.length === 2 && slug === 'pages') return { page: 'admin-pages' };
    if (parts.length === 3 && slug === 'topics' && parts[2]) return { page: 'admin-topic', id: parts[2] };
  }
  if (parts.length === 1 && (head === 'about' || head === 'contact' || head === 'account')) {
    return { page: head };
  }
  return { page: 'not-found' };
}

export function hrefFor(route: Route): string {
  switch (route.page) {
    case 'home':
      return '#/';
    case 'gallery':
      return `#/galleries/${route.slug}`;
    case 'admin-topic':
      return `#/admin/topics/${route.id}`;
    case 'admin-editors':
      return '#/admin/editors';
    case 'admin-pages':
      return '#/admin/pages';
    case 'not-found':
      return '#/';
    default:
      return `#/${route.page}`;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = (): void => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return (): void => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
