import { DEFAULT_SETTINGS } from '@rummy/engine';
import type { GameDoc, GameSummaryDoc } from '@rummy/data';
import { describe, expect, it } from 'vitest';
import type { GameRow } from './night';
import {
  colorSlots,
  filterGames,
  isBackwards,
  leaderboard,
  MAX_SERIES,
  percent,
  rangeFor,
  trends,
} from './stats';

const at = (y: number, m: number, d: number, h = 20) => new Date(y, m - 1, d, h).getTime();

interface Stat {
  net: number;
  position: number;
  roundsPlayed?: number;
  dropsTaken?: number;
  rejoins?: number;
}

function summary(
  outcome: 'outright' | 'split',
  winnerIds: string[],
  stats: Record<string, Stat>,
): GameSummaryDoc {
  return {
    outcome,
    winnerIds,
    pot: 30,
    payouts: {},
    rounds: 3,
    players: Object.fromEntries(
      Object.entries(stats).map(([id, s]) => [
        id,
        {
          net: s.net,
          position: s.position,
          roundsPlayed: s.roundsPlayed ?? 3,
          dropsTaken: s.dropsTaken ?? 0,
          rejoins: s.rejoins ?? 0,
          buyIns: 1,
        },
      ]),
    ),
    computedAt: 1,
  };
}

const finished = (id: string, createdAt: number, s: GameSummaryDoc): GameRow => ({
  id,
  doc: {
    settings: DEFAULT_SETTINGS,
    seatOrder: Object.keys(s.players),
    status: 'finished',
    createdBy: 'u',
    createdAt,
    split: null,
    summary: s,
    summaryError: null,
  } as GameDoc,
});

const inProgress = (id: string, createdAt: number): GameRow => ({
  id,
  doc: {
    ...finished(id, createdAt, summary('outright', [], {})).doc,
    status: 'inProgress',
    summary: null,
  },
});

// Three games between a, b and c.
const g1 = finished(
  'g1',
  at(2026, 8, 20),
  summary('outright', ['a'], {
    a: { net: 20, position: 1 },
    b: { net: -10, position: 2 },
    c: { net: -10, position: 3 },
  }),
);
const g2 = finished(
  'g2',
  at(2026, 9, 10),
  summary('outright', ['b'], {
    a: { net: -10, position: 3, dropsTaken: 2 },
    b: { net: 20, position: 1 },
    c: { net: -10, position: 2, rejoins: 1 },
  }),
);
const g3 = finished(
  'g3',
  at(2026, 10, 2),
  summary('split', ['a', 'b'], {
    a: { net: 5, position: 1 },
    b: { net: 5, position: 1 },
    c: { net: -10, position: 3 },
  }),
);
const games = [g3, g1, g2]; // deliberately out of order

describe('rangeFor', () => {
  const now = at(2026, 10, 15, 14);

  it('has no limits for all time', () => {
    expect(rangeFor('all', now)).toEqual({ from: null, to: null });
  });

  it('starts this month on the 1st', () => {
    expect(rangeFor('month', now)).toEqual({ from: new Date(2026, 9, 1).getTime(), to: null });
  });

  it('starts the last 3 months at the start of that day', () => {
    expect(rangeFor('3months', now)).toEqual({ from: new Date(2026, 6, 15).getTime(), to: null });
  });

  it('starts this year on 1 January', () => {
    expect(rangeFor('year', now)).toEqual({ from: new Date(2026, 0, 1).getTime(), to: null });
  });

  it('covers the whole of the last day of a custom range', () => {
    const r = rangeFor('custom', now, { from: '2026-09-01', to: '2026-09-30' });
    expect(r.from).toBe(new Date(2026, 8, 1).getTime());
    expect(r.to).toBe(new Date(2026, 9, 1).getTime() - 1);
  });

  it('leaves a side open when its date is blank or not a real date', () => {
    expect(rangeFor('custom', now, { from: '', to: '2026-09-30' }).from).toBeNull();
    expect(rangeFor('custom', now, { from: '2026-02-31', to: '' })).toEqual({
      from: null,
      to: null,
    });
    expect(rangeFor('custom', now, { from: 'soon', to: '' }).from).toBeNull();
    expect(rangeFor('custom', now)).toEqual({ from: null, to: null });
  });

  it('spots a range that runs backwards', () => {
    expect(isBackwards(rangeFor('custom', now, { from: '2026-10-01', to: '2026-09-01' }))).toBe(
      true,
    );
    expect(isBackwards(rangeFor('all', now))).toBe(false);
  });
});

describe('filterGames', () => {
  it('keeps only finished games, oldest first', () => {
    const out = filterGames([g3, inProgress('live', at(2026, 10, 3)), g1], rangeFor('all', 0));
    expect(out.map((g) => g.id)).toEqual(['g1', 'g3']);
  });

  it('includes both ends of the range', () => {
    const range = rangeFor('custom', 0, { from: '2026-09-10', to: '2026-10-02' });
    expect(filterGames(games, range).map((g) => g.id)).toEqual(['g2', 'g3']);
  });

  it('keeps games from the last moment of the last day', () => {
    const late = finished('late', new Date(2026, 8, 30, 23, 59).getTime(), g1.doc.summary!);
    const range = rangeFor('custom', 0, { from: '2026-09-30', to: '2026-09-30' });
    expect(filterGames([late], range)).toHaveLength(1);
  });

  it('ignores a finished game that has no summary yet', () => {
    const odd = { id: 'x', doc: { ...g1.doc, summary: null } };
    expect(filterGames([odd], rangeFor('all', 0))).toEqual([]);
  });

  it('is empty for a backwards range', () => {
    const range = rangeFor('custom', 0, { from: '2026-10-01', to: '2026-09-01' });
    expect(filterGames(games, range)).toEqual([]);
  });
});

describe('leaderboard', () => {
  const board = () =>
    Object.fromEntries(leaderboard(filterGames(games, rangeFor('all', 0))).map((p) => [p.id, p]));

  it('counts games, outright wins and shared wins separately', () => {
    expect(board().a).toMatchObject({ games: 3, outrightWins: 1, sharedWins: 1, wins: 2 });
    expect(board().b).toMatchObject({ games: 3, outrightWins: 1, sharedWins: 1, wins: 2 });
    expect(board().c).toMatchObject({ games: 3, outrightWins: 0, sharedWins: 0, wins: 0 });
  });

  it('works out win rate and average finishing position', () => {
    expect(board().a!.winRate).toBeCloseTo(2 / 3);
    expect(board().a!.avgPosition).toBeCloseTo((1 + 3 + 1) / 3);
    expect(board().c!.avgPosition).toBeCloseTo((3 + 2 + 3) / 3);
    expect(board().c!.winRate).toBe(0);
  });

  it('adds up net money, which sums to zero across the table', () => {
    expect(board().a!.net).toBe(15);
    expect(board().b!.net).toBe(15);
    expect(board().c!.net).toBe(-30);
    expect(Object.values(board()).reduce((n, p) => n + p.net, 0)).toBe(0);
  });

  it('adds up rounds survived, drops used and rejoins', () => {
    expect(board().a).toMatchObject({ roundsPlayed: 9, dropsTaken: 2, rejoins: 0 });
    expect(board().c).toMatchObject({ rejoins: 1 });
  });

  it('puts the best net first, then wins', () => {
    expect(leaderboard(games).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('only counts the games it is given, so a filter changes the table', () => {
    const recent = leaderboard(
      filterGames(games, rangeFor('custom', 0, { from: '2026-10-01', to: '' })),
    );
    expect(recent.map((p) => [p.id, p.games])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ]);
    expect(recent[0]).toMatchObject({ sharedWins: 1, outrightWins: 0 });
  });

  it('is empty with no games', () => {
    expect(leaderboard([])).toEqual([]);
  });

  it('shows someone who played only some of the games', () => {
    const solo = finished(
      's',
      at(2026, 10, 5),
      summary('outright', ['d'], { d: { net: 10, position: 1 }, a: { net: -10, position: 2 } }),
    );
    const d = leaderboard([solo]).find((p) => p.id === 'd')!;
    expect(d).toMatchObject({ games: 1, outrightWins: 1, winRate: 1, avgPosition: 1 });
  });
});

describe('trends', () => {
  const t = () => trends(filterGames(games, rangeFor('all', 0)));

  it('has one point per game, oldest first, numbered from 1', () => {
    expect(t().points.map((p) => [p.game, p.gameId])).toEqual([
      [1, 'g1'],
      [2, 'g2'],
      [3, 'g3'],
    ]);
  });

  it('keeps a running net per player', () => {
    expect(t().points.map((p) => p.net.a)).toEqual([20, 10, 15]);
    expect(t().points.map((p) => p.net.c)).toEqual([-10, -20, -30]);
  });

  it('keeps a running count of wins, shared ones included', () => {
    expect(t().points.map((p) => p.wins.a)).toEqual([1, 1, 2]);
    expect(t().points.map((p) => p.wins.b)).toEqual([0, 1, 2]);
  });

  it('lists everyone who played', () => {
    expect(t().ids.sort()).toEqual(['a', 'b', 'c']);
  });

  it('has no value for a player before their first game, rather than a zero', () => {
    const late = finished(
      'g4',
      at(2026, 10, 9),
      summary('outright', ['d'], { d: { net: 10, position: 1 }, a: { net: -10, position: 2 } }),
    );
    const out = trends([g1, late]);
    expect(out.points[0]!.net.d).toBeUndefined();
    expect(out.points[1]!.net.d).toBe(10);
    // Someone who sat the game out keeps their running total.
    expect(out.points[1]!.net.b).toBe(-10);
  });

  it('is empty with no games', () => {
    expect(trends([])).toEqual({ ids: [], points: [] });
  });

  it('does not change the points already worked out when a game is added', () => {
    const before = trends([g1, g2]).points;
    const after = trends([g1, g2, g3]).points;
    expect(after.slice(0, 2)).toEqual(before);
  });
});

describe('colorSlots', () => {
  it('gives the most active players the first slots, fixed by games over all time', () => {
    const slots = colorSlots(games);
    expect(Object.keys(slots).sort()).toEqual(['a', 'b', 'c']);
    expect(new Set(Object.values(slots)).size).toBe(3);
  });

  it('does not depend on the order the games are listed in', () => {
    expect(colorSlots([g1, g2, g3])).toEqual(colorSlots([g3, g2, g1]));
  });

  it('ignores games still in progress', () => {
    expect(colorSlots([inProgress('x', 1)])).toEqual({});
  });

  it('charts at most eight players and leaves the rest to the table', () => {
    const many: Record<string, Stat> = {};
    for (let i = 0; i < 10; i++) many[`p${i}`] = { net: 0, position: 1 };
    const slots = colorSlots([finished('big', 1, summary('outright', ['p0'], many))]);
    expect(Object.keys(slots)).toHaveLength(MAX_SERIES);
    expect(Math.max(...Object.values(slots))).toBe(MAX_SERIES - 1);
  });

  it('breaks ties between equally active players by id, so colours never reshuffle', () => {
    const slots = colorSlots([
      finished(
        'x',
        1,
        summary('outright', ['b'], { b: { net: 1, position: 1 }, a: { net: -1, position: 2 } }),
      ),
    ]);
    expect(slots).toEqual({ a: 0, b: 1 });
  });
});

describe('percent', () => {
  it('rounds to a whole number', () => {
    expect(percent(2 / 3)).toBe('67%');
    expect(percent(0)).toBe('0%');
    expect(percent(1)).toBe('100%');
  });
});
