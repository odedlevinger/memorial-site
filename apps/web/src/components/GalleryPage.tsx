import { useState } from 'react';
import type { ReactElement } from 'react';
import { imageUrl, type Gallery } from '../galleries';
import { hrefFor } from '../route';
import { Lightbox } from './Lightbox';

interface GalleryPageProps {
  readonly gallery: Gallery;
}

export function GalleryPage({ gallery }: GalleryPageProps): ReactElement {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section aria-labelledby="gallery-title">
      <p className="crumbs">
        <a href={hrefFor({ page: 'home' })}>Galleries</a> / {gallery.title}
      </p>
      <h1 id="gallery-title" className="page-title">{gallery.title}</h1>
      <ul className="photo-grid">
        {gallery.images.map((name, i) => (
          <li key={name}>
            <button className="photo" onClick={(): void => setOpen(i)} aria-label={`Open photo ${i + 1}`}>
              <img src={imageUrl(name)} alt="" loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <Lightbox
          title={gallery.title}
          images={gallery.images}
          index={open}
          onIndexChange={setOpen}
          onClose={(): void => setOpen(null)}
        />
      )}
    </section>
  );
}
