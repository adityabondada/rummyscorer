import {
  activeIds,
  applyRound,
  EngineError,
  type GameState,
  type PenaltyReason,
  type PlayerId,
  type Round,
  type RoundEntry,
} from '@rummy/engine';

/** What a member has typed or tapped for one player, before it becomes an engine entry. */
export type FormEntry =
  { kind: 'points'; points: string } | { kind: 'drop' } | { kind: 'middleDrop' };

/** A drop is the only thing to record for someone else in a penalty round. */
export type DropEntry = Extract<FormEntry, { kind: 'drop' | 'middleDrop' }>;

/**
 * A round either has a winner, with everyone else's points, or is a penalty round: nobody won, one
 * player took the penalty and everyone else scores 0, except players who dropped.
 */
export type RoundMode = 'win' | 'penalty';

export interface PenaltyForm {
  playerId: PlayerId | null;
  points: string;
  reason: PenaltyReason;
}

export interface RoundForm {
  mode: RoundMode;
  winnerId: PlayerId | null;
  entries: Record<PlayerId, FormEntry>;
  penalty: PenaltyForm;
  /** Who dropped, in a penalty round. Anyone not here played, and scores 0. */
  drops: Record<PlayerId, DropEntry>;
}

export type Built = { ok: true; round: Round } | { ok: false; error: string };

/** `maxPenalty` is the game's per-round cap, which a penalty starts at. */
export const emptyForm = (maxPenalty: number | null = null): RoundForm => ({
  mode: 'win',
  winnerId: null,
  entries: {},
  penalty: {
    playerId: null,
    points: maxPenalty === null ? '' : String(maxPenalty),
    reason: 'wrongShow',
  },
  drops: {},
});

/** Pre-fills the form from an existing round, for editing. */
export function formFromRound(round: Round, maxPenalty: number | null = null): RoundForm {
  const form = emptyForm(maxPenalty);
  if (round.penalty) {
    const drops: Record<PlayerId, DropEntry> = {};
    for (const [id, entry] of Object.entries(round.entries)) {
      if (entry.kind !== 'points') drops[id] = entry;
    }
    return {
      ...form,
      mode: 'penalty',
      penalty: {
        playerId: round.penalty.playerId,
        points: String(round.penalty.points),
        reason: round.penalty.reason,
      },
      drops,
    };
  }
  const entries: Record<PlayerId, FormEntry> = {};
  for (const [id, entry] of Object.entries(round.entries)) {
    entries[id] =
      entry.kind === 'points' ? { kind: 'points', points: String(entry.points) } : entry;
  }
  return { ...form, winnerId: round.winnerId, entries };
}

function toEntry(entry: FormEntry | undefined): RoundEntry | null {
  if (!entry) return null;
  if (entry.kind !== 'points') return entry;
  const text = entry.points.trim();
  if (!/^\d+$/.test(text)) return null;
  return { kind: 'points', points: Number(text) };
}

function buildWin(state: GameState, form: RoundForm, seq: number): Built {
  if (!form.winnerId) return { ok: false, error: 'Pick who won the round' };

  const entries: Record<PlayerId, RoundEntry> = {};
  for (const id of activeIds(state)) {
    if (id === form.winnerId) continue;
    const entry = toEntry(form.entries[id]);
    if (!entry) return { ok: false, error: `Enter points for ${id}, or tap Drop` };
    entries[id] = entry;
  }
  return { ok: true, round: { seq, winnerId: form.winnerId, entries } };
}

function buildPenalty(state: GameState, form: RoundForm, seq: number): Built {
  const { playerId, points, reason } = form.penalty;
  if (!playerId) return { ok: false, error: 'Pick who made the mistake' };
  const text = points.trim();
  if (!/^\d+$/.test(text) || Number(text) === 0) {
    return { ok: false, error: 'Enter the penalty points' };
  }

  const entries: Record<PlayerId, RoundEntry> = {};
  for (const id of activeIds(state)) {
    if (id === playerId) continue;
    entries[id] = form.drops[id] ?? { kind: 'points', points: 0 };
  }
  return {
    ok: true,
    round: { seq, winnerId: null, penalty: { playerId, points: Number(text), reason }, entries },
  };
}

/**
 * Turns the form into a round for `state` (the game as it stands before this round) and checks it
 * with the engine, so what the screen accepts is exactly what a replay will accept.
 */
export function buildRound(state: GameState, form: RoundForm, seq: number): Built {
  const built =
    form.mode === 'penalty' ? buildPenalty(state, form, seq) : buildWin(state, form, seq);
  if (!built.ok) return built;
  try {
    applyRound(state, built.round);
  } catch (error) {
    if (error instanceof EngineError) return { ok: false, error: error.message };
    throw error;
  }
  return built;
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

export const PENALTY_REASONS: { value: PenaltyReason; label: string }[] = [
  { value: 'wrongShow', label: 'Wrong show' },
  { value: 'error', label: 'Other error' },
];

export const reasonLabel = (reason: PenaltyReason): string =>
  PENALTY_REASONS.find((r) => r.value === reason)?.label ?? reason;
