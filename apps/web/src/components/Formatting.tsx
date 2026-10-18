import type { ReactNode } from 'react';

// Inline formatting editors add to any text box in the back office:
//   [b]bold[/b]   [i]italic[/i]   [u]underlined[/u]   [color=#9b2226]coloured[/color]
// Tags may nest. Formatting never crosses a line of a page's text: an unclosed tag runs to the
// end of its line, and a closing tag that matches nothing is dropped. Colours are #rgb or #rrggbb only.

export type Mark = 'b' | 'i' | 'u' | 'color';

const TAG = /\[(\/?)(b|i|u|color)(?:=(#[0-9a-f]{6}|#[0-9a-f]{3}))?\]/gi;

interface Node {
  readonly mark: Mark | null;
  readonly color?: string;
  readonly children: (Node | string)[];
}

/** Text with its formatting tags turned into elements (and URLs into links). */
export function formatInline(text: string): ReactNode[] {
  const root: Node = { mark: null, children: [] };
  const stack: Node[] = [root];
  let at = 0;
  for (const m of text.matchAll(TAG)) {
    const [whole, slash, name, color] = m as unknown as [string, string, string, string | undefined];
    const mark = name.toLowerCase() as Mark;
    const index = m.index as number;
    const top = stack[stack.length - 1] as Node;
    // [color] needs a value; anything malformed stays as plain text.
    if (!slash && mark === 'color' && !color) continue;
    if (index > at) top.children.push(text.slice(at, index));
    at = index + whole.length;
    if (!slash) {
      const node: Node = { mark, ...(color ? { color } : {}), children: [] };
      top.children.push(node);
      stack.push(node);
      continue;
    }
    let open = stack.length - 1;
    while (open > 0 && (stack[open] as Node).mark !== mark) open--;
    if (open > 0) stack.length = open; // closes it and anything opened inside it
  }
  if (at < text.length) (stack[stack.length - 1] as Node).children.push(text.slice(at));
  return render(root.children);
}

function render(children: readonly (Node | string)[]): ReactNode[] {
  return children.map((child, i) => {
    if (typeof child === 'string') return <span key={i}>{linkify(child)}</span>;
    const inner = render(child.children);
    switch (child.mark) {
      case 'b':
        return <strong key={i}>{inner}</strong>;
      case 'i':
        return <em key={i}>{inner}</em>;
      case 'u':
        return <u key={i}>{inner}</u>;
      default:
        return <span key={i} style={{ color: child.color }}>{inner}</span>;
    }
  });
}

const LINK = /(https?:\/\/[^\s]+|[^\s@]+@[^\s@]+\.[^\s@]+)/g;

/** URLs and email addresses in plain text, as links. */
export function linkify(text: string): ReactNode[] {
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
