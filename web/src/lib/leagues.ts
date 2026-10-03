import type { LeagueRow } from '../hooks';

/** What is known about a league's games: whether one is being played, and when the latest began. */
export interface LeagueActivity {
  live: boolean;
  /** When the latest game was started, or null if the league has none. */
  lastAt: number | null;
}

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const DAY = 24 * 60 * 60 * 1000;

/** "today", "yesterday", "Fri" within the last week, otherwise "Sep 12" (with the year if older). */
export function lastPlayedLabel(ms: number, now = Date.now(), locale?: string): string {
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return new Date(ms).toLocaleDateString(locale, { weekday: 'short' });
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
  return new Date(ms).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "2 leagues, tap one to open it". */
export function leagueCountLine(n: number): string {
  if (n === 0) return '';
  return n === 1 ? '1 league, tap it to open it' : `${n} leagues, tap one to open it`;
}

/** The first word of a name, for "Hi, Asha". */
export const firstName = (name: string | null | undefined): string =>
  (name ?? '').trim().split(/\s+/)[0] ?? '';

/**
 * Leagues with a game on come first, then the one played most recently, then the rest by name.
 * A league whose activity hasn't loaded yet sorts as if it had no games, so the list settles
 * rather than jumping once the numbers arrive for leagues that were already last.
 */
export function orderLeagues(
  leagues: LeagueRow[],
  activity: Record<string, LeagueActivity | undefined>,
): LeagueRow[] {
  return [...leagues].sort((a, b) => {
    const x = activity[a.id];
    const y = activity[b.id];
    return (
      Number(y?.live ?? false) - Number(x?.live ?? false) ||
      (y?.lastAt ?? 0) - (x?.lastAt ?? 0) ||
      a.doc.name.localeCompare(b.doc.name)
    );
  });
}
