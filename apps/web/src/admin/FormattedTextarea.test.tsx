import { createRef, useState } from 'react';
import type { ReactElement, Ref } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { applyFormat, COLORS, FormattedTextarea } from './FormattedTextarea';

const B = { open: '[b]', close: '[/b]' };

describe('applyFormat', () => {
  it('wraps a selection, or puts empty tags at the cursor', () => {
    expect(applyFormat('one two', 4, 7, B)).toEqual({ text: 'one [b]two[/b]', start: 4, end: 14 });
    expect(applyFormat('one', 3, 3, B)).toEqual({ text: 'one[b][/b]', start: 6, end: 6 });
    expect(applyFormat('one', 1, 1, null)).toEqual({ text: 'one', start: 1, end: 1 });
  });

  it('wraps each line on its own, keeping heading and quote marks, spaces, blank and picture lines', () => {
    const text = '## Title\n> quoted \n\n[photo abcd1234 left]\nplain';
    const out = applyFormat(text, 0, text.length, B);
    expect(out.text).toBe('## [b]Title[/b]\n> [b]quoted[/b] \n\n[photo abcd1234 left]\n[b]plain[/b]');
    expect(out).toMatchObject({ start: 0, end: out.text.length });
  });

  it('clears formatting from the selection only', () => {
    const text = '[b]a[/b] [color=#9b2226]b[/color] [i]c[/i]';
    expect(applyFormat(text, 0, 33, null).text).toBe('a b [i]c[/i]');
  });
});

function Editor({ start = 'hello world', boxRef }: { readonly start?: string; readonly boxRef?: Ref<HTMLTextAreaElement> }): ReactElement {
  const [value, setValue] = useState(start);
  return <FormattedTextarea label="Story" value={value} onChange={setValue} ref={boxRef} rows={3} />;
}

const select = (box: HTMLTextAreaElement, start: number, end: number): void => box.setSelectionRange(start, end);

describe('FormattedTextarea', () => {
  it('formats the selection from the toolbar and keeps it selected', () => {
    render(<Editor />);
    const box = screen.getByLabelText('Story') as HTMLTextAreaElement;
    expect(box.rows).toBe(3);
    expect(screen.getByRole('toolbar', { name: 'Story formatting' })).toBeTruthy();

    select(box, 6, 11);
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' }))).toBe(false); // keeps focus in the text box
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(box.value).toBe('hello [b]world[/b]');
    expect([box.selectionStart, box.selectionEnd]).toEqual([6, 18]);
    expect(document.activeElement).toBe(box);

    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Underline' }));
    fireEvent.click(screen.getByRole('button', { name: `Colour: ${(COLORS[2] as { name: string }).name}` }));
    expect(box.value).toBe('hello [color=#9b2226][u][i][b]world[/b][/i][/u][/color]');

    fireEvent.click(screen.getByRole('button', { name: 'Clear formatting' }));
    expect(box.value).toBe('hello world');
    select(box, 0, 5);
    fireEvent.click(screen.getByRole('button', { name: 'Clear formatting' })); // nothing to clear → unchanged
    expect(box.value).toBe('hello world');
  });

  it('has Ctrl/⌘ B, I and U shortcuts and leaves other keys alone', () => {
    render(<Editor />);
    const box = screen.getByLabelText('Story') as HTMLTextAreaElement;
    select(box, 0, 5);
    fireEvent.keyDown(box, { key: 'b', metaKey: true });
    expect(box.value).toBe('[b]hello[/b] world');
    select(box, 0, 0);
    fireEvent.keyDown(box, { key: 'I', ctrlKey: true });
    fireEvent.keyDown(box, { key: 'u', ctrlKey: true });
    expect(box.value).toBe('[i][u][/u][/i][b]hello[/b] world');
    for (const key of [{ key: 'b' }, { key: 'x', ctrlKey: true }, { key: 'b', ctrlKey: true, shiftKey: true }, { key: 'b', metaKey: true, altKey: true }]) {
      expect(fireEvent.keyDown(box, key)).toBe(true); // not handled
    }
    fireEvent.change(box, { target: { value: 'typed' } });
    expect(box.value).toBe('typed');
  });

  it('passes the text box to object and callback refs', () => {
    const object = createRef<HTMLTextAreaElement>();
    const { unmount } = render(<Editor boxRef={object} />);
    expect(object.current).toBe(screen.getByLabelText('Story'));
    unmount();
    const callback = vi.fn();
    render(<Editor boxRef={callback} />);
    expect(callback).toHaveBeenCalledWith(screen.getByLabelText('Story'));
  });
});
