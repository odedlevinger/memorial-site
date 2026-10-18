import type { ReactElement } from 'react';
import type { Picture } from '../content';
import { useI18n } from '../i18n';
import { formatInline } from './Formatting';

// The body of a text or book page: plain text an editor types in the back office.
//   blank line         → new paragraph (single newlines are line breaks; URLs become links)
//   [b] [i] [u] [color=#…] → bold, italic, underline, colour (see Formatting.tsx)
//   ## Heading         → a sub-heading (any number of #)
//   > words            → a pull quote (consecutive > lines form one quote)
//   [photo ab12cd34]   → one of the page's pictures, full width, with its caption
//   [photo ab12cd34 ef56ab78] → several pictures side by side
//   [photo ab12cd34 left] / … right] → a smaller picture with the text flowing beside it
// Pictures are named by their id or its first 8 characters (the back office inserts these);
// a name that matches no published picture is skipped.

export type Align = 'full' | 'left' | 'right';

export type Block =
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'paragraph'; readonly lines: readonly string[] }
  | { readonly kind: 'quote'; readonly lines: readonly string[] }
  | { readonly kind: 'photos'; readonly refs: readonly string[]; readonly align: Align };

const PHOTO = /^\[photo\s+([^\]]+)\]$/i;
const HEADING = /^#+\s*(.*)$/;
const QUOTE = /^>\s?(.*)$/;

/** The short name the back office inserts for a picture. */
export function photoRef(picture: Pick<Picture, 'id'>): string {
  return picture.id.slice(0, 8);
}

export function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  let open = null as { kind: 'paragraph' | 'quote'; lines: string[] } | null;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const photo = PHOTO.exec(line);
    const heading = HEADING.exec(line);
    const quote = QUOTE.exec(line);
    if (!line) {
      open = null;
    } else if (photo) {
      open = null;
      const words = (photo[1] as string).split(/\s+/);
      const last = (words[words.length - 1] as string).toLowerCase();
      const align: Align = last === 'left' || last === 'right' ? last : 'full';
      const refs = align === 'full' ? words : words.slice(0, -1);
      blocks.push({ kind: 'photos', refs, align });
    } else if (heading) {
      open = null;
      blocks.push({ kind: 'heading', text: heading[1] as string });
    } else {
      const kind = quote ? 'quote' : 'paragraph';
      const text = quote ? (quote[1] as string) : line;
      if (open?.kind !== kind) {
        open = { kind, lines: [] };
        blocks.push(open);
      }
      open.lines.push(text);
    }
  }
  return blocks;
}

/** The picture a reference names: its full id, or (8+ characters) the start of its id. */
export function findPicture(pictures: readonly Picture[], ref: string): Picture | undefined {
  const r = ref.toLowerCase();
  return pictures.find((p) => p.id === r || (r.length >= 8 && p.id.startsWith(r)));
}

interface RichTextProps {
  readonly body: string;
  readonly pictures: readonly Picture[];
  /** Opens the viewer on a picture. */
  readonly onOpen: (picture: Picture) => void;
}

export function RichText({ body, pictures, onOpen }: RichTextProps): ReactElement {
  const { t } = useI18n();
  return (
    <div className="rich-text">
      {parseBlocks(body).map((block, i) => {
        switch (block.kind) {
          case 'heading':
            return <h2 key={i}>{formatInline(block.text)}</h2>;
          case 'quote':
            return (
              <blockquote key={i}>
                <Lines lines={block.lines} />
              </blockquote>
            );
          case 'paragraph':
            return (
              <p key={i}>
                <Lines lines={block.lines} />
              </p>
            );
          case 'photos': {
            const found = block.refs.map((r) => findPicture(pictures, r)).filter((p): p is Picture => p !== undefined);
            if (found.length === 0) return null;
            return (
              <div key={i} className={`rich-photos align-${block.align}`} style={{ ['--count' as string]: found.length }}>
                {found.map((p) => (
                  <figure key={p.id}>
                    <button type="button" className="rich-photo" onClick={(): void => onOpen(p)} aria-label={t('gallery.openPhoto', { n: pictures.indexOf(p) + 1 })}>
                      <img src={p.images.display} alt={p.caption ?? ''} loading="lazy" />
                    </button>
                    {p.caption && <figcaption>{p.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            );
          }
        }
      })}
    </div>
  );
}

function Lines({ lines }: { readonly lines: readonly string[] }): ReactElement {
  return (
    <>
      {lines.map((line, j) => (
        <span key={j}>
          {j > 0 && <br />}
          {formatInline(line)}
        </span>
      ))}
    </>
  );
}
