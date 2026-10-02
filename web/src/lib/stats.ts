import type { GameRow } from './night';

/**
 * League stats, worked out from the cached summaries of finished games only: no rounds are read.
 * Summaries already leave out scrapped rounds and use merged player ids.
 */

export type Preset = 'all' | 'month' | 'year' | 'custom';

/** A span of time in milliseconds, both ends included. `null` means no limit on that side. */
export interface Range {
  from: number | null;
  to: number | null;
}

/** Dates picked by hand, as "YYYY-MM-DD". Either can be empty. */
export interface CustomDates {
  from: string;
  to: string;
}

export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'month', label: 'This month' },
  { id: 'year', label: 'This year' },
  { id: 'custom', label: 'Custom' },
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function parseDay(text: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Reject dates like 2026-02-31 that the Date constructor rolls over.
  return date.getMonth() === Number(m[2]) - 1 ? date : null;
}

export function rangeFor(preset: Preset, now: number, custom?: CustomDates): Range {
  const today = new Date(now);
  switch (preset) {
    case 'all':
      return { from: null, to: null };
    case 'month':
      return { from: new Date(today.getFullYear(), today.getMonth(), 1).getTime(), to: null };
    case 'year':
      return { from: new Date(today.getFullYear(), 0, 1).getTime(), to: null };
    case 'custom': {
      const from = parseDay(custom?.from ?? '');
      const to = parseDay(custom?.to ?? '');
      return {
        from: from ? startOfDay(from) : null,
        // The whole of the last day counts.
        to: to ? startOfDay(to) + 24 * 60 * 60 * 1000 - 1 : null,
      };
    }
  }
}

/** True when a custom range ends before it starts, which can never match a game. */
export const isBackwards = (range: Range) =>
  range.from !== null && range.to !== null && range.from > range.to;

/** Finished games inside the range, oldest first. */
export function filterGames(games: GameRow[], range: Range): GameRow[] {
  return games
    .filter(
      (g) =>
        g.doc.status === 'finished' &&
        g.doc.summary !== null &&
        (range.from === null || g.doc.createdAt >= range.from) &&
        (range.to === null || g.doc.createdAt <= range.to),
    )
    .sort((a, b) => a.doc.createdAt - b.doc.createdAt);
}

export interface PlayerStats {
  id: string;
  games: number;
  /** Won the whole pot. */
  outrightWins: number;
  /** In a split. */
  sharedWins: number;
  /** Outright plus shared wins. */
  wins: number;
  /** Wins as a share of games played, from 0 to 1. */
  winRate: number;
  /** Mean finishing position; 1 is best, and ties share a position. */
  avgPosition: number;
  /** Money won minus buy-ins paid, over all the games. */
  net: number;
  roundsPlayed: number;
  dropsTaken: number;
  rejoins: number;
  /** Rounds won. Only counts games whose summary has it (older ones are filled in on request). */
  roundsWon: number;
  /** Rounds played in those same games, so the win rate compares like with like. */
  roundsWithData: number;
  /** Rounds won as a share of rounds played, from 0 to 1. */
  roundWinRate: number;
  /** Penalty rounds taken: a wrong show or another error. */
  penalties: number;
  /** The most games won in a row, counting only the games they played. */
  bestStreak: number;
  /** Games won in a row up to the latest game they played. */
  currentStreak: number;
}

/** Everyone who played in these games, best net money first. */
export function leaderboard(games: GameRow[]): PlayerStats[] {
  const totals = new Map<string, PlayerStats & { positionSum: number }>();
  for (const { doc } of games) {
    const summary = doc.summary;
    if (!summary) continue;
    for (const [id, p] of Object.entries(summary.players)) {
      const row = totals.get(id) ?? {
        id,
        games: 0,
        outrightWins: 0,
        sharedWins: 0,
        wins: 0,
        winRate: 0,
        avgPosition: 0,
        net: 0,
        roundsPlayed: 0,
        dropsTaken: 0,
        rejoins: 0,
        roundsWon: 0,
        roundsWithData: 0,
        roundWinRate: 0,
        penalties: 0,
        bestStreak: 0,
        currentStreak: 0,
        positionSum: 0,
      };
      row.games += 1;
      row.positionSum += p.position;
      row.net += p.net;
      row.roundsPlayed += p.roundsPlayed;
      row.dropsTaken += p.dropsTaken;
      row.rejoins += p.rejoins;
      if (p.roundsWon !== undefined) {
        row.roundsWon += p.roundsWon;
        row.roundsWithData += p.roundsPlayed;
      }
      row.penalties += p.penalties ?? 0;
      if (summary.winnerIds.includes(id)) {
        if (summary.outcome === 'split') row.sharedWins += 1;
        else row.outrightWins += 1;
      }
      totals.set(id, row);
    }
  }
  const run = streaks(games);
  return [...totals.values()]
    .map(({ positionSum, ...row }) => ({
      ...row,
      wins: row.outrightWins + row.sharedWins,
      winRate: (row.outrightWins + row.sharedWins) / row.games,
      avgPosition: positionSum / row.games,
      roundWinRate: row.roundsWithData > 0 ? row.roundsWon / row.roundsWithData : 0,
      bestStreak: run.best[row.id] ?? 0,
      currentStreak: run.current[row.id] ?? 0,
    }))
    .sort((a, b) => b.net - a.net || b.wins - a.wins || a.id.localeCompare(b.id));
}

export interface Streaks {
  /** Each player's longest run of games won, and the run they are on now. */
  best: Record<string, number>;
  current: Record<string, number>;
}

/**
 * Games won in a row. A run only counts the games a player was in: a game they sat out neither
 * adds to it nor breaks it, as not everyone plays every week. A shared win counts as a win.
 * `games` must be oldest first, as `filterGames` returns them.
 */
export function streaks(games: GameRow[]): Streaks {
  const best: Record<string, number> = {};
  const current: Record<string, number> = {};
  for (const { doc } of games) {
    const summary = doc.summary;
    if (!summary) continue;
    for (const id of Object.keys(summary.players)) {
      current[id] = summary.winnerIds.includes(id) ? (current[id] ?? 0) + 1 : 0;
      best[id] = Math.max(best[id] ?? 0, current[id]!);
    }
  }
  return { best, current };
}

/** A run worth showing: the longest, and who has it (ties share it). */
export interface Run {
  ids: string[];
  length: number;
}

/** Streaks that are worth a mention (at least two in a row): the record, and who is on one now. */
export function streakHighlights(rows: PlayerStats[]): { longest: Run | null; now: Run | null } {
  const top = (value: (p: PlayerStats) => number): Run | null => {
    const length = Math.max(0, ...rows.map(value));
    if (length < 2) return null;
    const ids = rows
      .filter((p) => value(p) === length)
      .map((p) => p.id)
      .sort();
    return { ids, length };
  };
  return { longest: top((p) => p.bestStreak), now: top((p) => p.currentStreak) };
}

/** True when any game in the list has no rounds-won numbers yet. */
export const missingRoundStats = (games: GameRow[]): boolean =>
  games.some(
    ({ doc }) =>
      doc.summary !== null &&
      Object.values(doc.summary.players).some((p) => p.roundsWon === undefined),
  );

export interface TrendPoint {
  /** 1 for the first game in the range. */
  game: number;
  gameId: string;
  at: number;
  /** Running net money after this game. Missing until the player's first game. */
  net: Record<string, number>;
  /** Running count of games won (outright or shared). */
  wins: Record<string, number>;
  /** Running count of rounds won. */
  roundWins: Record<string, number>;
}

/** Running net money and wins after each game, oldest first, for everyone who played. */
export function trends(games: GameRow[]): { ids: string[]; points: TrendPoint[] } {
  const net: Record<string, number> = {};
  const wins: Record<string, number> = {};
  const roundWins: Record<string, number> = {};
  const points: TrendPoint[] = [];

  games.forEach(({ id, doc }, index) => {
    const summary = doc.summary;
    if (!summary) return;
    for (const [pid, p] of Object.entries(summary.players)) {
      net[pid] = (net[pid] ?? 0) + p.net;
      wins[pid] = (wins[pid] ?? 0) + (summary.winnerIds.includes(pid) ? 1 : 0);
      roundWins[pid] = (roundWins[pid] ?? 0) + (p.roundsWon ?? 0);
    }
    points.push({
      game: index + 1,
      gameId: id,
      at: doc.createdAt,
      net: { ...net },
      wins: { ...wins },
      roundWins: { ...roundWins },
    });
  });
  return { ids: Object.keys(net), points };
}

/** Categorical colours available to a chart; more players than this go in the table only. */
export const MAX_SERIES = 8;

/**
 * Each charted player's colour slot. It comes from games played over the whole league history, not
 * the current filter, so a player keeps their colour when the time range changes. Players beyond
 * the eighth are left out (they still appear in the table).
 */
export function colorSlots(allGames: GameRow[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const { doc } of allGames) {
    if (doc.status !== 'finished' || !doc.summary) continue;
    for (const id of Object.keys(doc.summary.players)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const order = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return Object.fromEntries(order.slice(0, MAX_SERIES).map(([id], slot) => [id, slot]));
}

export const percent = (share: number) => `${Math.round(share * 100)}%`;
