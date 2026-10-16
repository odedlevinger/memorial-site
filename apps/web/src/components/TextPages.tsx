import type { ReactElement } from 'react';

// Placeholder copy — replace with the real story and contact details.

export function About(): ReactElement {
  return (
    <article className="prose-page">
      <h1 className="page-title">About</h1>
      <p>
        This site gathers the photographs and moments of a life worth remembering — the streets
        walked, the faces loved, the light noticed on an ordinary afternoon.
      </p>
      <p>
        The pictures shown here are placeholders. They will be replaced with real photographs,
        together with the story behind them, as the family collects and shares them.
      </p>
    </article>
  );
}

export function Contact(): ReactElement {
  return (
    <article className="prose-page">
      <h1 className="page-title">Contact</h1>
      <p>
        To share a photograph, a memory, or a correction, please get in touch with the family.
        Contact details will be added here.
      </p>
    </article>
  );
}

export function NotFound(): ReactElement {
  return (
    <article className="prose-page">
      <h1 className="page-title">Page not found</h1>
      <p><a href="#/">Return to the galleries</a></p>
    </article>
  );
}
