/** The most letters the tab icon holds before they get too small to read. */
const MAX_INITIALS = 3;

/** The first letter of each word in the title ("Lavi Lifshits" → "LL"), capped at three. */
export function initials(title: string): string {
  return title
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, MAX_INITIALS)
    .map((word) => Array.from(word)[0].toLocaleUpperCase())
    .join('');
}

/** A square tab icon with the title's initials in the site's serif, light on brown. */
export function faviconHref(title: string): string {
  const letters = initials(title);
  const size = [0, 40, 36, 26][letters.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="6" fill="#6e5a43"/>` +
    `<text x="32" y="33" text-anchor="middle" dominant-baseline="central" fill="#f6f4f0" ` +
    `font-family="Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif" font-size="${size}">` +
    `${letters}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Points the page's tab icon at the title's initials. */
export function setFavicon(title: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = faviconHref(title);
}
