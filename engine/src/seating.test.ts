import { describe, expect, it } from 'vitest';
import { rankValue, resolveSeating } from './seating';

describe('resolveSeating', () => {
  it('seats the lowest card as dealer, then the rest from highest card down', () => {
    // Spec example: 3, K, 9, 6 gives 3 -> K -> 9 -> 6.
    const result = resolveSeating({ a: ['3'], b: ['K'], c: ['9'], d: ['6'] });
    expect(result).toEqual({ resolved: true, seatOrder: ['a', 'b', 'c', 'd'] });
  });

  it('does not depend on the order players are listed in', () => {
    const result = resolveSeating({ d: ['6'], c: ['9'], b: ['K'], a: ['3'] });
    expect(result).toEqual({ resolved: true, seatOrder: ['a', 'b', 'c', 'd'] });
  });

  it('treats an ace as the lowest card', () => {
    expect(rankValue('A')).toBeLessThan(rankValue('2'));
    const result = resolveSeating({ a: ['2'], b: ['A'], c: ['K'] });
    expect(result).toEqual({ resolved: true, seatOrder: ['b', 'c', 'a'] });
  });

  it('asks only the tied players to redraw', () => {
    const result = resolveSeating({ a: ['5'], b: ['5'], c: ['2'], d: ['K'] });
    expect(result).toEqual({ resolved: false, redraw: [['a', 'b']] });
  });

  it('asks for a redraw in more than one place if needed', () => {
    const result = resolveSeating({ a: ['2'], b: ['7'], c: ['7'], d: ['K'], e: ['K'] });
    expect(result).toEqual({
      resolved: false,
      redraw: [
        ['b', 'c'],
        ['d', 'e'],
      ],
    });
  });

  it('settles a tie with the redraw', () => {
    const result = resolveSeating({ a: ['5', '9'], b: ['5', '2'], c: ['2'] });
    // Ascending: c (2), b (5, 2), a (5, 9). Dealer c, then highest first: a, b.
    expect(result).toEqual({ resolved: true, seatOrder: ['c', 'a', 'b'] });
  });

  it('keeps asking while the redraw ties again', () => {
    const result = resolveSeating({ a: ['5', '9'], b: ['5', '9'], c: ['2'] });
    expect(result).toEqual({ resolved: false, redraw: [['a', 'b']] });
  });

  it('asks for a card from anyone who has not drawn', () => {
    const result = resolveSeating({ a: ['5'], b: [], c: ['2'] });
    expect(result).toEqual({ resolved: false, redraw: [['b']] });
  });

  it('needs at least two players', () => {
    expect(() => resolveSeating({ a: ['5'] })).toThrow('two players');
  });
});
