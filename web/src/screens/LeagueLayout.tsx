import { NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import type { LeagueDoc } from '@rummy/data';
import { useUser } from '../auth';
import { useLeague, usePlayers } from '../hooks';
import type { PlayerMap } from '../lib/game';
import { playerNames } from '../lib/names';
import { Loading, Page, cx } from '../ui';

export interface LeagueContext {
  leagueId: string;
  league: LeagueDoc;
  uid: string;
  isAdmin: boolean;
  players: PlayerMap;
  /** Display names by player id, with merged guests shown as the member they became. */
  names: Record<string, string>;
  /** The signed-in user's own player profile, once it exists. */
  myPlayerId: string | null;
}

export const useLeagueContext = () => useOutletContext<LeagueContext>();

const tabs = [
  { to: '', label: 'Games', end: true },
  { to: 'stats', label: 'Stats', end: false },
  { to: 'players', label: 'Players', end: false },
  { to: 'members', label: 'Members', end: false },
];

export function LeagueLayout() {
  const { leagueId = '' } = useParams();
  const { uid } = useUser();
  const league = useLeague(leagueId);
  const players = usePlayers(leagueId);

  if (league.loading || players.loading) return <Loading />;
  if (league.error || !league.value || !league.value.memberUids.includes(uid)) {
    return (
      <Page title="League not found" back={{ to: '/', label: 'Your leagues' }}>
        <p className="text-slate-600">This league doesn't exist, or you're not a member of it.</p>
      </Page>
    );
  }

  const myPlayerId =
    Object.entries(players.value).find(([, p]) => p.linkedUid === uid)?.[0] ?? null;
  const context: LeagueContext = {
    leagueId,
    league: league.value,
    uid,
    isAdmin: league.value.adminUid === uid,
    players: players.value,
    names: playerNames(players.value),
    myPlayerId,
  };

  return <Outlet context={context} />;
}

/** The league's home: its name and the Games, Players and Members tabs. */
export function LeagueTabs() {
  const context = useLeagueContext();
  return (
    <Page title={context.league.name} back={{ to: '/', label: 'Your leagues' }}>
      <nav className="flex gap-1 rounded-lg bg-slate-200 p-1" aria-label="League sections">
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cx(
                'flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium',
                isActive
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={context} />
    </Page>
  );
}
