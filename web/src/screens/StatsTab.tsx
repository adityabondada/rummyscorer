import { useMemo, useState } from 'react';
import { useGames } from '../hooks';
import { EmptyState } from '../suits';
import {
  colorSlots,
  filterGames,
  isBackwards,
  leaderboard,
  rangeFor,
  trends,
  type CustomDates,
  type Preset,
} from '../lib/stats';
import { Loading } from '../ui';
import { useLeagueContext } from './LeagueLayout';
import { FilterBar } from './stats/FilterBar';
import { Leaderboard } from './stats/Leaderboard';
import { TrendChart } from './stats/TrendChart';

export function StatsTab() {
  const { leagueId, names } = useLeagueContext();
  const games = useGames(leagueId);
  const [preset, setPreset] = useState<Preset>('all');
  const [custom, setCustom] = useState<CustomDates>({ from: '', to: '' });

  const range = useMemo(() => rangeFor(preset, Date.now(), custom), [preset, custom]);
  const inRange = useMemo(() => filterGames(games.value, range), [games.value, range]);
  const board = useMemo(() => leaderboard(inRange), [inRange]);
  const trend = useMemo(() => trends(inRange), [inRange]);
  // Colours come from the whole league history so they hold still when the range changes.
  const slots = useMemo(() => colorSlots(games.value), [games.value]);

  if (games.loading) return <Loading />;

  const finishedAtAll = filterGames(games.value, rangeFor('all', 0)).length;
  const series = trend.ids
    .filter((id) => slots[id] !== undefined)
    .map((id) => ({ id, name: names[id] ?? '?', slot: slots[id]! }))
    .sort((a, b) => a.slot - b.slot);
  const uncharted = trend.ids.length - series.length;

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
          <TrendChart
            title="Net money over time"
            description="Each player's running total, game by game."
            metric="net"
            points={trend.points}
            series={series}
          />
          <TrendChart
            title="Games won over time"
            description="Running count of games won, shared wins included."
            metric="wins"
            points={trend.points}
            series={series}
          />
          {uncharted > 0 && (
            <p className="text-sm text-slate-500">
              {uncharted} more player{uncharted === 1 ? ' is' : 's are'} in the tables but not drawn
              on the charts, which show the eight most active.
            </p>
          )}
        </>
      )}
    </>
  );
}
