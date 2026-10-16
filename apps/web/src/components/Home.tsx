import type { ReactElement } from 'react';
import { imageUrl, type Gallery } from '../galleries';
import { hrefFor } from '../route';

interface HomeProps {
  readonly galleries: readonly Gallery[];
}

export function Home({ galleries }: HomeProps): ReactElement {
  if (galleries.length === 0) {
    return <p className="empty">No galleries yet.</p>;
  }
  return (
    <section aria-label="Galleries">
      <ul className="tile-grid">
        {galleries.map((g) => (
          <li key={g.slug}>
            <a className="tile" href={hrefFor({ page: 'gallery', slug: g.slug })}>
              {g.images[0] && <img src={imageUrl(g.images[0])} alt="" loading="lazy" />}
              <span className="tile-title">{g.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
