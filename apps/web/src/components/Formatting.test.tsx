import { render } from '@testing-library/react';
import { formatInline } from './Formatting';

const html = (text: string): string => render(<p>{formatInline(text)}</p>).container.querySelector('p')?.innerHTML ?? '';

describe('formatInline', () => {
  it('leaves plain text alone', () => {
    expect(html('Just words')).toBe('<span>Just words</span>');
    expect(html('')).toBe('');
  });

  it('turns tags into bold, italic, underline and colour, nested, in any case', () => {
    expect(html('a [b]bold[/b] [I]it[/I] [u]under[/u] [color=#9B2226]red[/color]')).toBe(
      '<span>a </span><strong><span>bold</span></strong><span> </span><em><span>it</span></em><span> </span><u><span>under</span></u><span> </span>' +
        '<span style="color: rgb(155, 34, 38);"><span>red</span></span>',
    );
    expect(html('[b][i]both[/i][/b]')).toBe('<strong><em><span>both</span></em></strong>');
    expect(html('[color=#abc]short[/color]')).toBe('<span style="color: rgb(170, 187, 204);"><span>short</span></span>');
  });

  it('runs an unclosed tag to the end, closes inner tags with an outer one, and drops strays', () => {
    expect(html('[b]to the end')).toBe('<strong><span>to the end</span></strong>');
    expect(html('[b]x[i]y[/b]z')).toBe('<strong><span>x</span><em><span>y</span></em></strong><span>z</span>');
    expect(html('stray[/u] end')).toBe('<span>stray</span><span> end</span>');
  });

  it('keeps malformed tags as text', () => {
    expect(html('[color]x[/color] [color=red]y [color=#12]z [x]w')).toBe('<span>[color]x</span><span> [color=red]y [color=#12]z [x]w</span>');
  });

  it('links URLs and emails inside formatting', () => {
    expect(html('[b]see https://example.com.[/b]')).toBe(
      '<strong><span>see <span><a href="https://example.com">https://example.com</a>.</span></span></strong>',
    );
    expect(html('[i]a@b.co[/i]')).toBe('<em><span><span><a href="mailto:a@b.co">a@b.co</a></span></span></em>');
  });
});
