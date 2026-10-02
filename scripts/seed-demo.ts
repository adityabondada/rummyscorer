/**
 * Fills the local Firebase emulators with a demo league so the app can be tried with real-looking
 * data: a league, five players, and a dozen or so finished games spread over a few months.
 *
 * It only ever talks to the emulators and refuses to run otherwise. Then sign in as the tester
 * "Asha" (the league admin) to see it.
 *
 *   npm run seed:demo      (with the emulators running)
 */
import { applyRound, initialState, activeIds, type Round, type RoundEntry } from '@rummy/engine';
import { DEFAULT_SETTINGS } from '@rummy/engine';
import { COLLECTIONS, newRoundDoc, roundsPath, type GameDoc, type PlayerDoc } from '@rummy/data';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createLeague } from '../functions/src/leagues';
import { recomputeGame } from '../functions/src/recompute';

const PROJECT = 'demo-rummytracker';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

// Never write to a real project from here.
process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
process.env.GCLOUD_PROJECT = PROJECT;
if (getApps().length === 0) initializeApp({ projectId: PROJECT });
const db = getFirestore();

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function testerUid(name: string): Promise<string> {
  const email = `${name.toLowerCase()}@example.com`;
  const body = JSON.stringify({
    email,
    password: 'test-password',
    displayName: name,
    returnSecureToken: true,
  });
  const headers = { 'content-type': 'application/json' };
  const base = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts`;
  let res = await fetch(`${base}:signUp?key=fake`, { method: 'POST', headers, body });
  if (!res.ok)
    res = await fetch(`${base}:signInWithPassword?key=fake`, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`Could not create the ${name} tester in the Auth emulator`);
  return ((await res.json()) as { localId: string }).localId;
}

/** Plays a random but legal game between these players and returns its rounds. */
function playGame(ids: string[], seed: number): Round[] {
  const rand = rng(seed);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const settings = { ...DEFAULT_SETTINGS, limit: 101, maxRoundPenalty: 80 };
  let state = initialState(settings, ids);
  const rounds: Round[] = [];
  for (let seq = 1; seq <= 60 && state.status === 'inProgress'; seq++) {
    const active = activeIds(state);
    const winnerId = active[int(0, active.length - 1)]!;
    const entries: Record<string, RoundEntry> = {};
    for (const id of active.filter((p) => p !== winnerId)) {
      const p = state.players[id]!;
      entries[id] =
        p.dropsLeft > 0 && rand() < 0.2
          ? { kind: rand() < 0.5 ? 'drop' : 'middleDrop' }
          : { kind: 'points', points: int(5, 60) };
    }
    let round: Round = { seq, winnerId, entries };
    // Now and then somebody shows a wrong hand: they take the most and the rest score nothing.
    if (active.length >= 3 && rand() < 0.1) {
      const culprit = active[int(0, active.length - 1)]!;
      const others: Record<string, RoundEntry> = {};
      for (const id of active.filter((p) => p !== culprit)) {
        const p = state.players[id]!;
        others[id] =
          p.dropsLeft > 0 && rand() < 0.2 ? { kind: 'drop' } : { kind: 'points', points: 0 };
      }
      const penalty: Round = {
        seq,
        winnerId: null,
        penalty: { playerId: culprit, points: 80, reason: rand() < 0.7 ? 'wrongShow' : 'error' },
        entries: others,
      };
      try {
        applyRound(state, penalty);
        round = penalty;
      } catch {
        // Not allowed in this position, so it stays an ordinary round.
      }
    }
    state = applyRound(state, round);
    rounds.push(round);
  }
  return rounds;
}

async function main() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const adminUid = await testerUid('Asha');
  const league = await createLeague(db, adminUid, { name: 'Demo Rummy', displayName: 'Asha' }, now);
  const { leagueId } = league;

  const guest = async (name: string) => {
    const ref = db.collection(`leagues/${leagueId}/${COLLECTIONS.players}`).doc();
    const doc: PlayerDoc = {
      name,
      linkedUid: null,
      retired: false,
      mergedInto: null,
      createdBy: adminUid,
      createdAt: now,
    };
    await ref.set(doc);
    return ref.id;
  };
  const people = [
    league.playerId,
    await guest('Bo'),
    await guest('Cy'),
    await guest('Dev'),
    await guest('Eli'),
  ];

  // Days ago and who plays: a few games tonight, then weekly games going back a few months.
  const schedule: { daysAgo: number; hour: number; who: number[] }[] = [
    { daysAgo: 0, hour: 19, who: [0, 1, 2] },
    { daysAgo: 0, hour: 21, who: [0, 1, 2, 3] },
    { daysAgo: 3, hour: 20, who: [0, 2, 3, 4] },
    { daysAgo: 10, hour: 20, who: [0, 1, 2, 3, 4] },
    { daysAgo: 17, hour: 19, who: [1, 2, 3] },
    { daysAgo: 24, hour: 20, who: [0, 1, 3, 4] },
    { daysAgo: 31, hour: 20, who: [0, 1, 2] },
    { daysAgo: 38, hour: 21, who: [0, 2, 3, 4] },
    { daysAgo: 45, hour: 20, who: [0, 1, 2, 3] },
    { daysAgo: 52, hour: 19, who: [1, 2, 4] },
    { daysAgo: 66, hour: 20, who: [0, 1, 2, 3, 4] },
    { daysAgo: 80, hour: 20, who: [0, 1, 3] },
    { daysAgo: 120, hour: 20, who: [0, 1, 2, 3] },
    { daysAgo: 200, hour: 20, who: [0, 2, 4] },
  ];

  let gameNumber = 0;
  for (const night of schedule) {
    gameNumber += 1;
    const ids = night.who.map((i) => people[i]!);
    // Shuffle the seating a little so the dealer isn't always the same person.
    const seatOrder = [
      ...ids.slice(gameNumber % ids.length),
      ...ids.slice(0, gameNumber % ids.length),
    ];
    const createdAt = new Date(now - night.daysAgo * day).setHours(night.hour, gameNumber, 0, 0);
    const game: GameDoc = {
      settings: { ...DEFAULT_SETTINGS, limit: 101, maxRoundPenalty: 80 },
      seatOrder,
      status: 'inProgress',
      createdBy: adminUid,
      createdAt,
      split: null,
      summary: null,
      summaryError: null,
    };
    const gameRef = db.collection(`leagues/${leagueId}/${COLLECTIONS.games}`).doc();
    await gameRef.set(game);
    for (const round of playGame(seatOrder, gameNumber * 7919)) {
      await db
        .collection(roundsPath(leagueId, gameRef.id))
        .add(newRoundDoc(round, adminUid, createdAt));
    }
    await recomputeGame(db, leagueId, gameRef.id, now);
  }

  // One game still being played, which stats leave out.
  const live = db.collection(`leagues/${leagueId}/${COLLECTIONS.games}`).doc();
  await live.set({
    settings: { ...DEFAULT_SETTINGS, limit: 101, maxRoundPenalty: 80 },
    seatOrder: [people[0]!, people[1]!, people[2]!],
    status: 'inProgress',
    createdBy: adminUid,
    createdAt: now,
    split: null,
    summary: null,
    summaryError: null,
  } satisfies GameDoc);

  console.log(`Seeded "Demo Rummy" with ${schedule.length} finished games and one in progress.`);
  console.log(`League: http://localhost:5173/l/${leagueId}/stats`);
  console.log('Sign in as the tester "Asha" to see it.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
