import { useEffect, useRef, useState } from 'react';
import type { GameState, PlayerState } from '@rummy/engine';
import { raceView, type RaceTone } from '../../lib/race';
import { dropsLabel } from '../../lib/roundEntry';
import { Badge, Card, cx } from '../../ui';

const barColor: Record<RaceTone, string> = {
  safe: 'bg-emerald-500',
  warn: 'bg-amber-500',
  danger: 'bg-red-500',
  out: 'bg-slate-300',
};

/** True for a moment after a player goes out, so their row can shake once. */
function useJustWentOut(active: boolean): boolean {
  const wasActive = useRef(active);
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (wasActive.current && !active) {
      setShaking(true);
      timer = setTimeout(() => setShaking(false), 700);
    }
    wasActive.current = active;
    return () => clearTimeout(timer);
  }, [active]);
  return shaking;
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
  const shaking = useJustWentOut(player.active);
  const id = player.id;

  return (
    <li className={cx('px-3 py-3', shaking && 'shake-once')} data-tone={view.tone}>
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
              <Badge tone="amber">Rejoined{player.rejoins > 1 ? ` ×${player.rejoins}` : ''}</Badge>
            )}
          </span>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <span className={cx('font-semibold', !player.active && 'text-slate-400')}>
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
        {state.seatOrder.map((id) => (
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
