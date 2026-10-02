import { describe, expect, it } from 'vitest';
import { applyRound, initialState, replay } from './replay';
import { latestScrappable, restoreNext, scrapLatest } from './scrap';
import { summarize } from './settlement';
import { drop, mid, penaltyRound, round, settings } from './testing';
import { EngineError, type GameInput, type Round } from './types';

const game = (rounds: GameInput['rounds'], overrides = {}, seatOrder = ['A', 'B', 'C', 'D']) =>
  replay({ settings: settings(overrides), seatOrder, rounds });

describe('a penalty round', () => {
  it('gives the player with the penalty the full count and everyone else 0', () => {
    const s = game([penaltyRound(1, 'B', 80, { A: 'played', C: 'played', D: 'played' })]);
    expect(s.players.B!.total).toBe(80);
    for (const id of ['A', 'C', 'D']) expect(s.players[id]!.total).toBe(0);
    expect(s.rounds[0]).toMatchObject({
      winnerId: null,
      penalty: { playerId: 'B', points: 80, reason: 'wrongShow' },
      points: { A: 0, B: 80, C: 0, D: 0 },
    });
  });

  it('leaves players who dropped with their drop points, and uses up that drop', () => {
    const s = game([penaltyRound(1, 'B', 80, { A: drop, C: mid, D: 'played' })]);
    expect(s.players.A).toMatchObject({ total: 20, dropsLeft: 1, dropsTaken: 1 });
    expect(s.players.C).toMatchObject({ total: 40, dropsLeft: 1, dropsTaken: 1 });
    expect(s.players.D).toMatchObject({ total: 0, dropsLeft: 2, dropsTaken: 0 });
    expect(s.players.B).toMatchObject({ total: 80, dropsLeft: 2 });
  });

  it('can be for a smaller mistake than the full count', () => {
    const s = game([penaltyRound(1, 'C', 40, { A: 'played', B: 'played', D: 'played' }, 'error')]);
    expect(s.players.C!.total).toBe(40);
    expect(s.rounds[0]!.penalty).toEqual({ playerId: 'C', points: 40, reason: 'error' });
  });

  it('counts as a round played by everyone, and the deal moves on', () => {
    const s = game([penaltyRound(1, 'C', 80, { A: 'played', B: 'played', D: 'played' })]);
    expect(s.lastSeq).toBe(1);
    expect(s.dealerId).toBe('B');
    expect(s.firstPlayerId).toBe('C');
    expect(s.rounds[0]!.dealerId).toBe('A');
    for (const id of ['A', 'B', 'C', 'D']) expect(s.players[id]!.roundsPlayed).toBe(1);
  });

  it('adds to what a player already has, and mixes with ordinary rounds', () => {
    const s = game([
      round(1, 'A', { B: 30, C: 20, D: 10 }),
      penaltyRound(2, 'B', 80, { A: 'played', C: 'played', D: 'played' }),
      round(3, 'D', { A: 5, B: 15, C: 25 }),
    ]);
    expect(s.players.B!.total).toBe(125);
    expect(s.players.C!.total).toBe(45);
    expect(s.players.A!.total).toBe(5);
  });

  it('puts the player out when it takes them past the limit, and ends the game if one is left', () => {
    const s = game(
      [
        round(1, 'A', { B: 60, C: 70 }),
        penaltyRound(2, 'B', 50, { A: 'played', C: 'played' }, 'wrongShow'),
        penaltyRound(3, 'C', 40, { A: 'played' }, 'error'),
      ],
      { limit: 100, maxRoundPenalty: null },
      ['A', 'B', 'C'],
    );
    expect(s.rounds[1]!.eliminated).toEqual(['B']);
    expect(s.rounds[2]!.eliminated).toEqual(['C']);
    expect(s.status).toBe('finished');
    expect(s.winnerIds).toEqual(['A']);
    expect(summarize(s)!.net).toEqual({ A: 20, B: -10, C: -10 });
  });

  it('works with a rejoin after it', () => {
    const rejoin = { playerId: 'B', seatIndex: 1 };
    const s = game(
      [
        round(1, 'A', { B: 60, C: 10, D: 10 }),
        penaltyRound(2, 'B', 50, { A: 'played', C: 'played', D: 'played' }, 'wrongShow', [rejoin]),
      ],
      { limit: 100, maxRoundPenalty: null },
    );
    expect(s.players.B).toMatchObject({ active: true, total: 11, rejoins: 1, buyIns: 2 });
  });

  it('can be scrapped and restored like any other round', () => {
    const rounds: Round[] = [
      round(1, 'A', { B: 10, C: 10, D: 10 }),
      penaltyRound(2, 'B', 80, { A: 'played', C: 'played', D: 'played' }),
    ];
    const meta = { by: 'u', at: 1, reason: 'was a valid show' };
    expect(latestScrappable(rounds)?.seq).toBe(2);
    const scrapped = scrapLatest(rounds, meta);
    expect(game(scrapped).players.B!.total).toBe(10);
    const restored = restoreNext(scrapped);
    expect(game(restored).players.B!.total).toBe(90);
  });

  it('is applied without changing the state it started from', () => {
    const start = initialState(settings(), ['A', 'B', 'C']);
    const before = structuredClone(start);
    applyRound(start, penaltyRound(1, 'A', 80, { B: 'played', C: drop }));
    expect(start).toEqual(before);
  });
});

describe('a penalty round that is not allowed', () => {
  const start = () => initialState(settings(), ['A', 'B', 'C']);
  const reject = (r: Round, message: string) =>
    expect(() => applyRound(start(), r)).toThrow(new RegExp(message));

  it('has no winner', () => {
    reject(
      { ...penaltyRound(1, 'A', 80, { B: 'played', C: 'played' }), winnerId: 'B' },
      'no winner',
    );
  });

  it('needs an ordinary round to have a winner', () => {
    reject({ seq: 1, winnerId: null, entries: { A: { kind: 'points', points: 5 } } }, 'winner');
  });

  it('needs the player with the penalty to be playing', () => {
    reject(penaltyRound(1, 'Z', 80, { A: 'played', B: 'played', C: 'played' }), 'not playing');
  });

  it('needs a whole penalty above 0', () => {
    for (const points of [0, -5, 12.5]) {
      reject(penaltyRound(1, 'A', points, { B: 'played', C: 'played' }), 'whole number');
    }
  });

  it('cannot be more than the per-round cap', () => {
    reject(penaltyRound(1, 'A', 81, { B: 'played', C: 'played' }), '80 cap');
  });

  it('can be more than the default when the game has no cap', () => {
    const s = replay({
      settings: settings({ maxRoundPenalty: null, limit: 500 }),
      seatOrder: ['A', 'B'],
      rounds: [penaltyRound(1, 'A', 200, { B: 'played' })],
    });
    expect(s.players.A!.total).toBe(200);
  });

  it('cannot score anyone else', () => {
    reject(
      {
        ...penaltyRound(1, 'A', 80, { B: 'played', C: 'played' }),
        entries: { B: { kind: 'points', points: 30 }, C: { kind: 'points', points: 0 } },
      },
      'only the player with the penalty',
    );
  });

  it('needs an entry for everyone else, and nobody more', () => {
    reject(penaltyRound(1, 'A', 80, { B: 'played' }), 'every active player');
    reject(
      penaltyRound(1, 'A', 80, { B: 'played', C: 'played', A: 'played' }),
      'every active player',
    );
  });

  it('cannot give a drop to a player with none left', () => {
    const s = replay({
      settings: settings({ maxDrops: 1 }),
      seatOrder: ['A', 'B', 'C'],
      rounds: [round(1, 'A', { B: drop, C: 10 })],
    });
    expect(() => applyRound(s, penaltyRound(2, 'A', 80, { B: drop, C: 'played' }))).toThrow(
      'no drops left',
    );
  });

  it('needs a known reason', () => {
    const r = penaltyRound(1, 'A', 80, { B: 'played', C: 'played' });
    reject({ ...r, penalty: { ...r.penalty!, reason: 'cheating' as never } }, 'reason');
  });

  it('cannot put every player out of the game', () => {
    const s = replay({
      settings: settings({ limit: 30, maxRoundPenalty: null, dropPoints: 40 }),
      seatOrder: ['A', 'B', 'C'],
      rounds: [],
    });
    expect(() => applyRound(s, penaltyRound(1, 'A', 50, { B: drop, C: drop }))).toThrow(
      EngineError,
    );
  });
});

describe('penalty rounds and merged profiles', () => {
  it('follow the profile the player was merged into', () => {
    const s = replay(
      {
        settings: settings(),
        seatOrder: ['guest', 'B', 'C'],
        rounds: [penaltyRound(1, 'guest', 80, { B: 'played', C: 'played' })],
      },
      { resolveId: (id) => (id === 'guest' ? 'A' : id) },
    );
    expect(s.players.A!.total).toBe(80);
    expect(s.rounds[0]!.penalty!.playerId).toBe('A');
  });
});
