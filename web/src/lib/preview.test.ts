import { DEFAULT_SETTINGS, replay, type Round } from '@rummy/engine';
import { describe, expect, it } from 'vitest';
import { emptyForm, previewRound, type RoundForm } from './roundEntry';

const pts = (points: number) => ({ kind: 'points' as const, points });
const settings = { ...DEFAULT_SETTINGS, limit: 100, maxRoundPenalty: 80 };
const play = (rounds: Round[] = []) => replay({ settings, seatOrder: ['a', 'b', 'c'], rounds });

const win = (winnerId: string | null, entries: RoundForm['entries']): RoundForm => ({
  ...emptyForm(80),
  winnerId,
  entries,
});
const penalty = (
  playerId: string | null,
  points: string,
  drops: RoundForm['drops'] = {},
): RoundForm => ({
  ...emptyForm(80),
  mode: 'penalty',
  penalty: { playerId, points, reason: 'wrongShow' },
  drops,
});

describe('the preview of a round', () => {
  it('shows nothing until there is a winner', () => {
    expect(previewRound(play(), win(null, {}), 1)).toEqual({
      totals: {},
      out: [],
      close: [],
      winners: null,
    });
  });

  it('shows the winner at their current total, and others once their points are in', () => {
    const state = play([{ seq: 1, winnerId: 'c', entries: { a: pts(10), b: pts(20) } }]);
    const preview = previewRound(state, win('a', { b: { kind: 'points', points: '15' } }), 2);
    expect(preview.totals).toEqual({ a: 10, b: 35 });
    expect(preview.totals.c).toBeUndefined();
  });

  it('adds the drop points for a drop and a middle drop', () => {
    const preview = previewRound(
      play(),
      win('a', { b: { kind: 'drop' }, c: { kind: 'middleDrop' } }),
      1,
    );
    expect(preview.totals).toEqual({ a: 0, b: 20, c: 40 });
  });

  it('leaves out a player whose points are blank or not a number yet', () => {
    const preview = previewRound(
      play(),
      win('a', { b: { kind: 'points', points: '' }, c: { kind: 'points', points: '4x' } }),
      1,
    );
    expect(preview.totals).toEqual({ a: 0 });
  });

  it('marks a player who would go past the limit as out, and one near it as close', () => {
    const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(50), c: pts(50) } }]);
    const preview = previewRound(
      state,
      win('a', { b: { kind: 'points', points: '51' }, c: { kind: 'points', points: '36' } }),
      2,
    );
    expect(preview.totals).toEqual({ a: 0, b: 101, c: 86 });
    expect(preview.out).toEqual(['b']);
    expect(preview.close).toEqual(['c']);
  });

  it('does not call a player out for landing exactly on the limit', () => {
    const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(50), c: pts(0) } }]);
    const preview = previewRound(state, win('a', { b: { kind: 'points', points: '50' } }), 2);
    expect(preview.totals.b).toBe(100);
    expect(preview.out).toEqual([]);
    expect(preview.close).toEqual(['b']);
  });

  it('says who wins when the round ends the game, once the round is complete', () => {
    const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(60), c: pts(60) } }]);
    const complete = win('a', {
      b: { kind: 'points', points: '50' },
      c: { kind: 'points', points: '50' },
    });
    expect(previewRound(state, complete, 2).winners).toEqual(['a']);
    const partial = win('a', { b: { kind: 'points', points: '50' } });
    const half = previewRound(state, partial, 2);
    expect(half.out).toEqual(['b']);
    expect(half.winners).toBeNull();
  });

  it('does not end the game when someone else is still in', () => {
    const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(60), c: pts(10) } }]);
    const preview = previewRound(
      state,
      win('a', { b: { kind: 'points', points: '50' }, c: { kind: 'points', points: '5' } }),
      2,
    );
    expect(preview.winners).toBeNull();
  });

  describe('a penalty round', () => {
    it('shows the penalty on one player and 0, or the drop, on the rest', () => {
      const preview = previewRound(play(), penalty('b', '80', { c: { kind: 'drop' } }), 1);
      expect(preview.totals).toEqual({ a: 0, b: 80, c: 20 });
      // 80 of 100 is not yet close enough to the limit to flag.
      expect(preview.close).toEqual([]);
    });

    it('shows nothing until someone is picked and the points are a number', () => {
      expect(previewRound(play(), penalty(null, '80'), 1).totals).toEqual({});
      expect(previewRound(play(), penalty('b', ''), 1).totals).toEqual({});
      expect(previewRound(play(), penalty('b', 'x'), 1).totals).toEqual({});
    });

    it('marks the player as out when the penalty takes them past the limit', () => {
      const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(40), c: pts(0) } }]);
      const preview = previewRound(state, penalty('b', '80'), 2);
      expect(preview.totals.b).toBe(120);
      expect(preview.out).toEqual(['b']);
    });
  });
});
