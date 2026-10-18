import type { ReactElement } from 'react';
import type { GridColumns, Topic } from '../content';
import { useI18n } from '../i18n';
import { hrefFor } from '../route';

interface HomeProps {
  readonly topics: readonly Topic[];
  /** Galleries per row (site setting). */
  readonly columns: GridColumns;
}

export function Home({ topics, columns }: HomeProps): ReactElement {
  const { t } = useI18n();
  if (topics.length === 0) {
    return <p className="empty">{t('home.empty')}</p>;
  }
  return (
    <section aria-label={t('nav.galleries')}>
      <ul className={`tile-grid cols-${columns}`}>
        {topics.map((topic) => (
          <li key={topic.id}>
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
