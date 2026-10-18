import type { Picture } from '../content';
import { findPicture, parseBlocks, photoRef } from './RichText';

const pic = (id: string): Picture => ({ id } as unknown as Picture);

describe('parseBlocks', () => {
  it('reads paragraphs, headings, quotes and photo lines', () => {
    const body = [
      '## Early years',
      'Born in New York.',
      'Raised in France.',
      '',
      '> A quote',
      '>  goes on',
      'and a paragraph right after',
      '[photo abcd1234]',
      '[PHOTO abcd1234 ef567890 Left]',
      '[photo abcd1234 right]',
      '#',
    ].join('\n');
    expect(parseBlocks(body)).toEqual([
      { kind: 'heading', text: 'Early years' },
      { kind: 'paragraph', lines: ['Born in New York.', 'Raised in France.'] },
      { kind: 'quote', lines: ['A quote', ' goes on'] },
      { kind: 'paragraph', lines: ['and a paragraph right after'] },
      { kind: 'photos', refs: ['abcd1234'], align: 'full' },
      { kind: 'photos', refs: ['abcd1234', 'ef567890'], align: 'left' },
      { kind: 'photos', refs: ['abcd1234'], align: 'right' },
      { kind: 'heading', text: '' },
    ]);
  });
});

describe('findPicture', () => {
  const pictures = [pic('abcd1234-0000'), pic('ef567890-1111')];

  it('matches a full id or its first 8+ characters, case-insensitively', () => {
    expect(findPicture(pictures, 'ef567890-1111')?.id).toBe('ef567890-1111');
    expect(findPicture(pictures, 'ABCD1234')?.id).toBe('abcd1234-0000');
    expect(findPicture(pictures, 'abcd')).toBeUndefined();
    expect(findPicture(pictures, 'ffffffff')).toBeUndefined();
    expect(photoRef(pictures[1]!)).toBe('ef567890');
  });
});
