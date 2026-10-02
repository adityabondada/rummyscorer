import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { createLeague, joinLeague, regenerateInvite, removeMember } from './leagues';
import { mergePlayers, unmergePlayers } from './merge';
import { recomputeGame, splitChanged } from './recompute';

initializeApp();

// TODO(open-question): match this to the Firestore database location once it is known; Firestore
// triggers should run in the same region as the database.
setGlobalOptions({ region: 'us-central1', maxInstances: 5 });

const db = () => getFirestore();

function callerUid(request: CallableRequest): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}

/** The name Google gave the user, for when the app doesn't send one. */
function tokenName(request: CallableRequest): string | undefined {
  const name = request.auth?.token.name;
  return typeof name === 'string' ? name : undefined;
}

export const createLeagueFn = onCall((request) =>
  createLeague(
    db(),
    callerUid(request),
    {
      name: request.data?.name,
      displayName: request.data?.displayName ?? tokenName(request),
    },
    Date.now(),
  ),
);

export const joinLeagueFn = onCall((request) =>
  joinLeague(
    db(),
    callerUid(request),
    {
      code: request.data?.code,
      displayName: request.data?.displayName ?? tokenName(request),
    },
    Date.now(),
  ),
);

export const regenerateInviteFn = onCall((request) =>
  regenerateInvite(db(), callerUid(request), { leagueId: request.data?.leagueId }, Date.now()),
);

export const removeMemberFn = onCall(async (request) => {
  await removeMember(
    db(),
    callerUid(request),
    { leagueId: request.data?.leagueId, memberUid: request.data?.memberUid },
    Date.now(),
  );
  return { ok: true };
});

export const mergePlayersFn = onCall((request) =>
  mergePlayers(
    db(),
    callerUid(request),
    {
      leagueId: request.data?.leagueId,
      guestId: request.data?.guestId,
      targetId: request.data?.targetId,
    },
    Date.now(),
  ),
);

export const unmergePlayersFn = onCall((request) =>
  unmergePlayers(
    db(),
    callerUid(request),
    { leagueId: request.data?.leagueId, guestId: request.data?.guestId },
    Date.now(),
  ),
);

/** A round was entered, edited, scrapped or restored: refresh the game's status and summary. */
export const onRoundWrite = onDocumentWritten(
  'leagues/{leagueId}/games/{gameId}/rounds/{roundId}',
  async (event) => {
    const { leagueId, gameId } = event.params;
    await recomputeGame(db(), leagueId, gameId, Date.now());
  },
);

/**
 * The agreed split changed: refresh the summary. This trigger writes to the same document, so it
 * acts only when `split` itself changed; its own status and summary writes end the chain there.
 */
export const onGameWrite = onDocumentWritten('leagues/{leagueId}/games/{gameId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after || !splitChanged(before, after)) return;
  const { leagueId, gameId } = event.params;
  await recomputeGame(db(), leagueId, gameId, Date.now());
});
