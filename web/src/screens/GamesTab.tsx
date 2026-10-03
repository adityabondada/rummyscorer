import { deleteDoc, doc, setDoc, writeBatch } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { settledKey, settledPath, type SettledDoc } from '@rummy/data';
import type { Transfer } from '@rummy/engine';
import { db } from '../firebase';
import { useGames, useSettled } from '../hooks';
import { InstallPrompt } from '../InstallPrompt';
import { pickablePlayers } from '../lib/names';
import { EmptyState } from '../suits';
import { nights, type GameRow } from '../lib/night';
import { nightShareText, shareOrCopy } from '../lib/share';
import { buildNightCard, renderGameCard, shareImage } from '../lib/shareImage';
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
  const { leagueId, league, uid, players, names } = useLeagueContext();
  const games = useGames(leagueId);
  const settled = useSettled(leagueId);
  const [error, setError] = useState('');
  // The night whose results were just copied or shared, to say so beside its button.
  const [shared, setShared] = useState<{ day: string; note: string } | null>(null);

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

  const shareNight = async (night: ReturnType<typeof nights>[number]) => {
    setError('');
    const label = dayLabel(night.day);
    const title = `${league.name}, ${label}`;
    let note: string | null = null;
    try {
      // A picture, like a single game. Only where the browser can't draw it does it fall back to text.
      const picture = await renderGameCard(
        buildNightCard({ leagueName: league.name, dayLabel: label, night, names }),
      );
      const slug = league.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const result = await shareImage(picture, `${slug || 'rummy'}-${night.day}.png`, title);
      note = result === 'shared' ? 'Shared' : result === 'saved' ? 'Saved' : null;
    } catch {
      const text = nightShareText({
        leagueName: league.name,
        dayLabel: label,
        finishedGames: night.games.length - night.inProgress,
        inProgress: night.inProgress,
        nets: night.nets,
        transfers: night.transfers,
        names,
      });
      const result = await shareOrCopy(title, text);
      if (result === 'failed') {
        setError("Couldn't share or copy. Try again.");
        return;
      }
      note = result === 'copied' ? 'Copied' : result === 'shared' ? 'Shared' : null;
    }
    if (note) {
      setShared({ day: night.day, note });
      setTimeout(() => setShared((now) => (now?.day === night.day ? null : now)), 2500);
    }
  };

  /** Marks several payments paid in one write, so either all of them are or none are. */
  const markAllPaid = async (day: string, ts: Transfer[]) => {
    setError('');
    const batch = writeBatch(db);
    const at = Date.now();
    for (const t of ts) {
      const record: SettledDoc = { day, from: t.from, to: t.to, amount: t.amount, by: uid, at };
      batch.set(
        doc(db, `${settledPath(leagueId)}/${settledKey(day, t.from, t.to, t.amount)}`),
        record,
      );
    }
    try {
      await batch.commit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark those as paid');
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

  const empty = !games.loading && games.value.length === 0;
  const enoughPlayers = pickablePlayers(players).length >= 2;

  return (
    <>
      <InstallPrompt />
      {!empty && (
        <Link to="new-game" className="block">
          <Button className="w-full">New game</Button>
        </Link>
      )}

      <ErrorText>{error}</ErrorText>

      {games.loading ? (
        <Loading />
      ) : empty ? (
        enoughPlayers ? (
          <EmptyState
            title="Deal the first game"
            action={
              <Link to="new-game">
                <Button>Start your first game</Button>
              </Link>
            }
          >
            Pick who is playing and the rules, then start scoring.
          </EmptyState>
        ) : (
          <EmptyState
            title="Add your players first"
            action={
              <Link to="players">
                <Button>Add players</Button>
              </Link>
            }
          >
            A game needs at least two players. Add the people at your table, or share the invite so
            they can join.
          </EmptyState>
        )
      ) : (
        nights(games.value).map((night) => (
          <Card key={night.day} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{dayLabel(night.day)}</h2>
              {Object.keys(night.nets).length > 0 && (
                <span className="flex items-center gap-2">
                  {shared?.day === night.day && (
                    <span role="status" className="text-xs text-emerald-700">
                      {shared.note}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    small
                    aria-label={`Share the results for ${dayLabel(night.day)}`}
                    onClick={() => void shareNight(night)}
                  >
                    Share
                  </Button>
                </span>
              )}
            </div>
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
              onMarkAllPaid={(ts) => void markAllPaid(night.day, ts)}
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
