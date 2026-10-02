import { describe, expect, it } from 'vitest';
import { applySplit, replay } from './replay';
import { simplifyTransfers, suggestSplit, summarize } from './settlement';
import { drop, round, settings } from './testing';
import type { GameState, PlayerId, Round } from './types';

const small = { limit: 50, maxRoundPenalty: null, buyIn: 10 };
const game = (rounds: Round[], overrides = {}, seatOrder = ['A', 'B', 'C']) =>
  replay({ settings: settings({ ...small, ...overrides }), seatOrder, rounds });

describe('summarize', () => {
  it('is null while the game is in progress', () => {
    expect(summarize(game([round(1, 'A', { B: 5, C: 5 })]))).toBeNull();
  });

  it('pays an outright winner the pot, and everyone else loses their buy-in', () => {
    const s = game([round(1, 'A', { B: 51, C: 51 })]);
    expect(summarize(s)).toMatchObject({
      outcome: 'outright',
      winnerIds: ['A'],
      pot: 30,
      payouts: { A: 30 },
      net: { A: 20, B: -10, C: -10 },
      rounds: 1,
    });
  });

  it('ranks players by when they went out, then by total', () => {
    const rounds = [
      round(1, 'A', { B: 51, C: 20, D: 30 }),
      round(2, 'A', { C: 31, D: 10 }),
      round(3, 'A', { D: 11 }),
    ];
    const s = game(rounds, {}, ['A', 'B', 'C', 'D']);
    expect(summarize(s)!.positions).toEqual({ A: 1, D: 2, C: 3, B: 4 });
  });

  it('gives players who went out together on the same total the same position', () => {
    const rounds = [round(1, 'A', { B: 55, C: 55, D: 10 }), round(2, 'A', { D: 45 })];
    const s = game(rounds, {}, ['A', 'B', 'C', 'D']);
    expect(summarize(s)!.positions).toEqual({ A: 1, D: 2, B: 3, C: 3 });
  });

  it('puts the lower total ahead when players go out in the same round', () => {
    const rounds = [round(1, 'A', { B: 60, C: 55, D: 10 }), round(2, 'A', { D: 45 })];
    const s = game(rounds, {}, ['A', 'B', 'C', 'D']);
    expect(summarize(s)!.positions).toMatchObject({ C: 3, B: 4 });
  });

  it('nets add up to zero', () => {
    const s = game([round(1, 'A', { B: 51, C: 51 })]);
    const total = Object.values(summarize(s)!.net).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });
});

describe('suggestSplit', () => {
  // Limit 201, $20 buy-in, 2 players, pot $40.
  // A ends on 80 with 1 drop left (weight 121 + 20 = 141); B on 160 with none (weight 41).
  const rounds = [
    round(1, 'A', { B: drop }),
    round(2, 'A', { B: drop }),
    round(3, 'A', { B: 80 }),
    round(4, 'B', { A: drop }),
    round(5, 'B', { A: 60 }),
    round(6, 'A', { B: 40 }),
  ];
  const state = () => game(rounds, { limit: 201, buyIn: 20, maxRoundPenalty: 80 }, ['A', 'B']);

  it('weights each player by distance from the limit plus the value of unused drops', () => {
    const s = state();
    expect(s.players.A).toMatchObject({ total: 80, dropsLeft: 1 });
    expect(s.players.B).toMatchObject({ total: 160, dropsLeft: 0 });
    expect(suggestSplit(s).weights).toEqual({ A: 141, B: 41 });
  });

  it('shares the pot in proportion to the weights, leftover to the lowest total', () => {
    // 40 x 141 / 182 = 30.98 -> 30, 40 x 41 / 182 = 9.01 -> 9, leftover $1 to A.
    expect(suggestSplit(state()).shares).toEqual({ A: 31, B: 9 });
  });

  it('gives more to the player with more drops left, all else equal', () => {
    const a = state();
    const even = structuredClone(a);
    even.players.A!.total = 100;
    even.players.B!.total = 100;
    even.players.B!.dropsLeft = 0;
    const { shares } = suggestSplit(even);
    expect(shares.A!).toBeGreaterThan(shares.B!);
  });

  it('always pays out exactly the pot', () => {
    const s = state();
    for (const pot of [1, 7, 40, 99]) {
      const { shares } = suggestSplit({ ...s, pot });
      expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBe(pot);
    }
  });

  it('splits evenly when there is nothing to weigh by', () => {
    const s = state();
    for (const id of ['A', 'B']) {
      s.players[id]!.total = 201;
      s.players[id]!.dropsLeft = 0;
    }
    expect(suggestSplit(s).shares).toEqual({ A: 20, B: 20 });
  });

  it('gives the leftover to the earlier seat when totals are level', () => {
    const s: GameState = state();
    s.pot = 10;
    s.seatOrder = ['A', 'B'];
    for (const id of ['A', 'B']) {
      s.players[id]!.total = 100;
      s.players[id]!.dropsLeft = 0;
    }
    s.pot = 11;
    expect(suggestSplit(s).shares).toEqual({ A: 6, B: 5 });
  });

  it('only includes players still in', () => {
    const s = game([round(1, 'A', { B: 51, C: 10 })]);
    expect(Object.keys(suggestSplit(s).shares).sort()).toEqual(['A', 'C']);
  });

  it('is not available once the game is over', () => {
    expect(() => suggestSplit(game([round(1, 'A', { B: 51, C: 51 })]))).toThrow('already over');
  });
});

describe('split', () => {
  const s = () => game([round(1, 'A', { B: 51, C: 10 })]);

  it('ends the game as a shared win and pays the agreed shares', () => {
    const done = applySplit(s(), { afterSeq: 1, shares: { A: 18, C: 12 } });
    expect(done).toMatchObject({ status: 'finished', outcome: 'split', winnerIds: ['A', 'C'] });
    expect(done.payouts).toEqual({ A: 18, C: 12 });
  });

  it('works through replay and shows in the summary', () => {
    const state = replay({
      settings: settings(small),
      seatOrder: ['A', 'B', 'C'],
      rounds: [round(1, 'A', { B: 51, C: 10 })],
      split: { afterSeq: 1, shares: { A: 18, C: 12 } },
    });
    expect(summarize(state)).toMatchObject({
      outcome: 'split',
      net: { A: 8, B: -10, C: 2 },
      positions: { A: 1, C: 1, B: 3 },
    });
  });

  it('can be overridden freely as long as it adds up to the pot', () => {
    expect(() => applySplit(s(), { afterSeq: 1, shares: { A: 30, C: 0 } })).not.toThrow();
    expect(() => applySplit(s(), { afterSeq: 1, shares: { A: 20, C: 1 } })).toThrow('pot is 30');
  });

  it('must name exactly the remaining players with whole, non-negative amounts', () => {
    expect(() => applySplit(s(), { afterSeq: 1, shares: { A: 30 } })).toThrow('every remaining');
    expect(() => applySplit(s(), { afterSeq: 1, shares: { A: 15, B: 15 } })).toThrow('every');
    expect(() => applySplit(s(), { afterSeq: 1, shares: { A: 35, C: -5 } })).toThrow('Invalid');
    expect(() => applySplit(s(), { afterSeq: 1, shares: { A: 15.5, C: 4.5 } })).toThrow('Invalid');
  });

  it('is ignored once a later round exists, which reopens the game', () => {
    const state = replay({
      settings: settings(small),
      seatOrder: ['A', 'B', 'C'],
      rounds: [round(1, 'A', { B: 51, C: 10 }), round(2, 'A', { C: 5 })],
      split: { afterSeq: 1, shares: { A: 18, C: 12 } },
    });
    expect(state.splitIgnored).toBe(true);
    expect(state.status).toBe('inProgress');
  });
});

describe('simplifyTransfers', () => {
  const apply = (
    nets: Record<PlayerId, number>,
    transfers: ReturnType<typeof simplifyTransfers>,
  ) => {
    const left = { ...nets };
    for (const t of transfers) {
      left[t.from] = (left[t.from] ?? 0) + t.amount;
      left[t.to] = (left[t.to] ?? 0) - t.amount;
    }
    return left;
  };

  it('pays the winner from each loser', () => {
    const nets = { A: 20, B: -10, C: -10 };
    const t = simplifyTransfers(nets);
    expect(t).toHaveLength(2);
    expect(Object.values(apply(nets, t)).every((n) => n === 0)).toBe(true);
  });

  it('settles equal debts and credits directly', () => {
    const nets = { A: 30, B: -30, C: 10, D: -10 };
    const t = simplifyTransfers(nets);
    expect(t).toHaveLength(2);
    expect(t).toContainEqual({ from: 'B', to: 'A', amount: 30 });
    expect(t).toContainEqual({ from: 'D', to: 'C', amount: 10 });
  });

  it('splits a debt across creditors when nothing matches exactly', () => {
    const nets = { A: 25, B: 15, C: -40 };
    const t = simplifyTransfers(nets);
    expect(t).toHaveLength(2);
    expect(Object.values(apply(nets, t)).every((n) => n === 0)).toBe(true);
  });

  it('uses no more than players - 1 transfers', () => {
    const nets = { A: 50, B: -20, C: -17, D: -13 };
    const t = simplifyTransfers(nets);
    expect(t.length).toBeLessThanOrEqual(3);
    expect(Object.values(apply(nets, t)).every((n) => n === 0)).toBe(true);
  });

  it('is empty when nobody owes anything', () => {
    expect(simplifyTransfers({ A: 0, B: 0 })).toEqual([]);
  });

  it('refuses nets that do not add up to zero', () => {
    expect(() => simplifyTransfers({ A: 10, B: -5 })).toThrow('zero');
  });

  it('works on a night of games added together', () => {
    const g1 = summarize(game([round(1, 'A', { B: 51, C: 51 })]))!.net;
    const g2 = summarize(game([round(1, 'B', { A: 51, C: 51 })]))!.net;
    const night: Record<PlayerId, number> = {};
    for (const net of [g1, g2])
      for (const [id, n] of Object.entries(net)) night[id] = (night[id] ?? 0) + n;
    expect(night).toEqual({ A: 10, B: 10, C: -20 });
    expect(simplifyTransfers(night)).toEqual([
      { from: 'C', to: 'A', amount: 10 },
      { from: 'C', to: 'B', amount: 10 },
    ]);
  });
});
