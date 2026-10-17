import type { ReactElement } from 'react';
import type { Topic } from '../content';
import { useI18n } from '../i18n';
import { hrefFor } from '../route';

interface HomeProps {
  readonly topics: readonly Topic[];
}

export function Home({ topics }: HomeProps): ReactElement {
  const { t } = useI18n();
  if (topics.length === 0) {
    return <p className="empty">{t('home.empty')}</p>;
  }
  return (
    <section aria-label={t('nav.galleries')}>
      <ul className="tile-grid">
        {topics.map((topic) => (
          <li key={topic.id}>
            <a className="tile" href={hrefFor({ page: 'gallery', slug: topic.slug })}>
              {topic.cover && <img src={topic.cover.display} alt="" loading="lazy" />}
              <span className="tile-title">{topic.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
