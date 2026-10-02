import {
  COLLECTIONS,
  logPath,
  parsePlayer,
  playerPath,
  playersPath,
  type PlayerDoc,
} from '@rummy/data';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logEntry, readLeague, requireMember, stringArg } from './access';
import { recomputeGame } from './recompute';

// A merge only ever links a guest profile (one a member added by hand) to a member's own profile.
// Two member profiles are never merged, and a guest is never the target, so `mergedInto` always
// points straight at a member profile.

/** Every player doc in the league, parsed. Malformed ones are left out. */
async function readPlayers(
  tx: Transaction,
  db: Firestore,
  leagueId: string,
): Promise<Record<string, PlayerDoc>> {
  const snap = await tx.get(db.collection(playersPath(leagueId)));
  const players: Record<string, PlayerDoc> = {};
  for (const doc of snap.docs) {
    try {
      players[doc.id] = parsePlayer(doc.data());
    } catch {
      // Skip: a malformed profile can't be part of a merge.
    }
  }
  return players;
}

interface GameRef {
  id: string;
  seatOrder: string[];
}

/** Games whose starting seat order includes this player. */
async function gamesWith(
  tx: Transaction,
  db: Firestore,
  leagueId: string,
  playerId: string,
): Promise<GameRef[]> {
  const snap = await tx.get(
    db
      .collection(`leagues/${leagueId}/${COLLECTIONS.games}`)
      .where('seatOrder', 'array-contains', playerId),
  );
  return snap.docs.map((doc) => ({
    id: doc.id,
    seatOrder: (doc.data().seatOrder as string[]) ?? [],
  }));
}

/** Refreshes the cached summaries after a merge or unmerge changed who played in them. */
async function refreshGames(
  db: Firestore,
  leagueId: string,
  games: GameRef[],
  now: number,
): Promise<number> {
  for (const game of games) await recomputeGame(db, leagueId, game.id, now);
  return games.length;
}

/**
 * Links a guest profile to a member's profile, for when a member joins and turns out to be a
 * guest the group already had. Nothing in any game is rewritten: the guest is marked `mergedInto`
 * the member, and everything that reads games resolves the link.
 *
 * Blocked if the member (or a guest already merged into them) played in the same game as this
 * guest, since one person can't be two players in a game.
 */
export async function mergePlayers(
  db: Firestore,
  uid: string,
  args: { leagueId: unknown; guestId: unknown; targetId: unknown },
  now: number,
): Promise<{ gamesUpdated: number }> {
  const leagueId = stringArg(args.leagueId, 'leagueId', 128);
  const guestId = stringArg(args.guestId, 'guestId', 128);
  const targetId = stringArg(args.targetId, 'targetId', 128);

  const affected = await db.runTransaction(async (tx) => {
    requireMember(await readLeague(tx, db, leagueId), uid);
    const players = await readPlayers(tx, db, leagueId);

    const guest = players[guestId];
    const target = players[targetId];
    if (!guest || !target) throw new HttpsError('not-found', 'Player not found');
    if (guest.linkedUid !== null) {
      throw new HttpsError('failed-precondition', "A member's own profile can't be merged away");
    }
    if (target.linkedUid === null) {
      throw new HttpsError('failed-precondition', 'A guest can only be merged into a member');
    }
    if (guest.mergedInto !== null) {
      throw new HttpsError('failed-precondition', 'That guest is already merged');
    }

    // The member plus every guest already merged into them all count as the same person.
    const person = new Set([
      targetId,
      ...Object.entries(players)
        .filter(([, p]) => p.mergedInto === targetId)
        .map(([id]) => id),
    ]);
    const games = await gamesWith(tx, db, leagueId, guestId);
    const clash = games.find((g) => g.seatOrder.some((id) => person.has(id)));
    if (clash) {
      throw new HttpsError(
        'failed-precondition',
        `Both profiles played in the same game (${clash.id}), so they can't be merged`,
      );
    }

    tx.update(db.doc(playerPath(leagueId, guestId)), { mergedInto: targetId });
    tx.set(
      db.collection(logPath(leagueId)).doc(),
      logEntry('playerMerged', uid, now, { guestId, targetId }),
    );
    return games;
  });

  return { gamesUpdated: await refreshGames(db, leagueId, affected, now) };
}

/** Undoes a merge: the guest becomes its own profile again, with the games it played. */
export async function unmergePlayers(
  db: Firestore,
  uid: string,
  args: { leagueId: unknown; guestId: unknown },
  now: number,
): Promise<{ gamesUpdated: number }> {
  const leagueId = stringArg(args.leagueId, 'leagueId', 128);
  const guestId = stringArg(args.guestId, 'guestId', 128);

  const affected = await db.runTransaction(async (tx) => {
    requireMember(await readLeague(tx, db, leagueId), uid);
    const players = await readPlayers(tx, db, leagueId);

    const guest = players[guestId];
    if (!guest) throw new HttpsError('not-found', 'Player not found');
    if (guest.mergedInto === null) {
      throw new HttpsError('failed-precondition', 'That guest is not merged');
    }

    const games = await gamesWith(tx, db, leagueId, guestId);
    tx.update(db.doc(playerPath(leagueId, guestId)), { mergedInto: null });
    tx.set(
      db.collection(logPath(leagueId)).doc(),
      logEntry('playerUnmerged', uid, now, { guestId, wasMergedInto: guest.mergedInto }),
    );
    return games;
  });

  return { gamesUpdated: await refreshGames(db, leagueId, affected, now) };
}
