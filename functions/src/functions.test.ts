import { describe, expect, it } from 'vitest';
import { CODE_LENGTH, generateInviteCode, normalizeInviteCode } from './inviteCode';
import { splitChanged } from './recompute';

describe('invite codes', () => {
  it('are the right length and avoid look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]+$/);
    }
  });

  it('are not all the same', () => {
    const codes = new Set(Array.from({ length: 50 }, generateInviteCode));
    expect(codes.size).toBeGreaterThan(45);
  });

  it('are normalised from what someone typed', () => {
    expect(normalizeInviteCode(' ab-cd 23 ')).toBe('ABCD23');
    expect(normalizeInviteCode('')).toBe('');
  });
});

describe('splitChanged', () => {
  const split = { afterSeq: 2, shares: { a: 10, b: 20 } };

  it('is false when the split is the same, whatever else changed', () => {
    expect(splitChanged({ split, status: 'inProgress' }, { split, status: 'finished' })).toBe(
      false,
    );
    expect(splitChanged({ split: null }, { split: null, summary: {} })).toBe(false);
  });

  it('is true when a split is recorded, changed or cleared', () => {
    expect(splitChanged({ split: null }, { split })).toBe(true);
    expect(splitChanged({ split }, { split: { ...split, shares: { a: 5, b: 25 } } })).toBe(true);
    expect(splitChanged({ split }, { split: null })).toBe(true);
  });

  it('treats a missing split as no split', () => {
    expect(splitChanged(undefined, { split: null })).toBe(false);
    expect(splitChanged({}, { split: null })).toBe(false);
    expect(splitChanged(undefined, { split })).toBe(true);
  });
});
