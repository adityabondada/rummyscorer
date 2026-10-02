import { isDeepStrictEqual } from 'node:util';
import { EngineError, replay } from '@rummy/engine';
import {
  DataError,
  gameInput,
  gamePath,
  makeResolveId,
  parseGame,
  parsePlayer,
  parseRound,
  playersPath,
  roundsPath,
  summaryFromState,
  type GameSummaryDoc,
  type PlayerDoc,
  type RoundDoc,
} from '@rummy/data';
import type { Firestore } from 'firebase-admin/firestore';

export type RecomputeResult = 'updated' | 'unchanged' | 'missing';

interface Derived {
  status: 'inProgress' | 'finished';
  summary: GameSummaryDoc | null;
  summaryError: string | null;
}

const withoutTime = (s: GameSummaryDoc | null) => (s ? { ...s, computedAt: 0 } : null);

/**
 * Replays a game from its stored rounds and writes the result back to the game document: its
 * status, the cached summary of a finished game, or the reason the rounds can't be replayed.
 *
 * It runs in a transaction, so two rounds written close together can't leave an older replay
 * overwriting a newer one. Nothing is written when the result hasn't changed, which also keeps
 * the game-document trigger from firing for no reason.
 */
export async function recomputeGame(
  db: Firestore,
  leagueId: string,
  gameId: string,
  now: number,
): Promise<RecomputeResult> {
  const gameRef = db.doc(gamePath(leagueId, gameId));

  return db.runTransaction(async (tx) => {
    const [gameSnap, roundsSnap, playersSnap] = await Promise.all([
      tx.get(gameRef),
      tx.get(db.collection(roundsPath(leagueId, gameId))),
      tx.get(db.collection(playersPath(leagueId))),
    ]);
    if (!gameSnap.exists) return 'missing';
    const raw = gameSnap.data() ?? {};

    let derived: Derived;
    try {
      // The stored summary is ignored here so an old summary shape can't block a recompute.
      const game = parseGame({ ...raw, summary: null, summaryError: null });
      const rounds: RoundDoc[] = roundsSnap.docs.map((d) => parseRound(d.data()));
      const players: Record<string, PlayerDoc> = {};
      for (const d of playersSnap.docs) {
        try {
          players[d.id] = parsePlayer(d.data());
        } catch {
          // A malformed player doc just isn't merged into anything.
        }
      }
      const state = replay(gameInput(game, rounds), { resolveId: makeResolveId(players) });
      derived = {
        status: state.status,
        summary: summaryFromState(state, now),
        summaryError: null,
      };
    } catch (error) {
      if (!(error instanceof EngineError || error instanceof DataError)) throw error;
      derived = { status: 'inProgress', summary: null, summaryError: error.message };
    }

    const unchanged =
      raw.status === derived.status &&
      (raw.summaryError ?? null) === derived.summaryError &&
      isDeepStrictEqual(withoutTime(raw.summary ?? null), withoutTime(derived.summary));
    if (unchanged) return 'unchanged';

    tx.update(gameRef, { ...derived });
    return 'updated';
  });
}

/** Whether a change to a game document needs a recompute: only when the split changed. */
export function splitChanged(before: unknown, after: unknown): boolean {
  const split = (data: unknown) =>
    typeof data === 'object' && data !== null && 'split' in data
      ? ((data as { split: unknown }).split ?? null)
      : null;
  return !isDeepStrictEqual(split(before), split(after));
}
