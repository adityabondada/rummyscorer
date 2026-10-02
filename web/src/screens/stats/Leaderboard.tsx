import { useState } from 'react';
import { percent, type PlayerStats } from '../../lib/stats';
import { Card, cx, money } from '../../ui';

interface Column {
  key: string;
  label: string;
  /** Sort value; higher sorts first unless `ascending`. */
  value: (p: PlayerStats) => number;
  ascending?: boolean;
  cell: (p: PlayerStats) => string;
  title?: string;
}

// Net comes first: it is the default sort and the number people look for, so on a phone it must not
// scroll out of sight.
const leaderboardColumns: Column[] = [
  {
    key: 'net',
    label: 'Net',
    title: 'Money won minus buy-ins paid',
    value: (p) => p.net,
    cell: (p) => money(p.net),
  },
  { key: 'games', label: 'Games', value: (p) => p.games, cell: (p) => String(p.games) },
  {
    key: 'wins',
    label: 'Wins',
    title: 'Games won outright, taking the whole pot',
    value: (p) => p.outrightWins,
    cell: (p) => String(p.outrightWins),
  },
  {
    key: 'shared',
    label: 'Shared',
    title: 'Games won as part of a split',
    value: (p) => p.sharedWins,
    cell: (p) => String(p.sharedWins),
  },
  {
    key: 'rate',
    label: 'Win rate',
    title: 'Wins, including shared, as a share of games played',
    value: (p) => p.winRate,
    cell: (p) => percent(p.winRate),
  },
  {
    key: 'finish',
    label: 'Avg finish',
    title: '1 is first. Lower is better.',
    value: (p) => p.avgPosition,
    ascending: true,
    cell: (p) => p.avgPosition.toFixed(1),
  },
];

const gameStatColumns: Column[] = [
  {
    key: 'rounds',
    label: 'Rounds survived',
    value: (p) => p.roundsPlayed,
    cell: (p) => String(p.roundsPlayed),
  },
  {
    key: 'perGame',
    label: 'Per game',
    value: (p) => p.roundsPlayed / p.games,
    cell: (p) => (p.roundsPlayed / p.games).toFixed(1),
  },
  {
    key: 'drops',
    label: 'Drops used',
    value: (p) => p.dropsTaken,
    cell: (p) => String(p.dropsTaken),
  },
  { key: 'rejoins', label: 'Rejoins', value: (p) => p.rejoins, cell: (p) => String(p.rejoins) },
];

function StatsTable({
  caption,
  columns,
  rows,
  names,
  initialSort,
}: {
  caption: string;
  columns: Column[];
  rows: PlayerStats[];
  names: Record<string, string>;
  initialSort: string;
}) {
  const [sort, setSort] = useState(initialSort);
  const column = columns.find((c) => c.key === sort) ?? columns[0]!;
  const sorted = [...rows].sort(
    (a, b) =>
      (column.ascending ? column.value(a) - column.value(b) : column.value(b) - column.value(a)) ||
      (names[a.id] ?? '').localeCompare(names[b.id] ?? ''),
  );

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <caption className="px-3 pb-1 pt-3 text-left font-semibold">{caption}</caption>
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-2 py-2">
              Player
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={sort === c.key ? (c.ascending ? 'ascending' : 'descending') : 'none'}
                className="px-2 py-2 text-right"
              >
                <button
                  type="button"
                  title={c.title}
                  onClick={() => setSort(c.key)}
                  className={cx(
                    'uppercase tracking-wide',
                    sort === c.key ? 'font-bold text-slate-900' : 'hover:text-slate-800',
                  )}
                >
                  {c.label}
                  {sort === c.key && <span aria-hidden> {c.ascending ? '↑' : '↓'}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="border-t border-slate-100">
              <th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-medium">
                {names[p.id] ?? '?'}
              </th>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cx(
                    'whitespace-nowrap px-2 py-2 text-right tabular-nums',
                    c.key === 'net' && p.net < 0 && 'text-red-700',
                    c.key === 'net' && p.net > 0 && 'text-emerald-700',
                  )}
                >
                  {c.cell(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function Leaderboard({
  rows,
  names,
}: {
  rows: PlayerStats[];
  names: Record<string, string>;
}) {
  return (
    <>
      <StatsTable
        caption="Leaderboard"
        columns={leaderboardColumns}
        rows={rows}
        names={names}
        initialSort="net"
      />
      <StatsTable
        caption="Game stats"
        columns={gameStatColumns}
        rows={rows}
        names={names}
        initialSort="rounds"
      />
    </>
  );
}
