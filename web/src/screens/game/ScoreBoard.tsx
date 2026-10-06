import { useEffect, useRef, useState } from 'react';
import { displayOrder, type GameState, type PlayerState } from '@rummy/engine';
import { quip } from '../../lib/quips';
import { raceView, type RaceTone } from '../../lib/race';
import { dropsLabel } from '../../lib/roundEntry';
import { Badge, Card, cx } from '../../ui';

const barColor: Record<RaceTone, string> = {
  safe: 'bg-emerald-500',
  warn: 'bg-amber-500',
  danger: 'bg-red-500',
  out: 'bg-slate-300',
};

type Moment = 'slam' | 'out' | 'back';

/** The most a player can take in a round: the game's cap, or 80 when there is none. */
const fullCount = (state: GameState) => state.settings.maxRoundPenalty ?? 80;

/**
 * What has just happened to this player, for a couple of seconds, so their row can react. Only
 * changes seen while the screen is open count, so opening a game never replays old news.
 */
function useMoments(state: GameState, player: PlayerState): Moment[] {
  const rounds = state.rounds.length;
  const seen = useRef({ rounds, active: player.active });
  const [moments, setMoments] = useState<Moment[]>([]);
  useEffect(() => {
    const before = seen.current;
    const now: Moment[] = [];
    const latest = state.rounds[rounds - 1];
    if (rounds > before.rounds && (latest?.points[player.id] ?? 0) >= fullCount(state)) {
      now.push('slam');
    }
    if (before.active && !player.active) now.push('out');
    if (!before.active && player.active) now.push('back');
    seen.current = { rounds, active: player.active };
    setMoments(now);
    if (now.length === 0) return;
    const timer = setTimeout(() => setMoments([]), 2300);
    return () => clearTimeout(timer);
    // The state object changes on every update; only these two things start a moment.
  }, [rounds, player.active]);
  return moments;
}

function RaceRow({
  state,
  player,
  name,
  grown,
}: {
  state: GameState;
  player: PlayerState;
  name: string;
  /** False on the first paint, so bars start empty and grow into place. */
  grown: boolean;
}) {
  const { limit } = state.settings;
  const view = raceView(player.total, limit, player.active);
  const moments = useMoments(state, player);
  const slam = moments.includes('slam');
  const out = moments.includes('out');
  const back = moments.includes('back');
  const id = player.id;
  // The same joke for the same round and player, on every screen watching the game.
  const key = `${state.rounds[state.rounds.length - 1]?.seq ?? 0}:${id}`;

  return (
    <li
      className={cx('relative px-3 py-3', out ? 'out-row' : back ? 'back-row' : slam && 'slam-row')}
      data-tone={view.tone}
      data-moment={moments.join(' ') || undefined}
    >
      <div className={cx(out && 'out-body')}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className={cx('font-medium', !player.active && 'text-slate-400 line-through')}>
              {name}
            </span>
            <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
              {id === state.dealerId && <Badge tone="green">Deals</Badge>}
              {id === state.firstPlayerId && <Badge>Plays first</Badge>}
              {!player.active && <Badge tone="red">Out</Badge>}
              {player.rejoins > 0 && (
                <Badge tone="amber">
                  Rejoined{player.rejoins > 1 ? ` ×${player.rejoins}` : ''}
                </Badge>
              )}
            </span>
          </div>
          <div className="shrink-0 text-right tabular-nums">
            <span
              className={cx(
                'font-semibold',
                !player.active && 'text-slate-400',
                slam && 'slam-number',
              )}
            >
              {player.total}
            </span>
            <span className="text-xs text-slate-400"> / {limit}</span>
          </div>
        </div>

        <div
          role="progressbar"
          aria-label={`${name}'s score`}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(player.total, limit)}
          aria-valuetext={`${player.total} of ${limit}`}
          className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className={cx(
              'h-full rounded-full transition-[width,background-color] duration-1000 ease-out',
              barColor[view.tone],
              view.pulse && 'danger-pulse',
            )}
            style={{ width: grown ? `${view.pct}%` : '0%' }}
          />
        </div>

        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
          <span>{player.active ? `Drops ${dropsLabel(state, id)}` : 'Out of the game'}</span>
          <span>
            {player.active
              ? view.left === 0
                ? 'At the limit'
                : `${view.left} to go`
              : `Went out on ${player.total}`}
          </span>
        </div>
      </div>
      {slam && (
        <span
          data-fx="slam"
          className="fx-chip absolute left-3 right-3 top-0 mx-auto w-fit max-w-full -translate-y-1/2 rounded-full bg-red-600 px-3 py-1 text-center text-xs font-bold text-white shadow"
        >
          {quip('slam', key, { name, cap: fullCount(state) })}
        </span>
      )}
      {back && (
        <span
          data-fx="back"
          className="fx-chip absolute left-3 right-3 top-0 mx-auto w-fit max-w-full -translate-y-1/2 rounded-full bg-emerald-600 px-3 py-1 text-center text-xs font-bold text-white shadow"
        >
          {quip('back', key, { name, buyIn: state.settings.buyIn })}
        </span>
      )}
      {out && (
        <>
          <span
            aria-hidden="true"
            className="fx-stamp absolute left-1/2 top-1/2 rounded-md border-4 border-red-600 px-3 py-0.5 text-2xl font-black uppercase tracking-widest text-red-600"
          >
            Out
          </span>
          <span
            data-fx="out"
            className="fx-chip absolute bottom-0 left-3 right-3 mx-auto w-fit max-w-full translate-y-1/2 rounded-full bg-slate-700 px-3 py-1 text-center text-xs font-bold text-white shadow"
          >
            {quip('out', key, { name })}
          </span>
        </>
      )}
    </li>
  );
}

/** The race to the limit: one bar per player, filling toward the score that puts them out. */
export function ScoreBoard({ state, names }: { state: GameState; names: Record<string, string> }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    // One frame after the first paint, so the bars have somewhere to grow from.
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between px-3 pt-3 text-xs uppercase tracking-wide text-slate-500">
        <span>Race to the limit</span>
        <span>Out past {state.settings.limit}</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {displayOrder(state).map((id) => (
          <RaceRow
            key={id}
            state={state}
            player={state.players[id]!}
            name={names[id] ?? '?'}
            grown={grown}
          />
        ))}
      </ul>
      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
        Pot ${state.pot} · {state.rounds.length} round{state.rounds.length === 1 ? '' : 's'} played
      </p>
    </Card>
  );
}
