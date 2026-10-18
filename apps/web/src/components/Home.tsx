import type { ReactElement } from 'react';
import type { GridColumns, Topic } from '../content';
import { useI18n } from '../i18n';
import { hrefFor } from '../route';

interface HomeProps {
  readonly topics: readonly Topic[];
  /** Galleries in each row, top to bottom (site setting); rows after the last use its number. */
  readonly rows: readonly GridColumns[];
}

/**
 * The grid track (1–5 of 6) each of `count` galleries starts at. Every gallery is two tracks
 * wide — the same size whatever its row holds — and each row is centred, so a row of one sits
 * in the middle. Each row starts left of where the row before ended, so it wraps on its own.
 */
export function tileStarts(count: number, rows: readonly GridColumns[]): number[] {
  const starts: number[] = [];
  for (let row = 0; starts.length < count; row++) {
    const n = Math.min(rows[Math.min(row, rows.length - 1)] ?? 3, count - starts.length);
    for (let i = 0; i < n; i++) starts.push(4 - n + 2 * i);
  }
  return starts;
}

export function Home({ topics, rows }: HomeProps): ReactElement {
  const { t } = useI18n();
  if (topics.length === 0) {
    return <p className="empty">{t('home.empty')}</p>;
  }
  const starts = tileStarts(topics.length, rows);
  return (
    <section aria-label={t('nav.galleries')}>
      <ul className="tile-grid">
        {topics.map((topic, i) => (
          <li key={topic.id} className={`at-${starts[i] as number}`}>
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
