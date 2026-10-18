import { useId, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent, ReactElement, Ref, TextareaHTMLAttributes } from 'react';

// A labelled text box with a small toolbar: bold, italic, underline and a few colours. It wraps the
// selected text in the tags components/Formatting.tsx understands. Formatting never crosses a
// line, so a selection over several lines is wrapped line by line (leaving out a heading's ##,
// a quote's > and picture lines).

/** Colours editors can pick: the site's own browns and a few quiet ink colours. */
export const COLORS: readonly { readonly name: string; readonly hex: string }[] = [
  { name: 'Brown', hex: '#6e5a43' },
  { name: 'Gold', hex: '#b38b52' },
  { name: 'Red', hex: '#9b2226' },
  { name: 'Blue', hex: '#1d4e89' },
  { name: 'Green', hex: '#2d6a4f' },
  { name: 'Grey', hex: '#6d6a64' },
];

interface Wrap {
  readonly open: string;
  readonly close: string;
}

const TAGS = /\[\/?(?:b|i|u|color)(?:=#[0-9a-fA-F]{3,6})?\]/g;
const PREFIX = /^(\s*(?:#+\s*|>\s?)?)(.*?)(\s*)$/;
const PHOTO = /^\s*\[photo\s[^\]]*\]\s*$/i;

/** `text` with the selection [start, end) wrapped (or, with `wrap` null, cleared of tags). */
export function applyFormat(text: string, start: number, end: number, wrap: Wrap | null): { text: string; start: number; end: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  if (start === end) {
    if (!wrap) return { text, start, end };
    const at = start + wrap.open.length;
    return { text: before + wrap.open + wrap.close + after, start: at, end: at };
  }
  const lines = text
    .slice(start, end)
    .split('\n')
    .map((line) => {
      if (!wrap) return line.replace(TAGS, '');
      const [, lead, body, trail] = PREFIX.exec(line) as unknown as [string, string, string, string];
      return body && !PHOTO.test(line) ? lead + wrap.open + body + wrap.close + trail : line;
    })
    .join('\n');
  return { text: before + lines + after, start, end: start + lines.length };
}

const KEYS: Readonly<Record<string, Wrap>> = {
  b: { open: '[b]', close: '[/b]' },
  i: { open: '[i]', close: '[/i]' },
  u: { open: '[u]', close: '[/u]' },
};

interface FormattedTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly ref?: Ref<HTMLTextAreaElement>;
}

export function FormattedTextarea({ label, value, onChange, ref, ...rest }: FormattedTextareaProps): ReactElement {
  const id = useId();
  const box = useRef<HTMLTextAreaElement | null>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);

  // Put the selection back around the text just formatted, once React has shown it.
  useLayoutEffect(() => {
    const s = selection.current;
    if (!s || !box.current) return;
    selection.current = null;
    box.current.focus();
    box.current.setSelectionRange(s.start, s.end);
  }, [value]);

  const apply = (wrap: Wrap | null): void => {
    const el = box.current as HTMLTextAreaElement; // rendered with the toolbar
    const next = applyFormat(value, el.selectionStart, el.selectionEnd, wrap);
    if (next.text === value) return;
    selection.current = { start: next.start, end: next.end };
    onChange(next.text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    const wrap = KEYS[e.key.toLowerCase()];
    if (!wrap || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    e.preventDefault();
    apply(wrap);
  };

  const setRef = (el: HTMLTextAreaElement | null): void => {
    box.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  // mousedown, not click, keeps the text box focused so its selection stays visible.
  const keep = (e: { preventDefault: () => void }): void => e.preventDefault();

  return (
    <div className="formatted">
      <label htmlFor={id}>{label}</label>
      <div className="format-bar" role="toolbar" aria-label={`${label} formatting`}>
        <button type="button" onMouseDown={keep} onClick={(): void => apply(KEYS.b as Wrap)} aria-label="Bold" title="Bold (Ctrl/⌘ B)"><b>B</b></button>
        <button type="button" onMouseDown={keep} onClick={(): void => apply(KEYS.i as Wrap)} aria-label="Italic" title="Italic (Ctrl/⌘ I)"><i>I</i></button>
        <button type="button" onMouseDown={keep} onClick={(): void => apply(KEYS.u as Wrap)} aria-label="Underline" title="Underline (Ctrl/⌘ U)"><u>U</u></button>
        <span className="format-sep" aria-hidden="true" />
        {COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            className="format-color"
            style={{ background: c.hex }}
            onMouseDown={keep}
            onClick={(): void => apply({ open: `[color=${c.hex}]`, close: '[/color]' })}
            aria-label={`Colour: ${c.name}`}
            title={c.name}
          />
        ))}
        <span className="format-sep" aria-hidden="true" />
        <button type="button" onMouseDown={keep} onClick={(): void => apply(null)} aria-label="Clear formatting" title="Clear formatting">⌫</button>
      </div>
      <textarea {...rest} id={id} ref={setRef} value={value} onKeyDown={onKeyDown} onChange={(e): void => onChange(e.target.value)} />
    </div>
  );
}
