import { DEFAULT_SETTINGS, type GameSettings } from './settings';
import type { PlayerId, Rejoin, Round, RoundEntry } from './types';

export const settings = (overrides: Partial<GameSettings> = {}): GameSettings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
});

export const pts = (points: number): RoundEntry => ({ kind: 'points', points });
export const drop: RoundEntry = { kind: 'drop' };
export const mid: RoundEntry = { kind: 'middleDrop' };

export function round(
  seq: number,
  winnerId: PlayerId,
  entries: Record<PlayerId, RoundEntry | number>,
  rejoins?: Rejoin[],
): Round {
  const resolved: Record<PlayerId, RoundEntry> = {};
  for (const [id, entry] of Object.entries(entries)) {
    resolved[id] = typeof entry === 'number' ? pts(entry) : entry;
  }
  return { seq, winnerId, entries: resolved, ...(rejoins ? { rejoins } : {}) };
}

/** Deterministic random numbers for simulation tests. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
