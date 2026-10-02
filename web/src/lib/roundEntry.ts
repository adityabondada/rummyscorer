import {
  activeIds,
  applyRound,
  EngineError,
  type GameState,
  type PlayerId,
  type Round,
  type RoundEntry,
} from '@rummy/engine';

/** What a member has typed or tapped for one player, before it becomes an engine entry. */
export type FormEntry =
  { kind: 'points'; points: string } | { kind: 'drop' } | { kind: 'middleDrop' };

export interface RoundForm {
  winnerId: PlayerId | null;
  entries: Record<PlayerId, FormEntry>;
}

export type Built = { ok: true; round: Round } | { ok: false; error: string };

export const emptyForm = (): RoundForm => ({ winnerId: null, entries: {} });

/** Pre-fills the form from an existing round, for editing. */
export function formFromRound(round: Round): RoundForm {
  const entries: Record<PlayerId, FormEntry> = {};
  for (const [id, entry] of Object.entries(round.entries)) {
    entries[id] =
      entry.kind === 'points' ? { kind: 'points', points: String(entry.points) } : entry;
  }
  return { winnerId: round.winnerId, entries };
}

function toEntry(entry: FormEntry | undefined): RoundEntry | null {
  if (!entry) return null;
  if (entry.kind !== 'points') return entry;
  const text = entry.points.trim();
  if (!/^\d+$/.test(text)) return null;
  return { kind: 'points', points: Number(text) };
}

/**
 * Turns the form into a round for `state` (the game as it stands before this round) and checks it
 * with the engine, so what the screen accepts is exactly what a replay will accept.
 */
export function buildRound(state: GameState, form: RoundForm, seq: number): Built {
  if (!form.winnerId) return { ok: false, error: 'Pick who won the round' };

  const entries: Record<PlayerId, RoundEntry> = {};
  for (const id of activeIds(state)) {
    if (id === form.winnerId) continue;
    const entry = toEntry(form.entries[id]);
    if (!entry) return { ok: false, error: `Enter points for ${id}, or tap Drop` };
    entries[id] = entry;
  }
  const round: Round = { seq, winnerId: form.winnerId, entries };
  try {
    applyRound(state, round);
  } catch (error) {
    if (error instanceof EngineError) return { ok: false, error: error.message };
    throw error;
  }
  return { ok: true, round };
}

/** The points a tapped drop would add, for showing on the button. */
export function dropPoints(state: GameState, kind: 'drop' | 'middleDrop'): number {
  return kind === 'drop' ? state.settings.dropPoints : state.settings.middleDropPoints;
}

/** A player's drops as "1 of 2 left". */
export function dropsLabel(state: GameState, id: PlayerId): string {
  const p = state.players[id]!;
  return `${p.dropsLeft} of ${state.settings.maxDrops} left`;
}
