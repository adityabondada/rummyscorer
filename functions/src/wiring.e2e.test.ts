import { gamePath, roundsPath } from '@rummy/data';
import { beforeAll, describe, expect, it } from 'vitest';
import { addGame, addRound, clearDb, pts, PROJECT, smallSettings, testDb } from './testing';

// Runs against the Auth, Firestore and Functions emulators with the built bundle in lib/, so it
// checks the parts the service tests can't: the callable wrappers, auth, and the triggers.
// Start it with `npm run test:e2e` (it builds first).

const db = testDb();
const FUNCTIONS = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

interface User {
  uid: string;
  token: string;
}

async function signUp(email: string, name: string): Promise<User> {
  const res = await fetch(
    `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'password123',
        displayName: name,
        returnSecureToken: true,
      }),
    },
  );
  const body = (await res.json()) as { localId: string; idToken: string };
  return { uid: body.localId, token: body.idToken };
}

async function call(name: string, data: unknown, user?: User) {
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(user ? { authorization: `Bearer ${user.token}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  return { status: res.status, body: (await res.json()) as CallBody };
}

/** What the callables return, as one loose shape covering every function the tests call. */
interface CallBody {
  result: { leagueId: string; inviteCode: string; playerId: string; ok?: boolean };
  error?: { status?: string };
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  let value = await read();
  for (let i = 0; i < 60 && !done(value); i++) {
    await new Promise((r) => setTimeout(r, 500));
    value = await read();
  }
  return value;
}

const game = async (leagueId: string, gameId: string) =>
  (await db.doc(gamePath(leagueId, gameId)).get()).data()!;

let admin: User;
let ravi: User;

beforeAll(async () => {
  await clearDb();
  admin = await signUp('admin@example.com', 'Admin');
  ravi = await signUp('ravi@example.com', 'Ravi');
});

describe('callable functions', () => {
  it('reject a caller who is not signed in', async () => {
    const res = await call('createLeagueFn', { name: 'L', displayName: 'A' });
    expect(res.body.error?.status).toBe('UNAUTHENTICATED');
  });

  it('create a league, let a second person join with the code, and guard the admin actions', async () => {
    const created = await call('createLeagueFn', { name: 'Friday', displayName: 'Admin' }, admin);
    expect(created.status).toBe(200);
    const { leagueId, inviteCode, playerId } = created.body.result;
    expect(inviteCode).toHaveLength(8);

    const joined = await call('joinLeagueFn', { code: inviteCode.toLowerCase() }, ravi);
    expect(joined.body.result.leagueId).toBe(leagueId);

    const denied = await call('regenerateInviteFn', { leagueId }, ravi);
    expect(denied.body.error?.status).toBe('PERMISSION_DENIED');
    const fresh = await call('regenerateInviteFn', { leagueId }, admin);
    expect(fresh.body.result.inviteCode).not.toBe(inviteCode);

    const gone = await call('removeMemberFn', { leagueId, memberUid: ravi.uid }, admin);
    expect(gone.body.result).toEqual({ ok: true });
    expect(playerId).toBeTruthy();
  });

  it('merge and unmerge a guest through the wrappers', async () => {
    const created = await call('createLeagueFn', { name: 'Merge', displayName: 'Admin' }, admin);
    const { leagueId, inviteCode, playerId: adminProfile } = created.body.result;
    const joined = await call('joinLeagueFn', { code: inviteCode, displayName: 'Ravi' }, ravi);
    const guestRef = db.collection(`leagues/${leagueId}/players`).doc();
    await guestRef.set({
      name: 'Ravi (guest)',
      linkedUid: null,
      retired: false,
      mergedInto: null,
      createdBy: admin.uid,
      createdAt: 1,
    });

    const merged = await call(
      'mergePlayersFn',
      { leagueId, guestId: guestRef.id, targetId: joined.body.result.playerId },
      admin,
    );
    expect(merged.body.result).toEqual({ gamesUpdated: 0 });
    expect((await guestRef.get()).data()!.mergedInto).toBe(joined.body.result.playerId);

    const wrong = await call(
      'mergePlayersFn',
      { leagueId, guestId: adminProfile, targetId: joined.body.result.playerId },
      admin,
    );
    expect(wrong.body.error?.status).toBe('FAILED_PRECONDITION');

    const undone = await call('unmergePlayersFn', { leagueId, guestId: guestRef.id }, admin);
    expect(undone.body.result).toEqual({ gamesUpdated: 0 });
    expect((await guestRef.get()).data()!.mergedInto).toBeNull();
  });
});

describe('triggers', () => {
  async function league() {
    const created = await call('createLeagueFn', { name: 'Triggers', displayName: 'Admin' }, admin);
    const { leagueId, inviteCode, playerId: a } = created.body.result;
    const joined = await call('joinLeagueFn', { code: inviteCode, displayName: 'Ravi' }, ravi);
    return { leagueId, a, b: joined.body.result.playerId as string };
  }

  it('onRoundWrite finishes the game and caches the summary when the last round is entered', async () => {
    const { leagueId, a, b } = await league();
    const gameId = await addGame(db, leagueId, [a, b], { settings: smallSettings() });
    await addRound(db, leagueId, gameId, { seq: 1, winnerId: a, entries: { [b]: pts(60) } });

    const done = await until(
      () => game(leagueId, gameId),
      (g) => g.status === 'finished',
    );
    expect(done.status).toBe('finished');
    expect(done.summary).toMatchObject({ outcome: 'outright', winnerIds: [a], pot: 20 });
  });

  it('onRoundWrite reopens the game when that round is scrapped', async () => {
    const { leagueId, a, b } = await league();
    const gameId = await addGame(db, leagueId, [a, b], { settings: smallSettings() });
    await addRound(db, leagueId, gameId, { seq: 1, winnerId: a, entries: { [b]: pts(60) } });
    await until(
      () => game(leagueId, gameId),
      (g) => g.status === 'finished',
    );

    const rounds = await db.collection(roundsPath(leagueId, gameId)).get();
    await rounds.docs[0]!.ref.update({ scrapped: { by: 'admin', at: 1, reason: 'oops' } });
    const reopened = await until(
      () => game(leagueId, gameId),
      (g) => g.status === 'inProgress',
    );
    expect(reopened).toMatchObject({ status: 'inProgress', summary: null });
  });

  it('onGameWrite ends the game when a split is recorded, and does not loop', async () => {
    const { leagueId, a, b } = await league();
    const gameId = await addGame(db, leagueId, [a, b], { settings: smallSettings() });
    await addRound(db, leagueId, gameId, { seq: 1, winnerId: a, entries: { [b]: pts(10) } });
    await new Promise((r) => setTimeout(r, 1500));

    await db.doc(gamePath(leagueId, gameId)).update({
      split: { afterSeq: 1, shares: { [a]: 12, [b]: 8 } },
    });
    const done = await until(
      () => game(leagueId, gameId),
      (g) => g.status === 'finished',
    );
    expect(done.summary).toMatchObject({ outcome: 'split', winnerIds: [a, b] });

    // The function's own write must not trigger another recompute.
    const stamp = done.summary.computedAt;
    await new Promise((r) => setTimeout(r, 3000));
    expect((await game(leagueId, gameId)).summary.computedAt).toBe(stamp);
  });
});

describe('deleteGameFn', () => {
  async function leagueWithGame() {
    const created = await call(
      'createLeagueFn',
      { name: 'Delete me', displayName: 'Admin' },
      admin,
    );
    const { leagueId, inviteCode, playerId: a } = created.body.result;
    const joined = await call('joinLeagueFn', { code: inviteCode, displayName: 'Ravi' }, ravi);
    const b = joined.body.result.playerId;
    const gameId = await addGame(db, leagueId, [a, b], { settings: smallSettings() });
    await addRound(db, leagueId, gameId, { seq: 1, winnerId: a, entries: { [b]: pts(10) } });
    await addRound(db, leagueId, gameId, { seq: 2, winnerId: a, entries: { [b]: pts(60) } });
    await until(
      () => game(leagueId, gameId),
      (g) => g.status === 'finished',
    );
    return { leagueId, gameId };
  }
  const exists = async (leagueId: string, gameId: string) =>
    (await db.doc(gamePath(leagueId, gameId)).get()).exists;

  it('refuses a caller who is not signed in', async () => {
    const { leagueId, gameId } = await leagueWithGame();
    const res = await call('deleteGameFn', { leagueId, gameId });
    expect(res.body.error?.status).toBe('UNAUTHENTICATED');
    expect(await exists(leagueId, gameId)).toBe(true);
  });

  it('refuses someone who is not in the league, and leaves the game alone', async () => {
    const { leagueId, gameId } = await leagueWithGame();
    const outsider = await signUp('outsider@example.com', 'Outsider');
    const res = await call('deleteGameFn', { leagueId, gameId }, outsider);
    expect(res.body.error?.status).toBe('PERMISSION_DENIED');
    expect(await exists(leagueId, gameId)).toBe(true);
  });

  it('deletes a finished game and all its rounds for a member, and says so in the log', async () => {
    const { leagueId, gameId } = await leagueWithGame();
    expect((await db.collection(roundsPath(leagueId, gameId)).get()).size).toBe(2);

    const res = await call('deleteGameFn', { leagueId, gameId }, ravi);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ ok: true });
    expect(await exists(leagueId, gameId)).toBe(false);
    expect((await db.collection(roundsPath(leagueId, gameId)).get()).size).toBe(0);

    const log = await db
      .collection(`leagues/${leagueId}/log`)
      .where('type', '==', 'gameDeleted')
      .get();
    expect(log.docs.map((d) => d.data())).toMatchObject([
      { by: ravi.uid, details: { gameId, rounds: 2, finished: true } },
    ]);
  });

  it('says the game is not found when it is already gone', async () => {
    const { leagueId, gameId } = await leagueWithGame();
    await call('deleteGameFn', { leagueId, gameId }, admin);
    const again = await call('deleteGameFn', { leagueId, gameId }, admin);
    expect(again.body.error?.status).toBe('NOT_FOUND');
  });
});
