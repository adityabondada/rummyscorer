import { describe, expect, it } from 'vitest';
import { quip, quipCount, type QuipKind } from './quips';

const kinds: QuipKind[] = ['slam', 'out', 'back'];

describe('the jokes', () => {
  it.each(kinds)('give %s a good few different lines', (kind) => {
    expect(quipCount(kind)).toBeGreaterThanOrEqual(6);
  });

  it.each(kinds)('always name the player and leave no gaps in %s lines', (kind) => {
    for (let i = 0; i < 60; i++) {
      const line = quip(kind, `${i}:p`, { name: 'Cy', cap: 80, buyIn: 10 });
      expect(line).not.toMatch(/[{}]/);
      if (kind !== 'back' || !line.includes('$')) expect(line).toContain('Cy');
    }
  });

  it('gives the same line for the same moment, so every screen shows the same joke', () => {
    expect(quip('slam', '3:c', { name: 'Cy' })).toBe(quip('slam', '3:c', { name: 'Cy' }));
  });

  it('varies from round to round', () => {
    const seen = new Set(
      Array.from({ length: 40 }, (_, i) => quip('out', `${i}:c`, { name: 'Cy' })),
    );
    expect(seen.size).toBeGreaterThan(3);
  });

  it('puts the cap and the buy-in in', () => {
    const slams = Array.from({ length: 40 }, (_, i) =>
      quip('slam', `${i}:c`, { name: 'Cy', cap: 40 }),
    );
    expect(slams.some((l) => l.includes('40'))).toBe(true);
    expect(slams.some((l) => l.includes('80'))).toBe(false);
    const backs = Array.from({ length: 40 }, (_, i) =>
      quip('back', `${i}:c`, { name: 'Cy', buyIn: 25 }),
    );
    expect(backs.some((l) => l.includes('$25'))).toBe(true);
  });
});
