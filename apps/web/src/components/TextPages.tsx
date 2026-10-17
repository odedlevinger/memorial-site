import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { contentApi, type Page, type PageSlug } from '../content';

export function About(): ReactElement {
  return <SitePage slug="about" title="About" />;
}

export function Contact(): ReactElement {
  return <SitePage slug="contact" title="Contact" />;
}

export function NotFound(): ReactElement {
  return (
    <article className="prose-page">
      <h1 className="page-title">Page not found</h1>
      <p><a href="#/">Return to the galleries</a></p>
    </article>
  );
}

/** About / Contact: text editors manage in the back office (Pages). */
function SitePage({ slug, title }: { readonly slug: PageSlug; readonly title: string }): ReactElement {
  const [page, setPage] = useState<Page | null | 'failed'>(null);

  useEffect(() => {
    let active = true;
    setPage(null);
    contentApi.publicPage(slug).then(
      (p) => active && setPage(p),
      () => active && setPage('failed'),
    );
    return (): void => {
      active = false;
    };
  }, [slug]);

  return (
    <article className="prose-page">
      <h1 className="page-title">{title}</h1>
      {page === null ? (
        <p className="empty">Loading…</p>
      ) : page === 'failed' ? (
        <p className="empty">Couldn’t load this page. Please try again later.</p>
      ) : (
        <PageText body={page.body} />
      )}
    </article>
  );
}

/** Blank lines → paragraphs, single newlines → line breaks, URLs and emails → links. */
export function PageText({ body }: { readonly body: string }): ReactElement {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <>
      {paragraphs.map((para, i) => (
        <p key={i}>
          {para.split('\n').map((line, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {linkify(line)}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

const LINK = /(https?:\/\/[^\s]+|[^\s@]+@[^\s@]+\.[^\s@]+)/g;

function linkify(text: string): ReactNode[] {
  return text.split(LINK).map((part, i) => {
    if (i % 2 === 0) return part;
    const target = part.replace(/[.,;:!?)]+$/, '');
    const trailing = part.slice(target.length);
    const href = target.includes('@') && !target.startsWith('http') ? `mailto:${target}` : target;
    return (
      <span key={i}>
        <a href={href}>{target}</a>
        {trailing}
      </span>
    );
  });
}
