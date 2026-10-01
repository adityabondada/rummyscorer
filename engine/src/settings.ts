export type DropsOnRejoin = { mode: 'carryOver' } | { mode: 'grant'; count: number };

export interface GameSettings {
  /** A player is out once their total goes past this. */
  limit: number;
  /** Paid by every player; also the cost to rejoin. */
  buyIn: number;
  dropPoints: number;
  middleDropPoints: number;
  /** Drops and middle drops both count toward this. */
  maxDrops: number;
  dropsOnRejoin: DropsOnRejoin;
  /** Full-count cap on a round's penalty. null means no cap. */
  maxRoundPenalty: number | null;
  /** No rejoin once the highest active score passes this. null means always allowed. */
  rejoinCutoff: number | null;
}

export const DEFAULT_SETTINGS: GameSettings = {
  limit: 201,
  buyIn: 10,
  dropPoints: 20,
  middleDropPoints: 40,
  maxDrops: 2,
  dropsOnRejoin: { mode: 'carryOver' },
  maxRoundPenalty: 80,
  rejoinCutoff: null,
};
