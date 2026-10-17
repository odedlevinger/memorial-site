import { yTicks } from './AdminActivity';

describe('yTicks', () => {
  it('gives clean whole-number ticks from 0 up to at least the maximum', () => {
    expect(yTicks(0)).toEqual([0, 1]);
    expect(yTicks(1)).toEqual([0, 1]);
    expect(yTicks(3)).toEqual([0, 1, 2, 3]);
    expect(yTicks(9)).toEqual([0, 5, 10]);
    expect(yTicks(37)).toEqual([0, 10, 20, 30, 40]);
    expect(yTicks(120)).toEqual([0, 50, 100, 150]);
  });
});
