import type { GameSettings } from './settings';

export type PlayerId = string;

export type RoundEntry =
  { kind: 'points'; points: number } | { kind: 'drop' } | { kind: 'middleDrop' };

/**
 * A player coming back in after the round they sit on. `seatIndex` is where they are placed in
 * the seat order once they have been removed from it (0 = first seat, length = last seat).
 */
export interface Rejoin {
  playerId: PlayerId;
  seatIndex: number;
}

export interface ScrapInfo {
  by: string;
  at: number;
  reason: string;
}

export interface Round {
  /** Strictly increasing within a game. Scrapped rounds keep their seq. */
  seq: number;
  winnerId: PlayerId;
  /** One entry for every active player except the winner, who scores 0. */
  entries: Record<PlayerId, RoundEntry>;
  /** Rejoins that happen after this round and before the next one. */
  rejoins?: Rejoin[];
  scrapped?: ScrapInfo | null;
}

/**
 * Remaining players agreeing to end the game and split the pot. Only valid while it is recorded
 * against the latest non-scrapped round, so scrapping a round reopens the game by itself.
 */
export interface Split {
  afterSeq: number;
  shares: Record<PlayerId, number>;
}

export interface GameInput {
  settings: GameSettings;
  /** Initial seat order; the first player deals round 1. */
  seatOrder: PlayerId[];
  rounds: Round[];
  split?: Split | null;
}

export interface PlayerState {
  id: PlayerId;
  total: number;
  /** Drops used in the current life; reset by a rejoin that grants drops. */
  dropsUsed: number;
  dropsLeft: number;
  /** False once the player is out. */
  active: boolean;
  /** Entries paid, including the first. */
  buyIns: number;
  rejoins: number;
  roundsPlayed: number;
  /** Drops and middle drops taken over the whole game. */
  dropsTaken: number;
  /** Set while the player is out. */
  eliminated: { afterSeq: number; total: number } | null;
}

export interface RoundRecord {
  seq: number;
  dealerId: PlayerId;
  winnerId: PlayerId;
  /** Penalty applied to each active player, including 0 for the winner. */
  points: Record<PlayerId, number>;
  entries: Record<PlayerId, RoundEntry>;
  eliminated: PlayerId[];
  rejoined: PlayerId[];
}

export type GameOutcome = 'outright' | 'split';

export interface GameState {
  settings: GameSettings;
  /** Current seat order, including eliminated players. */
  seatOrder: PlayerId[];
  players: Record<PlayerId, PlayerState>;
  rounds: RoundRecord[];
  /** Seq of the latest applied round; 0 before the first round. */
  lastSeq: number;
  pot: number;
  status: 'inProgress' | 'finished';
  outcome: GameOutcome | null;
  winnerIds: PlayerId[];
  /** Pot paid to each winner once the game is finished. */
  payouts: Record<PlayerId, number>;
  /** Who deals the next round; null once finished. */
  dealerId: PlayerId | null;
  /** Who is dealt the first card in the next round; null once finished. */
  firstPlayerId: PlayerId | null;
  /** True when a recorded split was ignored because it no longer follows the latest round. */
  splitIgnored: boolean;
}

export interface GameSummary {
  outcome: GameOutcome;
  winnerIds: PlayerId[];
  pot: number;
  payouts: Record<PlayerId, number>;
  /** Payout minus buy-ins paid, per player. Sums to zero. */
  net: Record<PlayerId, number>;
  /** 1 = winner; ties share a position. */
  positions: Record<PlayerId, number>;
  rounds: number;
}

export interface Transfer {
  from: PlayerId;
  to: PlayerId;
  amount: number;
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}
