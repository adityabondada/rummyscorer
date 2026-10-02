import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

function callable<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name);
  return async (data: Req): Promise<Res> => (await fn(data)).data;
}

export const createLeague = callable<
  { name: string; displayName: string },
  { leagueId: string; inviteCode: string; playerId: string }
>('createLeagueFn');

export const joinLeague = callable<
  { code: string; displayName: string },
  { leagueId: string; playerId: string }
>('joinLeagueFn');

/** Switches a game's read-only link on or off. Any member can. */
export const shareGame = callable<
  { leagueId: string; gameId: string; enable: boolean },
  { shareCode: string | null }
>('shareGameFn');

/** Works with nobody signed in: what a shared game link shows. */
export const gameView = callable<
  { code: string },
  {
    leagueName: string;
    names: Record<string, string>;
    startedAt: number;
    state: import('@rummy/engine').GameState;
  }
>('gameViewFn');

/** Works before signing in: the league an invite link is for. */
export const inviteInfo = callable<{ code: string }, { leagueName: string; members: number }>(
  'inviteInfoFn',
);

export const regenerateInvite = callable<{ leagueId: string }, { inviteCode: string }>(
  'regenerateInviteFn',
);

export const removeMember = callable<{ leagueId: string; memberUid: string }, { ok: true }>(
  'removeMemberFn',
);

export const mergePlayers = callable<
  { leagueId: string; guestId: string; targetId: string },
  { gamesUpdated: number }
>('mergePlayersFn');

export const unmergePlayers = callable<
  { leagueId: string; guestId: string },
  { gamesUpdated: number }
>('unmergePlayersFn');

export const deleteGame = callable<{ leagueId: string; gameId: string }, { ok: true }>(
  'deleteGameFn',
);

export const recomputeLeague = callable<{ leagueId: string }, { games: number; updated: number }>(
  'recomputeLeagueFn',
);

export { errorMessage } from './lib/errors';
