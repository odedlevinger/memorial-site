import type { ReactElement } from 'react';
import type { Topic } from '../content';
import { hrefFor } from '../route';

interface HomeProps {
  readonly topics: readonly Topic[];
}

export function Home({ topics }: HomeProps): ReactElement {
  if (topics.length === 0) {
    return <p className="empty">No galleries yet.</p>;
  }
  return (
    <section aria-label="Galleries">
      <ul className="tile-grid">
        {topics.map((t) => (
          <li key={t.id}>
            <a className="tile" href={hrefFor({ page: 'gallery', slug: t.slug })}>
              {t.cover && <img src={t.cover.display} alt="" loading="lazy" />}
              <span className="tile-title">{t.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
