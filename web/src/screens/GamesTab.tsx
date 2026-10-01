import { Link } from 'react-router-dom';
import { useGames } from '../hooks';
import { nights, type GameRow } from '../lib/night';
import { Badge, Button, Card, Loading, money } from '../ui';
import { useLeagueContext } from './LeagueLayout';

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
  const { leagueId, names } = useLeagueContext();
  const games = useGames(leagueId);

  return (
    <>
      <Link to="new-game" className="block">
        <Button className="w-full">New game</Button>
      </Link>

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
            {night.transfers.length > 0 && (
              <div className="rounded-lg bg-slate-50 p-3">
                <h3 className="mb-1 text-sm font-semibold">Settling up</h3>
                <ul className="space-y-0.5 text-sm">
                  {night.transfers.map((t) => (
                    <li key={`${t.from}-${t.to}`}>
                      <strong>{names[t.from] ?? '?'}</strong> pays{' '}
                      <strong>{names[t.to] ?? '?'}</strong> ${t.amount}
                    </li>
                  ))}
                </ul>
                {night.inProgress > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Not counting {night.inProgress} game{night.inProgress > 1 ? 's' : ''} still in
                    progress.
                  </p>
                )}
              </div>
            )}
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
