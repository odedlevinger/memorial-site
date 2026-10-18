import { tileStarts } from './Home';

describe('tileStarts', () => {
  it('centres each row of same-size galleries, repeating the last row', () => {
    expect(tileStarts(6, [1, 2])).toEqual([3, 2, 4, 2, 4, 3]);
    expect(tileStarts(4, [3, 1])).toEqual([1, 3, 5, 3]);
    expect(tileStarts(0, [2])).toEqual([]);
  });

  it('centres a last row that is not full', () => {
    expect(tileStarts(5, [3])).toEqual([1, 3, 5, 2, 4]);
  });

  it('falls back to three per row when no rows are set', () => {
    expect(tileStarts(4, [])).toEqual([1, 3, 5, 3]);
  });
});
