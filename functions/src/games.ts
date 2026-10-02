import { gamePath, logPath, roundsPath } from '@rummy/data';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logEntry, readLeague, requireMember, stringArg } from './access';
import { removeShare } from './share';

/**
 * Deletes a game and all of its rounds. Any member can do it. Stats and the night summary are built
 * from the games themselves, so the game stops counting everywhere at once. A log entry records that
 * it happened, since the game itself is gone for good.
 *
 * This is a function and not a client write because a game's rounds live in a subcollection that
 * clients are not allowed to delete.
 */
export async function deleteGame(
  db: Firestore,
  uid: string,
  args: { leagueId: unknown; gameId: unknown },
  now: number,
): Promise<void> {
  const leagueId = stringArg(args.leagueId, 'leagueId', 128);
  const gameId = stringArg(args.gameId, 'gameId', 128);

  await db.runTransaction(async (tx) => requireMember(await readLeague(tx, db, leagueId), uid));

  const gameRef = db.doc(gamePath(leagueId, gameId));
  const game = await gameRef.get();
  if (!game.exists) throw new HttpsError('not-found', 'That game does not exist');

  const data = game.data() ?? {};
  const rounds = (await db.collection(roundsPath(leagueId, gameId)).count().get()).data().count;

  // A shared link for the game goes with it, so it can't point at nothing.
  await removeShare(db, data);

  // Removes the rounds first and then the game itself.
  await db.recursiveDelete(gameRef);

  await db.collection(logPath(leagueId)).add(
    logEntry('gameDeleted', uid, now, {
      gameId,
      startedAt: typeof data.createdAt === 'number' ? data.createdAt : null,
      players: Array.isArray(data.seatOrder) ? data.seatOrder.length : null,
      rounds,
      finished: data.status === 'finished',
    }),
  );
}
