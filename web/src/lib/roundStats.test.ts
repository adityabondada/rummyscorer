import { DEFAULT_SETTINGS } from '@rummy/engine';
import type { GameDoc, GameSummaryDoc } from '@rummy/data';
import { describe, expect, it } from 'vitest';
import type { GameRow } from './night';
import { leaderboard, missingRoundStats, streakHighlights, streaks, trends } from './stats';

interface Stat {
  roundsPlayed?: number;
  roundsWon?: number;
  penalties?: number;
}

/** A finished game: who won it, and each player's rounds. Leave `roundsWon` out for an old summary. */
function game(
  n: number,
  winnerIds: string[],
  players: Record<string, Stat>,
  outcome: 'outright' | 'split' = 'outright',
): GameRow {
  const summary: GameSummaryDoc = {
    outcome,
    winnerIds,
    pot: 30,
    payouts: {},
    rounds: 5,
    players: Object.fromEntries(
      Object.entries(players).map(([id, s]) => [
        id,
        {
          net: winnerIds.includes(id) ? 10 : -10,
          position: winnerIds.includes(id) ? 1 : 2,
          roundsPlayed: s.roundsPlayed ?? 5,
          dropsTaken: 0,
          rejoins: 0,
          buyIns: 1,
          ...(s.roundsWon === undefined ? {} : { roundsWon: s.roundsWon }),
          ...(s.penalties === undefined ? {} : { penalties: s.penalties }),
        },
      ]),
    ),
    computedAt: 1,
  };
  return {
    id: `g${n}`,
    doc: {
      settings: DEFAULT_SETTINGS,
      seatOrder: Object.keys(players),
      status: 'finished',
      createdBy: 'u',
      createdAt: n * 1000,
      split: null,
      summary,
      summaryError: null,
    } as GameDoc,
  };
}

const all = { a: {}, b: {}, c: {} };

describe('streaks', () => {
  it('counts games won in a row, and the run a player is on now', () => {
    const result = streaks([
      game(1, ['a'], all),
      game(2, ['a'], all),
      game(3, ['a'], all),
      game(4, ['b'], all),
      game(5, ['a'], all),
    ]);
    expect(result.best).toEqual({ a: 3, b: 1, c: 0 });
    expect(result.current).toEqual({ a: 1, b: 0, c: 0 });
  });

  it('ends a run on a game lost, and a later run can be the longest', () => {
    const result = streaks([
      game(1, ['a'], all),
      game(2, ['b'], all),
      game(3, ['a'], all),
      game(4, ['a'], all),
    ]);
    expect(result.best.a).toBe(2);
    expect(result.current.a).toBe(2);
    expect(result.best.b).toBe(1);
    expect(result.current.b).toBe(0);
  });

  it('does not let a game someone sat out add to a run or break it', () => {
    const result = streaks([
      game(1, ['a'], all),
      game(2, ['b'], { b: {}, c: {} }),
      game(3, ['a'], all),
    ]);
    expect(result.best.a).toBe(2);
    expect(result.current.a).toBe(2);
  });

  it('counts a win shared in a split', () => {
    const result = streaks([
      game(1, ['a', 'b'], all, 'split'),
      game(2, ['a'], all),
      game(3, ['b'], all),
    ]);
    expect(result.best).toEqual({ a: 2, b: 1, c: 0 });
    expect(result.current).toEqual({ a: 0, b: 1, c: 0 });
  });

  it('has nothing to count with no games', () => {
    expect(streaks([])).toEqual({ best: {}, current: {} });
  });

  it('follows the order it is given, so the caller passes oldest first', () => {
    const result = streaks([game(1, ['a'], all), game(2, ['b'], all)]);
    expect(result.current).toEqual({ a: 0, b: 1, c: 0 });
  });
});

describe('streakHighlights', () => {
  const row = (id: string, bestStreak: number, currentStreak: number) =>
    ({ id, bestStreak, currentStreak }) as Parameters<typeof streakHighlights>[0][number];

  it('names the longest run and the longest run still going', () => {
    expect(streakHighlights([row('a', 4, 0), row('b', 3, 3), row('c', 1, 1)])).toEqual({
      longest: { ids: ['a'], length: 4 },
      now: { ids: ['b'], length: 3 },
    });
  });

  it('lists everyone sharing the top run, in a steady order', () => {
    expect(streakHighlights([row('c', 2, 0), row('a', 2, 0)]).longest).toEqual({
      ids: ['a', 'c'],
      length: 2,
    });
  });

  it('says nothing about a run of one, or about nobody', () => {
    expect(streakHighlights([row('a', 1, 1)])).toEqual({ longest: null, now: null });
    expect(streakHighlights([])).toEqual({ longest: null, now: null });
  });
});

describe('round stats in the leaderboard', () => {
  it('adds up rounds won and the share of rounds played', () => {
    const rows = leaderboard([
      game(1, ['a'], {
        a: { roundsPlayed: 6, roundsWon: 3 },
        b: { roundsPlayed: 6, roundsWon: 2 },
        c: { roundsPlayed: 2, roundsWon: 0 },
      }),
      game(2, ['b'], {
        a: { roundsPlayed: 4, roundsWon: 1 },
        b: { roundsPlayed: 4, roundsWon: 2 },
      }),
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.a).toMatchObject({ roundsWon: 4, roundsWithData: 10, roundsPlayed: 10 });
    expect(by.a!.roundWinRate).toBeCloseTo(0.4);
    expect(by.b).toMatchObject({ roundsWon: 4, roundsWithData: 10 });
    expect(by.c).toMatchObject({ roundsWon: 0, roundsWithData: 2, roundWinRate: 0 });
  });

  it('leaves games without round numbers out of the rate, instead of counting them as no wins', () => {
    const rows = leaderboard([
      game(1, ['a'], {
        a: { roundsPlayed: 3, roundsWon: 2 },
        b: { roundsPlayed: 3, roundsWon: 1 },
      }),
      game(2, ['a'], { a: { roundsPlayed: 10 }, b: { roundsPlayed: 10 } }),
    ]);
    const a = rows.find((r) => r.id === 'a')!;
    expect(a).toMatchObject({ roundsWon: 2, roundsWithData: 3, roundsPlayed: 13 });
    expect(a.roundWinRate).toBeCloseTo(2 / 3);
  });

  it('has no rate for a player with no round numbers at all', () => {
    const rows = leaderboard([game(1, ['a'], { a: {}, b: {} })]);
    expect(rows[0]).toMatchObject({ roundsWon: 0, roundsWithData: 0, roundWinRate: 0 });
  });

  it('adds up the penalty rounds each player took', () => {
    const rows = leaderboard([
      game(1, ['a'], { a: { penalties: 1 }, b: { penalties: 0 }, c: {} }),
      game(2, ['a'], { a: { penalties: 2 }, b: { penalties: 1 }, c: { penalties: 1 } }),
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.id, r.penalties]));
    expect(by).toEqual({ a: 3, b: 1, c: 1 });
  });

  it('carries each player s best and current streak', () => {
    const rows = leaderboard([game(1, ['a'], all), game(2, ['a'], all), game(3, ['b'], all)]);
    const by = Object.fromEntries(rows.map((r) => [r.id, [r.bestStreak, r.currentStreak]]));
    expect(by).toEqual({ a: [2, 0], b: [1, 1], c: [0, 0] });
  });
});

describe('missingRoundStats', () => {
  it('is true while any player in any game has no rounds won', () => {
    expect(missingRoundStats([game(1, ['a'], { a: { roundsWon: 1 }, b: {} })])).toBe(true);
    expect(missingRoundStats([game(1, ['a'], { a: {}, b: {} })])).toBe(true);
  });

  it('is false once every summary has them, and for no games', () => {
    expect(missingRoundStats([game(1, ['a'], { a: { roundsWon: 1 }, b: { roundsWon: 0 } })])).toBe(
      false,
    );
    expect(missingRoundStats([])).toBe(false);
  });

  it('ignores games with no summary', () => {
    const open: GameRow = { id: 'x', doc: { ...game(1, [], {}).doc, summary: null } };
    expect(missingRoundStats([open])).toBe(false);
  });
});

describe('rounds won over time', () => {
  it('keeps a running count, game by game', () => {
    const { points } = trends([
      game(1, ['a'], { a: { roundsWon: 3 }, b: { roundsWon: 2 } }),
      game(2, ['b'], { a: { roundsWon: 1 }, b: { roundsWon: 4 }, c: { roundsWon: 2 } }),
    ]);
    expect(points[0]!.roundWins).toEqual({ a: 3, b: 2 });
    expect(points[1]!.roundWins).toEqual({ a: 4, b: 6, c: 2 });
  });

  it('counts a summary without round numbers as none', () => {
    const { points } = trends([game(1, ['a'], { a: {}, b: { roundsWon: 2 } })]);
    expect(points[0]!.roundWins).toEqual({ a: 0, b: 2 });
  });
});
