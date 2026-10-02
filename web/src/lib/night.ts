import { simplifyTransfers, type Transfer } from '@rummy/engine';
import type { GameDoc } from '@rummy/data';

export interface GameRow {
  id: string;
  doc: GameDoc;
}

export interface Night {
  /** Local calendar day, "YYYY-MM-DD". */
  day: string;
  games: GameRow[];
  /** Each player's net over the night's finished games. */
  nets: Record<string, number>;
  transfers: Transfer[];
  /** Games still being played, which aren't in the nets yet. */
  inProgress: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Groups games by the day they were started, newest day first, with who owes whom over each night.
 * Only finished games count; their summaries already use merged player ids.
 */
export function nights(games: GameRow[]): Night[] {
  const byDay = new Map<string, GameRow[]>();
  for (const game of games) {
    const key = dayKey(game.doc.createdAt);
    byDay.set(key, [...(byDay.get(key) ?? []), game]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, dayGames]) => {
      const sorted = [...dayGames].sort((a, b) => a.doc.createdAt - b.doc.createdAt);
      const nets: Record<string, number> = {};
      for (const game of sorted) {
        for (const [id, stats] of Object.entries(game.doc.summary?.players ?? {})) {
          nets[id] = (nets[id] ?? 0) + stats.net;
        }
      }
      return {
        day,
        games: sorted,
        nets,
        transfers: simplifyTransfers(nets),
        inProgress: sorted.filter((g) => g.doc.status !== 'finished').length,
      };
    });
}
