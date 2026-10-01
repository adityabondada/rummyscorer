import { EngineError } from './types';

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

/** Throws EngineError if the settings can't describe a playable game. */
export function validateSettings(s: GameSettings): void {
  const isCount = (n: number) => Number.isInteger(n) && n >= 0;
  if (!Number.isInteger(s.limit) || s.limit <= 0) throw new EngineError('limit must be positive');
  if (!isCount(s.buyIn)) throw new EngineError('buyIn must be a whole amount');
  if (!isCount(s.dropPoints) || !isCount(s.middleDropPoints)) {
    throw new EngineError('drop points must be whole numbers');
  }
  if (!isCount(s.maxDrops)) throw new EngineError('maxDrops must be a whole number');
  if (s.dropsOnRejoin.mode === 'grant') {
    const { count } = s.dropsOnRejoin;
    if (!isCount(count) || count > s.maxDrops) {
      throw new EngineError('drops granted on rejoin must be between 0 and maxDrops');
    }
  }
  if (
    s.maxRoundPenalty !== null &&
    (!Number.isInteger(s.maxRoundPenalty) || s.maxRoundPenalty <= 0)
  ) {
    throw new EngineError('maxRoundPenalty must be positive or null');
  }
  if (s.rejoinCutoff !== null && !isCount(s.rejoinCutoff)) {
    throw new EngineError('rejoinCutoff must be a whole number or null');
  }
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
