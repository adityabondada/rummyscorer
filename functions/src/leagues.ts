import {
  COLLECTIONS,
  leaguePath,
  logPath,
  parsePlayer,
  playersPath,
  type LeagueDoc,
  type PlayerDoc,
} from '@rummy/data';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logEntry, readLeague, requireAdmin, stringArg } from './access';
import { normalizeInviteCode, uniqueInviteCode } from './inviteCode';

const MAX_LEAGUE_NAME = 60;
const MAX_PLAYER_NAME = 40;

const memberProfile = (uid: string, name: string, now: number): PlayerDoc => ({
  name,
  linkedUid: uid,
  retired: false,
  mergedInto: null,
  createdBy: uid,
  createdAt: now,
});

/** Starts a league. The caller becomes its admin and first member, with a profile of their own. */
export async function createLeague(
  db: Firestore,
  uid: string,
  args: { name: unknown; displayName: unknown },
  now: number,
): Promise<{ leagueId: string; inviteCode: string; playerId: string }> {
  const name = stringArg(args.name, 'League name', MAX_LEAGUE_NAME);
  const displayName = stringArg(args.displayName, 'Your name', MAX_PLAYER_NAME);
  const inviteCode = await uniqueInviteCode(db);

  const leagueRef = db.collection(COLLECTIONS.leagues).doc();
  const playerRef = leagueRef.collection(COLLECTIONS.players).doc();
  const league: LeagueDoc = {
    name,
    adminUid: uid,
    inviteCode,
    memberUids: [uid],
    createdAt: now,
  };
  const batch = db.batch();
  batch.set(leagueRef, league);
  batch.set(playerRef, memberProfile(uid, displayName, now));
  batch.set(
    leagueRef.collection(COLLECTIONS.log).doc(),
    logEntry('memberJoined', uid, now, { uid }),
  );
  await batch.commit();
  return { leagueId: leagueRef.id, inviteCode, playerId: playerRef.id };
}

/**
 * Adds the caller to the league that owns this invite code, with a profile of their own (or the
 * profile they had before they were removed). Joining twice is harmless.
 */
export async function joinLeague(
  db: Firestore,
  uid: string,
  args: { code: unknown; displayName: unknown },
  now: number,
): Promise<{ leagueId: string; playerId: string }> {
  if (typeof args.code !== 'string')
    throw new HttpsError('invalid-argument', 'An invite code is required');
  const code = normalizeInviteCode(args.code);
  const displayName = stringArg(args.displayName, 'Your name', MAX_PLAYER_NAME);

  const found = await db
    .collection(COLLECTIONS.leagues)
    .where('inviteCode', '==', code)
    .limit(1)
    .get();
  const match = found.docs[0];
  if (!match || code === '') throw new HttpsError('not-found', 'That invite code is not valid');
  const leagueId = match.id;

  return db.runTransaction(async (tx) => {
    // Re-read inside the transaction: the code may have been regenerated since the lookup.
    const league = await readLeague(tx, db, leagueId);
    if (league.inviteCode !== code)
      throw new HttpsError('not-found', 'That invite code is not valid');

    const mine = await tx.get(
      db.collection(playersPath(leagueId)).where('linkedUid', '==', uid).limit(1),
    );
    const existing = mine.docs[0];
    const alreadyMember = league.memberUids.includes(uid);

    let playerId: string;
    if (existing) {
      playerId = existing.id;
      if (parsePlayer(existing.data()).retired) tx.update(existing.ref, { retired: false });
    } else {
      const ref = db.collection(playersPath(leagueId)).doc();
      playerId = ref.id;
      tx.set(ref, memberProfile(uid, displayName, now));
    }
    if (!alreadyMember) {
      tx.update(db.doc(leaguePath(leagueId)), { memberUids: FieldValue.arrayUnion(uid) });
      tx.set(db.collection(logPath(leagueId)).doc(), logEntry('memberJoined', uid, now, { uid }));
    }
    return { leagueId, playerId };
  });
}

/** Replaces the invite code, which stops every old link and code from working. Admin only. */
export async function regenerateInvite(
  db: Firestore,
  uid: string,
  args: { leagueId: unknown },
  now: number,
): Promise<{ inviteCode: string }> {
  const leagueId = stringArg(args.leagueId, 'leagueId', 128);
  const inviteCode = await uniqueInviteCode(db);
  await db.runTransaction(async (tx) => {
    requireAdmin(await readLeague(tx, db, leagueId), uid);
    tx.update(db.doc(leaguePath(leagueId)), { inviteCode });
    tx.set(db.collection(logPath(leagueId)).doc(), logEntry('inviteRegenerated', uid, now, {}));
  });
  return { inviteCode };
}

/**
 * Removes a member from the league. Admin only, and the admin can't be removed. Their profile
 * stays so their games and stats remain; it is retired so it doesn't show up for new games.
 */
export async function removeMember(
  db: Firestore,
  uid: string,
  args: { leagueId: unknown; memberUid: unknown },
  now: number,
): Promise<void> {
  const leagueId = stringArg(args.leagueId, 'leagueId', 128);
  const memberUid = stringArg(args.memberUid, 'memberUid', 128);

  await db.runTransaction(async (tx) => {
    const league = await readLeague(tx, db, leagueId);
    requireAdmin(league, uid);
    if (memberUid === league.adminUid) {
      throw new HttpsError('failed-precondition', 'The admin cannot be removed');
    }
    if (!league.memberUids.includes(memberUid)) {
      throw new HttpsError('not-found', 'That person is not a member of this league');
    }
    const profiles = await tx.get(
      db.collection(playersPath(leagueId)).where('linkedUid', '==', memberUid),
    );
    tx.update(db.doc(leaguePath(leagueId)), { memberUids: FieldValue.arrayRemove(memberUid) });
    for (const profile of profiles.docs) tx.update(profile.ref, { retired: true });
    tx.set(
      db.collection(logPath(leagueId)).doc(),
      logEntry('memberRemoved', uid, now, { uid: memberUid }),
    );
  });
}
