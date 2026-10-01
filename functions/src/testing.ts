import { DEFAULT_SETTINGS, type GameSettings, type Round } from '@rummy/engine';
import {
  COLLECTIONS,
  gamePath,
  newRoundDoc,
  playerPath,
  roundsPath,
  type GameDoc,
  type PlayerDoc,
} from '@rummy/data';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createLeague, joinLeague } from './leagues';

export const PROJECT = 'demo-rummytracker';
export const NOW = 1_000_000;

export function testDb(): Firestore {
  process.env.GCLOUD_PROJECT = PROJECT;
  if (getApps().length === 0) initializeApp({ projectId: PROJECT });
  return getFirestore();
}

export async function clearDb(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) throw new Error('Run these tests with `npm run test:emulator`');
  const url = `http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Could not clear the emulator: ${res.status}`);
}

export const smallSettings = (overrides: Partial<GameSettings> = {}): GameSettings => ({
  ...DEFAULT_SETTINGS,
  limit: 50,
  maxRoundPenalty: null,
  ...overrides,
});

/** A league with an admin ("admin") and any number of extra members, each with a profile. */
export async function seedLeague(db: Firestore, members: string[] = []) {
  const created = await createLeague(
    db,
    'admin',
    { name: 'Friday Rummy', displayName: 'Admin' },
    NOW,
  );
  const profiles: Record<string, string> = { admin: created.playerId };
  for (const uid of members) {
    const joined = await joinLeague(
      db,
      uid,
      { code: created.inviteCode, displayName: uid.toUpperCase() },
      NOW,
    );
    profiles[uid] = joined.playerId;
  }
  return { leagueId: created.leagueId, inviteCode: created.inviteCode, profiles };
}

export async function addGuest(db: Firestore, leagueId: string, name: string): Promise<string> {
  const ref = db.collection(`leagues/${leagueId}/${COLLECTIONS.players}`).doc();
  const guest: PlayerDoc = {
    name,
    linkedUid: null,
    retired: false,
    mergedInto: null,
    createdBy: 'admin',
    createdAt: NOW,
  };
  await ref.set(guest);
  return ref.id;
}

export async function addGame(
  db: Firestore,
  leagueId: string,
  seatOrder: string[],
  overrides: Partial<GameDoc> = {},
): Promise<string> {
  const ref = db.collection(`leagues/${leagueId}/${COLLECTIONS.games}`).doc();
  const game: GameDoc = {
    settings: smallSettings(),
    seatOrder,
    status: 'inProgress',
    createdBy: 'admin',
    createdAt: NOW,
    split: null,
    summary: null,
    summaryError: null,
    ...overrides,
  };
  await ref.set(game);
  return ref.id;
}

export async function addRound(
  db: Firestore,
  leagueId: string,
  gameId: string,
  round: Round,
  scrapped: Round['scrapped'] = null,
): Promise<string> {
  const ref = db.collection(roundsPath(leagueId, gameId)).doc();
  await ref.set({ ...newRoundDoc(round, 'admin', NOW), scrapped });
  return ref.id;
}

export const readGame = async (db: Firestore, leagueId: string, gameId: string) =>
  (await db.doc(gamePath(leagueId, gameId)).get()).data()!;

export const readPlayer = async (db: Firestore, leagueId: string, playerId: string) =>
  (await db.doc(playerPath(leagueId, playerId)).get()).data()!;

export const pts = (points: number) => ({ kind: 'points' as const, points });

/** Runs a function and returns the error it threw, so tests can check its code. */
export async function caught(
  fn: () => Promise<unknown>,
): Promise<{ code?: string; message: string }> {
  try {
    await fn();
  } catch (error) {
    return error as { code?: string; message: string };
  }
  throw new Error('Expected the call to fail');
}
