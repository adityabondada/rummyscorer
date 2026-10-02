import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const L = 'league1';
const G = 'game1';
const R = 'round1';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-rummytracker',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host,
      port: Number(port),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

const settings = {
  limit: 201,
  buyIn: 10,
  dropPoints: 20,
  middleDropPoints: 40,
  maxDrops: 2,
  dropsOnRejoin: { mode: 'carryOver' },
  maxRoundPenalty: 80,
  rejoinCutoff: null,
};

const league = {
  name: 'Friday Rummy',
  adminUid: 'admin',
  inviteCode: 'ABC123',
  memberUids: ['admin', 'member'],
  createdAt: 1,
};
const guest = {
  name: 'Ravi',
  linkedUid: null,
  retired: false,
  mergedInto: null,
  createdBy: 'member',
  createdAt: 1,
};
const newGame = {
  settings,
  seatOrder: ['p1', 'p2'],
  status: 'inProgress',
  createdBy: 'member',
  createdAt: 1,
  split: null,
  summary: null,
  summaryError: null,
};
const newRound = {
  seq: 1,
  winnerId: 'p1',
  entries: { p2: { kind: 'points', points: 30 } },
  rejoins: [],
  scrapped: null,
  updatedBy: 'member',
  updatedAt: 1,
  history: [],
};
const historyEntry = (by: string) => ({
  by,
  at: 2,
  prev: { winnerId: 'p1', entries: newRound.entries, rejoins: [], scrapped: null },
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `leagues/${L}`), league);
    await setDoc(doc(db, `leagues/${L}/players/p1`), guest);
    await setDoc(doc(db, `leagues/${L}/games/${G}`), newGame);
    await setDoc(doc(db, `leagues/${L}/games/${G}/rounds/${R}`), newRound);
    await setDoc(doc(db, `leagues/${L}/log/e1`), {
      type: 'memberJoined',
      by: 'member',
      at: 1,
      details: {},
    });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('leagues', () => {
  it('can be read by a member, not by an outsider or a signed-out user', async () => {
    await assertSucceeds(getDoc(doc(as('member'), `leagues/${L}`)));
    await assertFails(getDoc(doc(as('outsider'), `leagues/${L}`)));
    await assertFails(getDoc(doc(anon(), `leagues/${L}`)));
  });

  it('are listed for a user with an array-contains query on their own uid', async () => {
    const mine = query(
      collection(as('member'), 'leagues'),
      where('memberUids', 'array-contains', 'member'),
    );
    await assertSucceeds(getDocs(mine));
    const nosy = query(
      collection(as('outsider'), 'leagues'),
      where('memberUids', 'array-contains', 'member'),
    );
    await assertFails(getDocs(nosy));
    await assertFails(getDocs(collection(as('member'), 'leagues')));
  });

  it('cannot be created from the client: the createLeague function does that', async () => {
    const mine = {
      name: 'New',
      adminUid: 'u9',
      inviteCode: 'XYZ789',
      memberUids: ['u9'],
      createdAt: 1,
    };
    await assertFails(setDoc(doc(as('u9'), 'leagues/new'), mine));
    await assertFails(setDoc(doc(anon(), 'leagues/new2'), mine));
  });

  it('cannot be changed or deleted from the client, even by the admin', async () => {
    const db = as('admin');
    await assertFails(updateDoc(doc(db, `leagues/${L}`), { inviteCode: 'NEW' }));
    await assertFails(updateDoc(doc(db, `leagues/${L}`), { memberUids: ['admin', 'me'] }));
    await assertFails(deleteDoc(doc(db, `leagues/${L}`)));
  });

  it('cannot be joined by writing yourself into memberUids', async () => {
    await assertFails(
      updateDoc(doc(as('outsider'), `leagues/${L}`), {
        memberUids: ['admin', 'member', 'outsider'],
      }),
    );
  });
});

describe('players', () => {
  it('can be read by members only', async () => {
    await assertSucceeds(getDoc(doc(as('member'), `leagues/${L}/players/p1`)));
    await assertFails(getDoc(doc(as('outsider'), `leagues/${L}/players/p1`)));
    await assertFails(getDoc(doc(anon(), `leagues/${L}/players/p1`)));
  });

  it('can be added as guests by any member', async () => {
    await assertSucceeds(setDoc(doc(as('member'), `leagues/${L}/players/p2`), guest));
    await assertFails(
      setDoc(doc(as('outsider'), `leagues/${L}/players/p3`), { ...guest, createdBy: 'outsider' }),
    );
  });

  it('cannot be created already linked, merged, retired or credited to someone else', async () => {
    const db = as('member');
    await assertFails(
      setDoc(doc(db, `leagues/${L}/players/x1`), { ...guest, linkedUid: 'member' }),
    );
    await assertFails(setDoc(doc(db, `leagues/${L}/players/x2`), { ...guest, mergedInto: 'p1' }));
    await assertFails(setDoc(doc(db, `leagues/${L}/players/x3`), { ...guest, retired: true }));
    await assertFails(setDoc(doc(db, `leagues/${L}/players/x4`), { ...guest, createdBy: 'admin' }));
    await assertFails(setDoc(doc(db, `leagues/${L}/players/x5`), { ...guest, name: '' }));
  });

  it('can be renamed and retired by any member', async () => {
    const ref = doc(as('member'), `leagues/${L}/players/p1`);
    await assertSucceeds(updateDoc(ref, { name: 'Ravi K' }));
    await assertSucceeds(updateDoc(ref, { retired: true }));
    await assertFails(updateDoc(ref, { name: '' }));
  });

  it('cannot be linked or merged from the client', async () => {
    const ref = doc(as('member'), `leagues/${L}/players/p1`);
    await assertFails(updateDoc(ref, { linkedUid: 'member' }));
    await assertFails(updateDoc(ref, { mergedInto: 'p2' }));
    await assertFails(updateDoc(ref, { createdBy: 'admin' }));
  });

  it('cannot be deleted', async () => {
    await assertFails(deleteDoc(doc(as('member'), `leagues/${L}/players/p1`)));
  });
});

describe('games', () => {
  const ref = (uid: string, id = G) => doc(as(uid), `leagues/${L}/games/${id}`);

  it('can be read by members only', async () => {
    await assertSucceeds(getDoc(ref('member')));
    await assertFails(getDoc(ref('outsider')));
  });

  it('can be started by any member', async () => {
    await assertSucceeds(setDoc(ref('member', 'g2'), newGame));
    await assertFails(setDoc(ref('outsider', 'g3'), { ...newGame, createdBy: 'outsider' }));
  });

  it('must start in progress, credited to the creator, with nothing precomputed', async () => {
    await assertFails(setDoc(ref('member', 'a'), { ...newGame, status: 'finished' }));
    await assertFails(setDoc(ref('member', 'b'), { ...newGame, createdBy: 'admin' }));
    await assertFails(
      setDoc(ref('member', 'c'), { ...newGame, split: { afterSeq: 0, shares: {} } }),
    );
    await assertFails(setDoc(ref('member', 'd'), { ...newGame, summaryError: 'x' }));
    await assertFails(setDoc(ref('member', 'e'), { ...newGame, seatOrder: ['p1'] }));
    await assertFails(setDoc(ref('member', 'f'), { ...newGame, settings: 'nope' }));
    await assertFails(setDoc(ref('member', 'g'), { ...newGame, extra: 1 }));
  });

  it('can have a split recorded and cleared by a member', async () => {
    await assertSucceeds(
      updateDoc(ref('member'), { split: { afterSeq: 1, shares: { p1: 10, p2: 10 } } }),
    );
    await assertSucceeds(updateDoc(ref('member'), { split: null }));
    await assertFails(updateDoc(ref('outsider'), { split: null }));
    await assertFails(updateDoc(ref('member'), { split: 'half' }));
  });

  it('keeps settings, seating, status and summary out of client hands', async () => {
    await assertFails(updateDoc(ref('member'), { settings: { ...settings, limit: 101 } }));
    await assertFails(updateDoc(ref('member'), { seatOrder: ['p2', 'p1'] }));
    await assertFails(updateDoc(ref('member'), { status: 'finished' }));
    await assertFails(updateDoc(ref('member'), { summary: { outcome: 'outright' } }));
    await assertFails(updateDoc(ref('member'), { summaryError: 'boom' }));
  });

  it('cannot be deleted', async () => {
    await assertFails(deleteDoc(ref('member')));
  });
});

describe('rounds', () => {
  const ref = (uid: string, id = R) => doc(as(uid), `leagues/${L}/games/${G}/rounds/${id}`);
  const edited = (uid: string, extra = {}) => ({
    ...newRound,
    entries: { p2: { kind: 'points', points: 35 } },
    updatedBy: uid,
    updatedAt: 2,
    history: [historyEntry(uid)],
    ...extra,
  });

  it('can be read by members only', async () => {
    await assertSucceeds(getDoc(ref('member')));
    await assertFails(getDoc(ref('outsider')));
    await assertFails(getDoc(doc(anon(), `leagues/${L}/games/${G}/rounds/${R}`)));
  });

  it('can be entered by any member', async () => {
    await assertSucceeds(setDoc(ref('admin', 'r2'), { ...newRound, seq: 2, updatedBy: 'admin' }));
    await assertFails(
      setDoc(ref('outsider', 'r3'), { ...newRound, seq: 3, updatedBy: 'outsider' }),
    );
  });

  it('must be entered as the caller, unscrapped, with empty history and a valid seq', async () => {
    await assertFails(setDoc(ref('member', 'a'), { ...newRound, updatedBy: 'admin' }));
    await assertFails(
      setDoc(ref('member', 'b'), { ...newRound, scrapped: { by: 'member', at: 1, reason: 'x' } }),
    );
    await assertFails(
      setDoc(ref('member', 'c'), { ...newRound, history: [historyEntry('member')] }),
    );
    await assertFails(setDoc(ref('member', 'd'), { ...newRound, seq: 0 }));
    await assertFails(setDoc(ref('member', 'e'), { ...newRound, seq: 1.5 }));
    await assertFails(setDoc(ref('member', 'f'), { ...newRound, entries: 'none' }));
    await assertFails(setDoc(ref('member', 'g'), { ...newRound, extra: 1 }));
  });

  it('can be edited by any member when the old values go into history', async () => {
    await assertSucceeds(setDoc(ref('admin'), edited('admin')));
  });

  it('cannot be edited without appending to history', async () => {
    await assertFails(setDoc(ref('member'), { ...edited('member'), history: [] }));
    await assertFails(
      setDoc(ref('member'), {
        ...edited('member'),
        history: [historyEntry('member'), historyEntry('member')],
      }),
    );
  });

  it("cannot be edited in the caller's name for someone else", async () => {
    await assertFails(setDoc(ref('member'), { ...edited('member'), updatedBy: 'admin' }));
    await assertFails(
      setDoc(ref('member'), { ...edited('member'), history: [historyEntry('admin')] }),
    );
  });

  it('keeps earlier history entries intact', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `leagues/${L}/games/${G}/rounds/${R}`), {
        ...edited('admin'),
      });
    });
    const second = {
      ...edited('member'),
      updatedAt: 3,
      history: [historyEntry('admin'), historyEntry('member')],
    };
    await assertSucceeds(setDoc(ref('member'), second));

    const rewritten = {
      ...second,
      history: [{ ...historyEntry('admin'), by: 'member' }, historyEntry('member')],
    };
    await assertFails(setDoc(ref('member'), rewritten));
  });

  it('keeps its seq', async () => {
    await assertFails(setDoc(ref('member'), edited('member', { seq: 2 })));
  });

  it("can be scrapped with a reason, restored, and not scrapped in another member's name", async () => {
    const scrap = { by: 'member', at: 5, reason: 'wrong player won' };
    await assertSucceeds(setDoc(ref('member'), edited('member', { scrapped: scrap })));
    await assertFails(
      setDoc(ref('member'), edited('member', { scrapped: { ...scrap, by: 'admin' } })),
    );
    await assertFails(
      setDoc(ref('member'), edited('member', { scrapped: { ...scrap, reason: '' } })),
    );
    await assertFails(
      setDoc(ref('outsider'), edited('outsider', { scrapped: { ...scrap, by: 'outsider' } })),
    );
  });

  it('can be restored by a different member than the one who scrapped it', async () => {
    const scrap = { by: 'member', at: 5, reason: 'oops' };
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `leagues/${L}/games/${G}/rounds/${R}`),
        edited('member', { scrapped: scrap }),
      );
    });
    const restored = {
      ...edited('admin'),
      scrapped: null,
      history: [
        historyEntry('member'),
        { ...historyEntry('admin'), prev: { ...historyEntry('admin').prev, scrapped: scrap } },
      ],
    };
    await assertSucceeds(setDoc(ref('admin'), restored));
  });

  it('cannot be edited by outsiders or deleted by anyone', async () => {
    await assertFails(setDoc(ref('outsider'), edited('outsider')));
    await assertFails(deleteDoc(ref('member')));
  });
});

describe('log', () => {
  it('can be read by members, never written from the client', async () => {
    await assertSucceeds(getDoc(doc(as('member'), `leagues/${L}/log/e1`)));
    await assertFails(getDoc(doc(as('outsider'), `leagues/${L}/log/e1`)));
    await assertFails(
      setDoc(doc(as('member'), `leagues/${L}/log/e2`), {
        type: 'x',
        by: 'member',
        at: 1,
        details: {},
      }),
    );
    await assertFails(deleteDoc(doc(as('admin'), `leagues/${L}/log/e1`)));
  });
});

describe('everything else', () => {
  it('is closed', async () => {
    await assertFails(setDoc(doc(as('member'), 'users/member'), { name: 'x' }));
    await assertFails(getDoc(doc(as('member'), 'users/member')));
  });
});
