import type { ReactElement } from 'react';
import type { GridColumns, Topic } from '../content';
import { useI18n } from '../i18n';
import { hrefFor } from '../route';

interface HomeProps {
  readonly topics: readonly Topic[];
  /** Galleries in each row, top to bottom (site setting); rows after the last use its number. */
  readonly rows: readonly GridColumns[];
}

/** How many galleries share the row each of `count` galleries lands in, in order. */
export function rowSizes(count: number, rows: readonly GridColumns[]): GridColumns[] {
  const sizes: GridColumns[] = [];
  for (let row = 0; sizes.length < count; row++) {
    const n = rows[Math.min(row, rows.length - 1)] ?? 3;
    for (let i = 0; i < n && sizes.length < count; i++) sizes.push(n);
  }
  return sizes;
}

export function Home({ topics, rows }: HomeProps): ReactElement {
  const { t } = useI18n();
  if (topics.length === 0) {
    return <p className="empty">{t('home.empty')}</p>;
  }
  const sizes = rowSizes(topics.length, rows);
  return (
    <section aria-label={t('nav.galleries')}>
      <ul className="tile-grid">
        {topics.map((topic, i) => (
          <li key={topic.id} className={`per-row-${sizes[i] as GridColumns}`}>
            <a className={topic.cover ? 'tile' : 'tile no-cover'} href={hrefFor({ page: 'gallery', slug: topic.slug })}>
              {topic.cover && <img src={topic.cover.display} alt="" loading="lazy" />}
              <span className="tile-title">{topic.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
