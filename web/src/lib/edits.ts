import {
  EngineError,
  latestScrappable,
  nextRestorable,
  nextSeq,
  rollbackTo,
  scrapLatest,
} from '@rummy/engine';
import type { PlayerId, Round } from '@rummy/engine';
import {
  changeRoundDoc,
  newRoundDoc,
  roundDocToEngine,
  type GameDoc,
  type RoundDoc,
} from '@rummy/data';
import {
  bySeq,
  gameState,
  liveRows,
  storedIds,
  toStoredRound,
  type PlayerMap,
  type RoundRow,
} from './game';

export type Plan<T> = { ok: true; value: T } | { ok: false; error: string };

/** A round document to write. `id` is null for a new round. */
export interface RoundWrite {
  id: string | null;
  doc: RoundDoc;
}

const fail = (error: string): Plan<never> => ({ ok: false, error });

/** Checks that the game still replays with these rounds, so a bad write is caught before saving. */
function replays(game: GameDoc, rows: RoundRow[], players: PlayerMap): string | null {
  try {
    gameState({ ...game, split: null }, rows, players);
    return null;
  } catch (error) {
    if (error instanceof EngineError) return error.message;
    throw error;
  }
}

/** Enters a new round, built from resolved ids, at the end of the game. */
export function planNewRound(
  game: GameDoc,
  rows: RoundRow[],
  players: PlayerMap,
  round: Round,
  uid: string,
  now: number,
): Plan<RoundWrite> {
  const seq = nextSeq(rows.map((r) => roundDocToEngine(r.doc)));
  const stored = toStoredRound({ ...round, seq }, storedIds(game, players));
  const doc = newRoundDoc(stored, uid, now);
  const problem = replays(game, [...rows, { id: '', doc }], players);
  return problem ? fail(problem) : { ok: true, value: { id: null, doc } };
}

/** Changes the winner and entries of an existing round, keeping its rejoins and its history. */
export function planEditRound(
  game: GameDoc,
  rows: RoundRow[],
  players: PlayerMap,
  target: RoundRow,
  round: Round,
  uid: string,
  now: number,
): Plan<RoundWrite> {
  const stored = toStoredRound(round, storedIds(game, players));
  const doc = changeRoundDoc(
    target.doc,
    { winnerId: stored.winnerId, entries: stored.entries },
    uid,
    now,
  );
  const next = rows.map((r) => (r.id === target.id ? { id: r.id, doc } : r));
  const problem = replays(game, next, players);
  return problem
    ? fail(`That change doesn't fit with the rounds after it: ${problem}`)
    : { ok: true, value: { id: target.id, doc } };
}

/**
 * Brings an eliminated player back in after the latest round, seated at `seatIndex` in the order
 * without them. Rejoins belong to the round before the break they happen in.
 */
export function planRejoin(
  game: GameDoc,
  rows: RoundRow[],
  players: PlayerMap,
  playerId: PlayerId,
  seatIndex: number,
  uid: string,
  now: number,
): Plan<RoundWrite> {
  const latest = liveRows(rows).at(-1);
  if (!latest) return fail('There is no round to rejoin after');
  const stored = storedIds(game, players)(playerId);
  const doc = changeRoundDoc(
    latest.doc,
    { rejoins: [...latest.doc.rejoins, { playerId: stored, seatIndex }] },
    uid,
    now,
  );
  const next = rows.map((r) => (r.id === latest.id ? { id: r.id, doc } : r));
  const problem = replays(game, next, players);
  return problem ? fail(problem) : { ok: true, value: { id: latest.id, doc } };
}

/** Rounds whose scrapped state differs between two versions, as documents to write. */
function diffScrapped(rows: RoundRow[], after: Round[], uid: string, now: number): RoundWrite[] {
  const bySeqAfter = new Map(after.map((r) => [r.seq, r]));
  const writes: RoundWrite[] = [];
  for (const row of bySeq(rows)) {
    const next = bySeqAfter.get(row.doc.seq)?.scrapped ?? null;
    if ((row.doc.scrapped ?? null) === next) continue;
    writes.push({ id: row.id, doc: changeRoundDoc(row.doc, { scrapped: next }, uid, now) });
  }
  return writes;
}

const engineRounds = (rows: RoundRow[]) => rows.map((r) => roundDocToEngine(r.doc));

function guarded(run: () => RoundWrite[]): Plan<RoundWrite[]> {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    if (error instanceof EngineError) return fail(error.message);
    throw error;
  }
}

/** The latest round that can be scrapped on its own, if any. */
export const scrappableRow = (rows: RoundRow[]): RoundRow | undefined => {
  const latest = latestScrappable(engineRounds(rows));
  return latest ? rows.find((r) => r.doc.seq === latest.seq) : undefined;
};

/** The round that can be restored next, if any. */
export const restorableRow = (rows: RoundRow[]): RoundRow | undefined => {
  const next = nextRestorable(engineRounds(rows));
  return next ? rows.find((r) => r.doc.seq === next.seq) : undefined;
};

export function planScrapLatest(
  rows: RoundRow[],
  reason: string,
  uid: string,
  now: number,
): Plan<RoundWrite[]> {
  return guarded(() =>
    diffScrapped(rows, scrapLatest(engineRounds(rows), { by: uid, at: now, reason }), uid, now),
  );
}

/** Scraps every round after `toSeq` in one step, with one reason. */
export function planRollback(
  rows: RoundRow[],
  toSeq: number,
  reason: string,
  uid: string,
  now: number,
): Plan<RoundWrite[]> {
  return guarded(() =>
    diffScrapped(
      rows,
      rollbackTo(engineRounds(rows), toSeq, { by: uid, at: now, reason }),
      uid,
      now,
    ),
  );
}

/** Restores the earliest scrapped round, which is the reverse of the order they were scrapped in. */
export function planRestore(rows: RoundRow[], uid: string, now: number): Plan<RoundWrite[]> {
  const target = restorableRow(rows);
  if (!target) return fail('There is no round that can be restored');
  return {
    ok: true,
    value: [{ id: target.id, doc: changeRoundDoc(target.doc, { scrapped: null }, uid, now) }],
  };
}
