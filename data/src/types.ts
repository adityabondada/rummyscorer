import type {
  GameOutcome,
  GameSettings,
  Penalty,
  PlayerId,
  Rejoin,
  RoundEntry,
  ScrapInfo,
  Split,
} from '@rummy/engine';

/**
 * Document shapes for Firestore. They contain plain data only, so the same types work with both
 * the web SDK and the admin SDK. Timestamps are epoch milliseconds (numbers).
 */

export interface LeagueDoc {
  name: string;
  adminUid: string;
  inviteCode: string;
  memberUids: string[];
  createdAt: number;
}

export interface PlayerDoc {
  name: string;
  /** Set when the player is a signed-in member; null for a guest. Written by functions only. */
  linkedUid: string | null;
  retired: boolean;
  /** Set when this profile was merged into another. Written by functions only. */
  mergedInto: string | null;
  createdBy: string;
  createdAt: number;
}

export interface PlayerStatsDoc {
  net: number;
  /** 1 = winner; ties share a position. */
  position: number;
  roundsPlayed: number;
  dropsTaken: number;
  rejoins: number;
  buyIns: number;
  /**
   * Rounds won, and penalty rounds taken. Missing on summaries saved before they were tracked,
   * until the game is recalculated.
   */
  roundsWon?: number;
  penalties?: number;
}

/** Cached result of a finished game. Written by `onRoundWrite`; stats read only these. */
export interface GameSummaryDoc {
  outcome: GameOutcome;
  winnerIds: PlayerId[];
  pot: number;
  payouts: Record<PlayerId, number>;
  rounds: number;
  /** Keyed by resolved (merged) player id. */
  players: Record<PlayerId, PlayerStatsDoc>;
  computedAt: number;
}

export interface GameDoc {
  settings: GameSettings;
  /** Initial seat order. Later changes (rejoins) live in the rounds. */
  seatOrder: PlayerId[];
  /** Set by functions from the replay; clients always create games as 'inProgress'. */
  status: 'inProgress' | 'finished';
  createdBy: string;
  createdAt: number;
  /** Agreed split of the pot; set by clients, and ignored by the engine once a later round exists. */
  split: Split | null;
  /** Set by functions. Null until the game is finished. */
  summary: GameSummaryDoc | null;
  /** Set by functions when the recorded rounds can't be replayed. */
  summaryError: string | null;
  /** Set by functions while a read-only link for watching the game is switched on. */
  shareCode?: string | null;
}

/** What a round looked like before an edit, scrap or restore. */
export interface RoundSnapshot {
  /** null in a penalty round, which nobody won. */
  winnerId: PlayerId | null;
  /** Set when one player took a penalty and the others scored 0 (unless they dropped). */
  penalty: Penalty | null;
  entries: Record<PlayerId, RoundEntry>;
  rejoins: Rejoin[];
  scrapped: ScrapInfo | null;
}

export interface RoundHistoryEntry {
  by: string;
  at: number;
  prev: RoundSnapshot;
}

export interface RoundDoc extends RoundSnapshot {
  seq: number;
  updatedBy: string;
  updatedAt: number;
  /** One entry per change, oldest first. Every update to a round appends exactly one. */
  history: RoundHistoryEntry[];
}

export type LogType =
  | 'memberJoined'
  | 'memberRemoved'
  | 'inviteRegenerated'
  | 'playerMerged'
  | 'playerUnmerged'
  | 'gameDeleted';

/**
 * A payment someone marked as paid. The document id is built from the night and the exact amount
 * (see `settledKey`), so if a later game changes what is owed, the old mark no longer matches and
 * the payment shows as unpaid again.
 */
export interface SettledDoc {
  /** The night, as a local date "YYYY-MM-DD". */
  day: string;
  from: string;
  to: string;
  amount: number;
  /** Who marked it paid. */
  by: string;
  at: number;
}

export interface LogEntryDoc {
  type: LogType;
  by: string;
  at: number;
  details: Record<string, string | number | boolean | null>;
}

/**
 * What a share code points at. Only functions read and write these; the code is unguessable, and
 * deleting the document turns the link off.
 */
export interface ShareDoc {
  leagueId: string;
  gameId: string;
  createdBy: string;
  createdAt: number;
}
