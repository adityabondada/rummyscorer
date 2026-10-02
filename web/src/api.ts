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

export { errorMessage } from './lib/errors';
