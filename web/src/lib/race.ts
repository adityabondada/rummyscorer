/** How a player's score bar should look in the race to the limit. */
export type RaceTone = 'safe' | 'warn' | 'danger' | 'out';

export interface RaceView {
  /** How full the bar is, from 0 to 100. */
  pct: number;
  tone: RaceTone;
  /** Points left before they go out. 0 when they are at the limit or already out. */
  left: number;
  /** Close enough to the limit that the bar should pulse. */
  pulse: boolean;
}

/** Bars go amber from this share of the limit, and red from the next. */
export const WARN_AT = 60;
export const DANGER_AT = 85;
/** Bars start to pulse from here. */
export const PULSE_AT = 90;

/**
 * Turns a score into the bar to draw. Someone is out once they go *past* the limit, so a score
 * equal to the limit is a full bar with no points left, but still in the game.
 */
export function raceView(total: number, limit: number, active: boolean): RaceView {
  const pct = limit > 0 ? Math.min(100, Math.max(0, (total / limit) * 100)) : 0;
  if (!active) return { pct, tone: 'out', left: 0, pulse: false };
  const tone: RaceTone = pct >= DANGER_AT ? 'danger' : pct >= WARN_AT ? 'warn' : 'safe';
  return { pct, tone, left: Math.max(0, limit - total), pulse: pct >= PULSE_AT };
}
