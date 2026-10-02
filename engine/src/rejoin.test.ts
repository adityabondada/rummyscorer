import { describe, expect, it } from 'vitest';
import { applyRound, initialState, rejoinEligibility, replay } from './replay';
import { summarize } from './settlement';
import { drop, round, settings } from './testing';
import type { Round } from './types';

const base = { limit: 60, maxRoundPenalty: null, buyIn: 10 };
const game = (rounds: Round[], overrides = {}, seatOrder = ['A', 'B', 'C']) =>
  replay({ settings: settings({ ...base, ...overrides }), seatOrder, rounds });

// C uses a drop in round 1, then goes out in round 2 on 65. A is on 30 and B on 10 at that point.
const cOut = [round(1, 'A', { B: 10, C: drop }), round(2, 'B', { A: 30, C: 45 })];
const withRejoin = (seatIndex = 2) => [
  cOut[0]!,
  round(2, 'B', { A: 30, C: 45 }, [{ playerId: 'C', seatIndex }]),
];

describe('rejoin', () => {
  it('brings the player back at the highest active score plus one', () => {
    const s = game(withRejoin());
    expect(s.players.C).toMatchObject({ active: true, total: 31, rejoins: 1, buyIns: 2 });
    expect(s.players.C!.eliminated).toBeNull();
    expect(s.rounds[1]!.rejoined).toEqual(['C']);
  });

  it('adds the buy-in to the pot', () => {
    expect(game(cOut).pot).toBe(30);
    expect(game(withRejoin()).pot).toBe(40);
  });

  it('carries over the drops left before elimination by default', () => {
    expect(game(withRejoin()).players.C).toMatchObject({ dropsLeft: 1, dropsUsed: 1 });
  });

  it('can grant a set number of drops instead', () => {
    const grant = (count: number) => ({ dropsOnRejoin: { mode: 'grant' as const, count } });
    expect(game(withRejoin(), grant(2)).players.C).toMatchObject({ dropsLeft: 2, dropsUsed: 0 });
    expect(game(withRejoin(), grant(1)).players.C).toMatchObject({ dropsLeft: 1, dropsUsed: 1 });
    expect(game(withRejoin(), grant(0)).players.C).toMatchObject({ dropsLeft: 0, dropsUsed: 2 });
  });

  it('lets drops taken keep counting after a grant', () => {
    const s = game(withRejoin(), { dropsOnRejoin: { mode: 'grant', count: 2 } });
    expect(s.players.C!.dropsTaken).toBe(1);
  });

  it('places the player where members put them in the seat order', () => {
    expect(game(withRejoin(0)).seatOrder).toEqual(['C', 'A', 'B']);
    expect(game(withRejoin(1)).seatOrder).toEqual(['A', 'C', 'B']);
    expect(game(withRejoin(2)).seatOrder).toEqual(['A', 'B', 'C']);
  });

  it('rejects a seat that does not exist', () => {
    expect(() => game(withRejoin(3))).toThrow('Invalid seat');
    expect(() => game(withRejoin(-1))).toThrow('Invalid seat');
  });

  it('deals next to whoever sits after the dealer, so seating decides it', () => {
    // B dealt round 2. Whoever follows B in the new order deals round 3.
    expect(game(withRejoin(2)).dealerId).toBe('C'); // A, B, C
    expect(game(withRejoin(0)).dealerId).toBe('C'); // C, A, B: after B wraps to C
    expect(game(withRejoin(1)).dealerId).toBe('A'); // A, C, B: after B wraps to A
  });

  it('is only allowed for a player who is out', () => {
    const rounds = [round(1, 'A', { B: 10, C: 10 }, [{ playerId: 'B', seatIndex: 0 }])];
    expect(() => game(rounds)).toThrow('still in the game');
  });

  it('is rejected for an unknown player', () => {
    const rounds = [round(1, 'A', { B: 10, C: 61 }, [{ playerId: 'Z', seatIndex: 0 }])];
    expect(() => game(rounds)).toThrow('Unknown player');
  });

  it('can happen more than once for the same player', () => {
    // C goes 31 -> 71 in round 3 and comes back again on A's 30 + 1.
    const s = game([
      ...withRejoin(),
      round(3, 'A', { B: 5, C: 40 }, [{ playerId: 'C', seatIndex: 2 }]),
    ]);
    expect(s.players.C).toMatchObject({ active: true, total: 31, rejoins: 2, buyIns: 3 });
    expect(s.pot).toBe(50);
  });
});

describe('rejoin cutoff', () => {
  it('is off by default, so rejoin is always allowed', () => {
    expect(() => game(withRejoin())).not.toThrow();
  });

  it('blocks rejoin once the highest active score is past it', () => {
    expect(() => game(withRejoin(), { rejoinCutoff: 25 })).toThrow('Rejoin closed');
  });

  it('allows rejoin at exactly the cutoff', () => {
    expect(() => game(withRejoin(), { rejoinCutoff: 30 })).not.toThrow();
  });

  it('is reflected in rejoinEligibility', () => {
    const s = game(cOut, { rejoinCutoff: 25 });
    expect(rejoinEligibility(s, 'C')).toMatchObject({ ok: false });
    const open = game(cOut);
    expect(rejoinEligibility(open, 'C')).toEqual({ ok: true, entryScore: 31 });
  });
});

describe('rejoin limits', () => {
  it('is closed when the entry score would be past the limit', () => {
    // A stays on exactly 60, so a rejoiner would start on 61.
    const rounds = [round(1, 'B', { A: 60, C: 61 })];
    const s = game(rounds);
    expect(rejoinEligibility(s, 'C')).toMatchObject({ ok: false });
    expect(() =>
      game([round(1, 'B', { A: 60, C: 61 }, [{ playerId: 'C', seatIndex: 0 }])]),
    ).toThrow('past the limit');
  });

  it('cannot be used for an active player or after the game ends', () => {
    const s = game([round(1, 'A', { B: 5, C: 5 })]);
    expect(rejoinEligibility(s, 'B')).toMatchObject({ ok: false });
    const over = game([round(1, 'A', { B: 100, C: 100 })]);
    expect(rejoinEligibility(over, 'B')).toEqual({ ok: false, reason: 'The game is over' });
  });

  it('is not possible in the round that ends the game', () => {
    expect(() =>
      game([round(1, 'A', { B: 100, C: 100 }, [{ playerId: 'B', seatIndex: 0 }])]),
    ).toThrow('nobody can rejoin');
  });
});

describe('several rejoins in one break', () => {
  const four = ['A', 'B', 'C', 'D'];
  const rounds = [
    round(1, 'A', { B: 10, C: 61, D: 62 }, [
      { playerId: 'C', seatIndex: 1 },
      { playerId: 'D', seatIndex: 2 },
    ]),
  ];

  it('puts everyone back at the same score', () => {
    const s = game(rounds, {}, four);
    expect(s.players.C!.total).toBe(11);
    expect(s.players.D!.total).toBe(11);
    expect(s.pot).toBe(60);
  });

  it('places each one in turn', () => {
    expect(game(rounds, {}, four).seatOrder).toEqual(['A', 'C', 'D', 'B']);
  });
});

describe('dealer who rejoins', () => {
  it('is not dealer twice in a row: the player who followed them deals next', () => {
    // A deals round 1 and goes out; B wins, C scores 5. A rejoins seated last.
    const rounds = [round(1, 'B', { A: 61, C: 5 }, [{ playerId: 'A', seatIndex: 2 }])];
    const s = game(rounds);
    expect(s.seatOrder).toEqual(['B', 'C', 'A']);
    expect(s.dealerId).toBe('B');
  });
});

describe('net money with rejoins', () => {
  it('counts every buy-in a player paid', () => {
    // C pays twice, then B and C both go out in round 3 and A takes the pot.
    const s = game([...withRejoin(), round(3, 'A', { B: 60, C: 60 })]);
    const summary = summarize(s)!;
    expect(summary.pot).toBe(40);
    expect(summary.net.A).toBe(30);
    expect(summary.net.B).toBe(-10);
    expect(summary.net.C).toBe(-20);
  });
});

describe('initial rejoin state', () => {
  it('nobody can rejoin before anyone is out', () => {
    const s = initialState(settings(base), ['A', 'B']);
    expect(rejoinEligibility(s, 'A')).toMatchObject({ ok: false });
    expect(() =>
      applyRound(s, round(1, 'A', { B: 5 }, [{ playerId: 'B', seatIndex: 0 }])),
    ).toThrow();
  });
});
