import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { settledKey, settledPath, type SettledDoc } from '@rummy/data';
import type { Transfer } from '@rummy/engine';
import { db } from '../firebase';
import { useGames, useSettled } from '../hooks';
import { nights, type GameRow } from '../lib/night';
import { Badge, Button, Card, ErrorText, Loading, money } from '../ui';
import { useLeagueContext } from './LeagueLayout';
import { SettlingUp } from './SettlingUp';

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

function GameLink({ game, names }: { game: GameRow; names: Record<string, string> }) {
  const { doc } = game;
  const who = doc.seatOrder.map((id) => names[id] ?? '?').join(', ');
  const winners = doc.summary?.winnerIds.map((id) => names[id] ?? '?').join(' & ');
  return (
    <Link
      to={`g/${game.id}`}
      className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 ring-1 ring-slate-200 hover:bg-slate-50"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{who}</span>
        <span className="block text-xs text-slate-500">
          {new Date(doc.createdAt).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          })}
          {winners && ` · ${doc.summary?.outcome === 'split' ? 'Split: ' : 'Won by '}${winners}`}
        </span>
      </span>
      {doc.summaryError ? (
        <Badge tone="red">Needs a look</Badge>
      ) : doc.status === 'finished' ? (
        <Badge tone="green">Finished</Badge>
      ) : (
        <Badge tone="amber">In progress</Badge>
      )}
    </Link>
  );
}

export function GamesTab() {
  const { leagueId, uid, players, names } = useLeagueContext();
  const games = useGames(leagueId);
  const settled = useSettled(leagueId);
  const [error, setError] = useState('');

  const uidNames = useMemo(
    () =>
      Object.fromEntries(
        Object.values(players)
          .filter((p) => p.linkedUid)
          .map((p) => [p.linkedUid!, p.name]),
      ),
    [players],
  );

  const markPaid = async (day: string, t: Transfer) => {
    setError('');
    const record: SettledDoc = {
      day,
      from: t.from,
      to: t.to,
      amount: t.amount,
      by: uid,
      at: Date.now(),
    };
    try {
      await setDoc(
        doc(db, `${settledPath(leagueId)}/${settledKey(day, t.from, t.to, t.amount)}`),
        record,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark that as paid');
    }
  };

  const undo = async (key: string) => {
    setError('');
    try {
      await deleteDoc(doc(db, `${settledPath(leagueId)}/${key}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not undo that');
    }
  };

  return (
    <>
      <Link to="new-game" className="block">
        <Button className="w-full">New game</Button>
      </Link>

      <ErrorText>{error}</ErrorText>

      {games.loading ? (
        <Loading />
      ) : games.value.length === 0 ? (
        <Card>
          <p className="text-slate-600">
            No games yet. Add your players, then start the first one.
          </p>
        </Card>
      ) : (
        nights(games.value).map((night) => (
          <Card key={night.day} className="space-y-3">
            <h2 className="font-semibold">{dayLabel(night.day)}</h2>
            <div className="space-y-2">
              {night.games.map((g) => (
                <GameLink key={g.id} game={g} names={names} />
              ))}
            </div>
            <SettlingUp
              day={night.day}
              transfers={night.transfers}
              names={names}
              settled={settled.value}
              uidNames={uidNames}
              inProgress={night.inProgress}
              onMarkPaid={(t) => void markPaid(night.day, t)}
              onUndo={(key) => void undo(key)}
            />
            {Object.keys(night.nets).length > 0 && (
              <ul className="flex flex-wrap gap-2 text-sm">
                {Object.entries(night.nets)
                  .sort(([, a], [, b]) => b - a)
                  .map(([id, net]) => (
                    <li key={id} className="rounded-full bg-slate-100 px-2.5 py-1">
                      {names[id] ?? '?'}{' '}
                      <span className={net < 0 ? 'text-red-700' : 'text-emerald-700'}>
                        {money(net)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        ))
      )}
    </>
  );
}
