import { useEffect, useMemo, useState } from 'react';
import { recomputeLeague } from '../api';
import { useGames } from '../hooks';
import { EmptyState } from '../suits';
import {
  colorSlots,
  filterGames,
  isBackwards,
  leaderboard,
  missingRoundStats,
  rangeFor,
  trends,
  type CustomDates,
  type Preset,
} from '../lib/stats';
import { Loading, cx } from '../ui';
import { useLeagueContext } from './LeagueLayout';
import { FilterBar } from './stats/FilterBar';
import { Leaderboard } from './stats/Leaderboard';
import { TrendChart, type Metric } from './stats/TrendChart';

const CHARTS: { metric: Metric; label: string; title: string; description: string }[] = [
  {
    metric: 'net',
    label: 'Net money',
    title: 'Net money over time',
    description: "Each player's running total, game by game.",
  },
  {
    metric: 'wins',
    label: 'Games won',
    title: 'Games won over time',
    description: 'Running count of games won, shared wins included.',
  },
  {
    metric: 'roundWins',
    label: 'Rounds won',
    title: 'Rounds won over time',
    description: 'Running count of rounds won, game by game.',
  },
];

export function StatsTab() {
  const { leagueId, names } = useLeagueContext();
  const games = useGames(leagueId);
  const [preset, setPreset] = useState<Preset>('all');
  const [custom, setCustom] = useState<CustomDates>({ from: '', to: '' });
  const [metric, setMetric] = useState<Metric>('net');

  const range = useMemo(() => rangeFor(preset, Date.now(), custom), [preset, custom]);
  const inRange = useMemo(() => filterGames(games.value, range), [games.value, range]);
  const board = useMemo(() => leaderboard(inRange), [inRange]);
  const trend = useMemo(() => trends(inRange), [inRange]);
  // Colours come from the whole league history so they hold still when the range changes.
  const slots = useMemo(() => colorSlots(games.value), [games.value]);

  // Games finished before rounds won were counted have no such numbers. Ask for them to be worked
  // out, once; the summaries then update by themselves.
  const olderGames = useMemo(
    () => missingRoundStats(filterGames(games.value, rangeFor('all', 0))),
    [games.value],
  );
  const [update, setUpdate] = useState<'idle' | 'running' | 'failed'>('idle');
  useEffect(() => {
    if (games.loading || !olderGames || update !== 'idle') return;
    setUpdate('running');
    recomputeLeague({ leagueId }).then(
      () => setUpdate('idle'),
      () => setUpdate('failed'),
    );
  }, [games.loading, olderGames, update, leagueId]);

  if (games.loading) return <Loading />;

  const finishedAtAll = filterGames(games.value, rangeFor('all', 0)).length;
  const series = trend.ids
    .filter((id) => slots[id] !== undefined)
    .map((id) => ({ id, name: names[id] ?? '?', slot: slots[id]! }))
    .sort((a, b) => a.slot - b.slot);
  const uncharted = trend.ids.length - series.length;
  const chart = CHARTS.find((c) => c.metric === metric)!;

  return (
    <>
      <FilterBar
        preset={preset}
        custom={custom}
        backwards={isBackwards(range)}
        onPreset={setPreset}
        onCustom={setCustom}
      />

      {finishedAtAll === 0 ? (
        <EmptyState title="Stats start with the first finished game">
          Scrapped rounds never count.
        </EmptyState>
      ) : inRange.length === 0 ? (
        <EmptyState title="No finished games in this time range">Try a wider range.</EmptyState>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {inRange.length} finished game{inRange.length === 1 ? '' : 's'}
          </p>
          <Leaderboard rows={board} names={names} />
          {olderGames && (
            <p role="status" className="text-sm text-slate-500">
              {update === 'failed'
                ? "Round stats are missing for some older games, and couldn't be worked out just now."
                : 'Working out round stats for older games…'}
            </p>
          )}
          <div role="group" aria-label="Chart" className="flex flex-wrap gap-2">
            {CHARTS.map((c) => (
              <button
                key={c.metric}
                type="button"
                aria-pressed={metric === c.metric}
                onClick={() => setMetric(c.metric)}
                className={cx(
                  'rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors',
                  metric === c.metric
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <TrendChart
            title={chart.title}
            description={chart.description}
            metric={metric}
            points={trend.points}
            series={series}
          />
          {uncharted > 0 && (
            <p className="text-sm text-slate-500">
              {uncharted} more player{uncharted === 1 ? ' is' : 's are'} in the tables but not drawn
              on the chart, which shows the eight most active.
            </p>
          )}
        </>
      )}
    </>
  );
}
