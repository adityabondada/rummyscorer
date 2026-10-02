import { useState } from 'react';
import { percent, streakHighlights, type PlayerStats } from '../../lib/stats';
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
const winningColumns: Column[] = [
  {
    key: 'net',
    label: 'Net',
    title: 'Money won minus buy-ins paid',
    value: (p) => p.net,
    cell: (p) => money(p.net),
  },
  {
    key: 'wins',
    label: 'Games won',
    title: 'Games won, including ones shared in a split',
    value: (p) => p.wins,
    cell: (p) => (p.sharedWins > 0 ? `${p.wins} (${p.sharedWins} shared)` : String(p.wins)),
  },
  {
    key: 'roundsWon',
    label: 'Rounds won',
    value: (p) => p.roundsWon,
    cell: (p) => (p.roundsWithData > 0 ? String(p.roundsWon) : '–'),
  },
  {
    key: 'roundRate',
    label: 'Round win %',
    title: 'Rounds won as a share of rounds played',
    value: (p) => p.roundWinRate,
    cell: (p) => (p.roundsWithData > 0 ? percent(p.roundWinRate) : '–'),
  },
];

const otherColumns: Column[] = [
  { key: 'games', label: 'Games', value: (p) => p.games, cell: (p) => String(p.games) },
  {
    key: 'finish',
    label: 'Avg finish',
    title: '1 is first. Lower is better.',
    value: (p) => p.avgPosition,
    ascending: true,
    cell: (p) => p.avgPosition.toFixed(1),
  },
  {
    key: 'streak',
    label: 'Best streak',
    title: 'Most games won in a row, counting only the games they played',
    value: (p) => p.bestStreak,
    cell: (p) => String(p.bestStreak),
  },
  {
    key: 'penalties',
    label: 'Penalties',
    title: 'Penalty rounds taken: a wrong show or another error',
    value: (p) => p.penalties,
    cell: (p) => String(p.penalties),
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

/** "Asha", "Asha and Bo", "Asha, Bo and Cy". */
const nameList = (ids: string[], names: Record<string, string>) => {
  const list = ids.map((id) => names[id] ?? '?');
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
};

function StreakCard({ rows, names }: { rows: PlayerStats[]; names: Record<string, string> }) {
  const { longest, now } = streakHighlights(rows);
  if (!longest && !now) return null;
  const games = (n: number) => `${n} games won in a row`;
  return (
    <Card className="space-y-1 text-sm">
      <h2 className="font-semibold">Streaks</h2>
      {longest && (
        <p>
          <span className="text-slate-500">Longest:</span>{' '}
          <strong className="font-medium">{nameList(longest.ids, names)}</strong>,{' '}
          {games(longest.length)}
          {longest.ids.length > 1 && ' each'}
        </p>
      )}
      {now && (
        <p>
          <span className="text-slate-500">On a streak now:</span>{' '}
          <strong className="font-medium">{nameList(now.ids, names)}</strong>, {games(now.length)}
          {now.ids.length > 1 && ' each'}
        </p>
      )}
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
        columns={winningColumns}
        rows={rows}
        names={names}
        initialSort="net"
      />
      <StreakCard rows={rows} names={names} />
      <StatsTable
        caption="More stats"
        columns={otherColumns}
        rows={rows}
        names={names}
        initialSort="games"
      />
    </>
  );
}
