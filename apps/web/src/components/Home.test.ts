import { rowSizes } from './Home';

describe('rowSizes', () => {
  it('fills each row with its number of galleries, repeating the last row', () => {
    expect(rowSizes(6, [1, 2])).toEqual([1, 2, 2, 2, 2, 2]);
    expect(rowSizes(4, [3, 1])).toEqual([3, 3, 3, 1]);
    expect(rowSizes(0, [2])).toEqual([]);
  });

  it('falls back to three per row when no rows are set', () => {
    expect(rowSizes(4, [])).toEqual([3, 3, 3, 3]);
  });
});
