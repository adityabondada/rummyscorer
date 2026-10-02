import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GameState } from '@rummy/engine';
import { gameView } from '../api';
import { reasonLabel } from '../lib/roundEntry';
import { Badge, Card, Loading, cx } from '../ui';
import { ResultCard } from './game/ResultCard';
import { ScoreBoard } from './game/ScoreBoard';

interface View {
  leagueName: string;
  names: Record<string, string>;
  startedAt: number;
  state: GameState;
}

type Load =
  { status: 'loading' } | { status: 'ok'; view: View; stale: boolean } | { status: 'gone' };

const isNotFound = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code: unknown }).code === 'functions/not-found';

// How often to look again: quickly while the game is on, rarely once it is over.
const LIVE_MS = 6000;
const DONE_MS = 60000;

/** Fetches a shared game and keeps it fresh. A link that has been turned off ends the polling. */
function useSharedGame(code: string): Load {
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fetchOnce = async () => {
      let next = LIVE_MS;
      try {
        const view = await gameView({ code });
        if (!current) return;
        setLoad({ status: 'ok', view, stale: false });
        next = view.state.status === 'finished' ? DONE_MS : LIVE_MS;
      } catch (error) {
        if (!current) return;
        if (isNotFound(error)) {
          setLoad({ status: 'gone' });
          return;
        }
        // No signal for a moment: keep showing what we had, and try again.
        setLoad((was) => (was.status === 'ok' ? { ...was, stale: true } : was));
      }
      timer = setTimeout(fetchOnce, next);
    };
    // A tab that was hidden catches up as soon as it is looked at again.
    const wake = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        void fetchOnce();
      }
    };

    void fetchOnce();
    document.addEventListener('visibilitychange', wake);
    return () => {
      current = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [code]);

  return load;
}

/** The rounds so far, newest first: who won or took the penalty, and what everyone scored. */
function Rounds({ state, names }: { state: GameState; names: Record<string, string> }) {
  const nameOf = (id: string) => names[id] ?? '?';
  if (state.rounds.length === 0) return null;
  return (
    <section aria-label="Rounds" className="space-y-2">
      <h2 className="font-semibold">Rounds</h2>
      <ul className="space-y-2">
        {[...state.rounds].reverse().map((r) => (
          <li key={r.seq} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <p className="font-medium">
              Round {r.seq}
              <span className="font-normal text-slate-500"> · dealt by {nameOf(r.dealerId)}</span>
            </p>
            <p className="text-sm text-slate-600">
              {r.penalty
                ? `${reasonLabel(r.penalty.reason)}: ${nameOf(r.penalty.playerId)} took ${r.penalty.points}`
                : `${r.winnerId ? nameOf(r.winnerId) : '?'} won`}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5 text-sm">
              {Object.entries(r.points).map(([id, points]) => {
                const entry = r.entries[id];
                return (
                  <li
                    key={id}
                    className={cx(
                      'rounded-full px-2.5 py-1',
                      id === r.winnerId ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100',
                      id === r.penalty?.playerId && 'bg-amber-100 text-amber-900',
                      r.eliminated.includes(id) && 'bg-red-100 text-red-900',
                    )}
                  >
                    {nameOf(id)} {points}
                    {entry && entry.kind !== 'points' && (
                      <span className="ml-1 text-xs">
                        ({entry.kind === 'drop' ? 'drop' : 'middle drop'})
                      </span>
                    )}
                    {r.eliminated.includes(id) && <span className="ml-1 text-xs">out</span>}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The page behind a shared game link: the live scoreboard and the rounds, for anyone with the
 * link, signed in or not. It only shows; nothing on it can change the game.
 */
export function ViewScreen({ code }: { code: string }) {
  const load = useSharedGame(code);

  if (load.status === 'loading') return <Loading />;

  if (load.status === 'gone') {
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">This link isn't valid any more</h1>
        <p className="text-slate-600">
          The game's link was turned off or the game was deleted. Ask whoever sent it for a new one.
        </p>
        <Link to="/" className="inline-block text-sm text-slate-700 underline">
          Open Rummy Score Tracker
        </Link>
      </main>
    );
  }

  const { view, stale } = load;
  const finished = view.state.status === 'finished';
  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-4 px-4 pb-16 pt-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-500">{view.leagueName}</p>
          <h1 className="text-2xl font-semibold text-slate-900">
            {finished ? 'Final scores' : `Round ${view.state.rounds.length + 1}`}
          </h1>
        </div>
        {finished ? <Badge tone="green">Finished</Badge> : <Badge tone="amber">Live</Badge>}
      </header>

      {stale && (
        <p role="status" className="text-sm text-slate-500">
          Reconnecting… showing the last scores we had.
        </p>
      )}

      <ScoreBoard state={view.state} names={view.names} />
      {finished && <ResultCard state={view.state} names={view.names} />}
      <Rounds state={view.state} names={view.names} />

      <Card className="text-center text-sm text-slate-600">
        <p>This is a read-only view of a game scored in Rummy Score Tracker.</p>
        <Link to="/" className="mt-1 inline-block font-medium text-slate-800 underline">
          Keep score for your own games
        </Link>
      </Card>
    </main>
  );
}
