import { describe, expect, it } from 'vitest';
import { applyRound, initialState, replay } from './replay';
import { drop, mid, pts, round, settings } from './testing';
import { EngineError, type GameInput } from './types';
import { validateSettings } from './settings';

const game = (rounds: GameInput['rounds'], overrides = {}, seatOrder = ['A', 'B', 'C']) =>
  replay({ settings: settings(overrides), seatOrder, rounds });

describe('initial state', () => {
  it('has everyone in, a pot of buy-in x players, and the first seat dealing', () => {
    const s = initialState(settings({ buyIn: 10 }), ['A', 'B', 'C']);
    expect(s.pot).toBe(30);
    expect(s.dealerId).toBe('A');
    expect(s.firstPlayerId).toBe('B');
    expect(s.status).toBe('inProgress');
    expect(s.players.A).toMatchObject({ total: 0, dropsLeft: 2, active: true, buyIns: 1 });
  });

  it('needs two or more distinct players', () => {
    expect(() => initialState(settings(), ['A'])).toThrow(EngineError);
    expect(() => initialState(settings(), ['A', 'A'])).toThrow('more than once');
  });

  it('rejects settings that cannot be played', () => {
    expect(() => validateSettings(settings({ limit: 0 }))).toThrow();
    expect(() => validateSettings(settings({ maxRoundPenalty: 0 }))).toThrow();
    expect(() => validateSettings(settings({ rejoinCutoff: -1 }))).toThrow();
    expect(() =>
      validateSettings(settings({ dropsOnRejoin: { mode: 'grant', count: 3 } })),
    ).toThrow('maxDrops');
  });
});

describe('scoring a round', () => {
  it('gives the winner 0 and adds the others penalty points', () => {
    const s = game([round(1, 'A', { B: 30, C: 40 })]);
    expect(s.players.A!.total).toBe(0);
    expect(s.players.B!.total).toBe(30);
    expect(s.players.C!.total).toBe(40);
    expect(s.rounds[0]!.points).toEqual({ A: 0, B: 30, C: 40 });
  });

  it('adds up over rounds', () => {
    const s = game([round(1, 'A', { B: 30, C: 40 }), round(2, 'B', { A: 25, C: 10 })]);
    expect(s.players.A!.total).toBe(25);
    expect(s.players.B!.total).toBe(30);
    expect(s.players.C!.total).toBe(50);
  });

  it('needs a winner who is playing', () => {
    expect(() => game([round(1, 'Z', { A: 1, B: 1, C: 1 })])).toThrow('not playing');
  });

  it('needs an entry for every other active player and nobody else', () => {
    expect(() => game([round(1, 'A', { B: 30 })])).toThrow('Entries must cover');
    expect(() => game([round(1, 'A', { B: 30, C: 30, A: 5 })])).toThrow('Entries must cover');
    expect(() => game([round(1, 'A', { B: 30, Z: 30 })])).toThrow('Entries must cover');
  });

  it('rejects negative or fractional points', () => {
    expect(() => game([round(1, 'A', { B: -1, C: 5 })])).toThrow('Invalid points');
    expect(() => game([round(1, 'A', { B: 1.5, C: 5 })])).toThrow('Invalid points');
  });

  it('puts rounds in seq order and rejects repeats', () => {
    const a = round(1, 'A', { B: 5, C: 5 });
    const b = round(2, 'B', { A: 5, C: 5 });
    expect(game([b, a]).lastSeq).toBe(2);
    expect(() => game([a, { ...b, seq: 1 }])).toThrow('out of order');
  });
});

describe('penalty cap', () => {
  it('defaults to 80 and rejects more', () => {
    expect(game([round(1, 'A', { B: 80, C: 1 })]).players.B!.total).toBe(80);
    expect(() => game([round(1, 'A', { B: 81, C: 1 })])).toThrow('cap');
  });

  it('can be turned off', () => {
    expect(
      game([round(1, 'A', { B: 150, C: 1 })], { maxRoundPenalty: null }).players.B!.total,
    ).toBe(150);
  });

  it('can be set per game', () => {
    expect(() => game([round(1, 'A', { B: 41, C: 1 })], { maxRoundPenalty: 40 })).toThrow('cap');
  });
});

describe('drops', () => {
  it('apply the configured points and use up a drop', () => {
    const s = game([round(1, 'A', { B: drop, C: mid })]);
    expect(s.players.B).toMatchObject({ total: 20, dropsUsed: 1, dropsLeft: 1, dropsTaken: 1 });
    expect(s.players.C).toMatchObject({ total: 40, dropsUsed: 1, dropsLeft: 1 });
  });

  it('count drops and middle drops together toward the max', () => {
    const rounds = [
      round(1, 'A', { B: drop, C: 5 }),
      round(2, 'A', { B: mid, C: 5 }),
      round(3, 'A', { B: drop, C: 5 }),
    ];
    expect(() => game(rounds)).toThrow('no drops left');
    expect(game(rounds.slice(0, 2)).players.B).toMatchObject({ total: 60, dropsLeft: 0 });
  });

  it('use the per-game points and max', () => {
    const o = { dropPoints: 25, middleDropPoints: 50, maxDrops: 1 };
    const s = game([round(1, 'A', { B: drop, C: mid })], o);
    expect([s.players.B!.total, s.players.C!.total]).toEqual([25, 50]);
    expect(() =>
      game([round(1, 'A', { B: drop, C: 5 }), round(2, 'A', { B: drop, C: 5 })], o),
    ).toThrow('no drops left');
  });

  it('can be switched off with a max of 0', () => {
    expect(() => game([round(1, 'A', { B: drop, C: 5 })], { maxDrops: 0 })).toThrow('no drops');
  });

  it('are stored per round, so a scrapped round gives its drop back', () => {
    const dropRound = round(1, 'A', { B: drop, C: 5 });
    const scrapped = { ...dropRound, scrapped: { by: 'u', at: 1, reason: 'typo' } };
    expect(game([scrapped]).players.B).toMatchObject({ total: 0, dropsLeft: 2 });
  });
});

describe('elimination', () => {
  const small = { limit: 50, maxRoundPenalty: null };

  it('puts a player out only once their total goes past the limit', () => {
    const s = game([round(1, 'A', { B: 50, C: 51 })], small);
    expect(s.players.B!.active).toBe(true);
    expect(s.players.C!.active).toBe(false);
    expect(s.players.C!.eliminated).toEqual({ afterSeq: 1, total: 51 });
    expect(s.rounds[0]!.eliminated).toEqual(['C']);
  });

  it('leaves eliminated players out of later rounds', () => {
    const s = game([round(1, 'A', { B: 10, C: 51 }), round(2, 'A', { B: 10 })], small);
    expect(s.players.C!.total).toBe(51);
    expect(s.players.C!.roundsPlayed).toBe(1);
    expect(() =>
      game([round(1, 'A', { B: 10, C: 51 }), round(2, 'A', { B: 10, C: 5 })], small),
    ).toThrow('Entries must cover');
  });

  it('counts rounds survived', () => {
    const s = game(
      [round(1, 'A', { B: 10, C: 20 }), round(2, 'A', { B: 10, C: 40 }), round(3, 'A', { B: 5 })],
      small,
    );
    expect(s.players.C!.roundsPlayed).toBe(2);
    expect(s.players.B!.roundsPlayed).toBe(3);
  });

  it('never eliminates the round winner, so someone always stays in', () => {
    const s = game([round(1, 'A', { B: 60, C: 60 })], small);
    expect(s.players.A!.active).toBe(true);
    expect(s.status).toBe('finished');
  });
});

describe('dealer rotation', () => {
  it('moves to the next seat every round', () => {
    const s = game([
      round(1, 'A', { B: 5, C: 5 }),
      round(2, 'A', { B: 5, C: 5 }),
      round(3, 'A', { B: 5, C: 5 }),
    ]);
    expect(s.rounds.map((r) => r.dealerId)).toEqual(['A', 'B', 'C']);
    expect(s.dealerId).toBe('A');
    expect(s.firstPlayerId).toBe('B');
  });

  it('skips eliminated players', () => {
    const small = { limit: 50, maxRoundPenalty: null };
    // C is out after round 2, so after B deals round 2 the dealer is A, not C.
    const s = game([round(1, 'A', { B: 5, C: 5 }), round(2, 'A', { B: 5, C: 50 })], small);
    expect(s.players.C!.active).toBe(false);
    expect(s.rounds.map((r) => r.dealerId)).toEqual(['A', 'B']);
    expect(s.dealerId).toBe('A');
    expect(s.firstPlayerId).toBe('B');
  });

  it('keeps going when the dealer is the one eliminated', () => {
    const small = { limit: 50, maxRoundPenalty: null };
    const s = game([round(1, 'B', { A: 51, C: 5 })], small);
    expect(s.dealerId).toBe('B');
  });

  it('has no dealer once the game is over', () => {
    const s = game([round(1, 'A', { B: 100, C: 100 })], { limit: 50, maxRoundPenalty: null });
    expect(s.dealerId).toBeNull();
    expect(s.firstPlayerId).toBeNull();
  });
});

describe('outright win', () => {
  const small = { limit: 50, maxRoundPenalty: null, buyIn: 10 };

  it('ends the game when one player remains and pays them the pot', () => {
    const s = game([round(1, 'A', { B: 51, C: 20 }), round(2, 'A', { C: 31 })], small);
    expect(s.status).toBe('finished');
    expect(s.outcome).toBe('outright');
    expect(s.winnerIds).toEqual(['A']);
    expect(s.payouts).toEqual({ A: 30 });
  });

  it('accepts no more rounds after that', () => {
    const rounds = [round(1, 'A', { B: 51, C: 51 })];
    const s = game(rounds, small);
    expect(() => applyRound(s, round(2, 'A', {}))).toThrow('already over');
  });

  it('applyRound is pure', () => {
    const s = initialState(settings(), ['A', 'B']);
    const before = structuredClone(s);
    applyRound(s, round(1, 'A', { B: 10 }));
    expect(s).toEqual(before);
  });
});

describe('merged profiles', () => {
  const resolveId = (id: string) => (id === 'guest' ? 'member' : id);

  it('are resolved before replaying', () => {
    const s = replay(
      {
        settings: settings(),
        seatOrder: ['guest', 'B'],
        rounds: [round(1, 'guest', { B: 30 }), round(2, 'B', { guest: 20 })],
      },
      { resolveId },
    );
    expect(Object.keys(s.players).sort()).toEqual(['B', 'member']);
    expect(s.players.member!.total).toBe(20);
    expect(s.seatOrder).toEqual(['member', 'B']);
  });

  it('fail if both profiles are in the same game', () => {
    const input: GameInput = {
      settings: settings(),
      seatOrder: ['guest', 'member', 'B'],
      rounds: [],
    };
    expect(() => replay(input, { resolveId })).toThrow('more than once');
  });
});

describe('entry helpers', () => {
  it('pts builds a points entry', () => {
    expect(pts(5)).toEqual({ kind: 'points', points: 5 });
  });
});
