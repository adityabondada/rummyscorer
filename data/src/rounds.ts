import type { GameInput, Round } from '@rummy/engine';
import type { GameDoc, RoundDoc, RoundSnapshot } from './types';

/** A stored round as the engine sees it. */
export function roundDocToEngine(doc: RoundDoc): Round {
  return {
    seq: doc.seq,
    winnerId: doc.winnerId,
    penalty: doc.penalty,
    entries: doc.entries,
    rejoins: doc.rejoins,
    scrapped: doc.scrapped,
  };
}

/** Everything the engine needs to replay a game, from its stored documents. */
export function gameInput(game: GameDoc, rounds: RoundDoc[]): GameInput {
  return {
    settings: game.settings,
    seatOrder: game.seatOrder,
    rounds: rounds.map(roundDocToEngine),
    split: game.split,
  };
}

/** A brand-new round, as the first member to enter it would write it. */
export function newRoundDoc(round: Round, uid: string, now: number): RoundDoc {
  return {
    seq: round.seq,
    winnerId: round.winnerId,
    penalty: round.penalty ?? null,
    entries: round.entries,
    rejoins: round.rejoins ?? [],
    scrapped: null,
    updatedBy: uid,
    updatedAt: now,
    history: [],
  };
}

/**
 * The next version of a round after an edit, scrap or restore. The previous values are appended
 * to `history`, which is what the security rules require of every update.
 */
export function changeRoundDoc(
  prev: RoundDoc,
  changes: Partial<RoundSnapshot>,
  uid: string,
  now: number,
): RoundDoc {
  return {
    ...prev,
    ...changes,
    updatedBy: uid,
    updatedAt: now,
    history: [
      ...prev.history,
      {
        // Who made this change, and when; `prev` holds the values it replaced.
        by: uid,
        at: now,
        prev: {
          winnerId: prev.winnerId,
          penalty: prev.penalty,
          entries: prev.entries,
          rejoins: prev.rejoins,
          scrapped: prev.scrapped,
        },
      },
    ],
  };
}
