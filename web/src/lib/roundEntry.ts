import { DANGER_AT } from './race';
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

/** What saving the round as filled in so far would do to each player. */
export interface Preview {
  /** The new total of each player whose points for this round are known so far. */
  totals: Record<PlayerId, number>;
  /** Players whose new total is past the limit. */
  out: PlayerId[];
  /** Players still in, but within sight of the limit. */
  close: PlayerId[];
  /** Who would win, if this round ends the game. null if it doesn't, or isn't complete yet. */
  winners: PlayerId[] | null;
}

const wholeNumber = (text: string): number | null =>
  /^\d+$/.test(text.trim()) ? Number(text) : null;

/**
 * Works out the new totals as the form is filled in, so a slip such as 80 for 8 shows before it is
 * saved. A player appears once their points are known; the end-of-game note waits until the round
 * is complete and the engine accepts it.
 */
export function previewRound(state: GameState, form: RoundForm, seq: number): Preview {
  const { limit, dropPoints: drop, middleDropPoints: middle } = state.settings;
  const added: Record<PlayerId, number> = {};
  const dropValue = (kind: 'drop' | 'middleDrop') => (kind === 'drop' ? drop : middle);

  if (form.mode === 'penalty') {
    const { playerId, points } = form.penalty;
    const penalty = wholeNumber(points);
    if (playerId && penalty !== null) {
      for (const id of activeIds(state)) {
        if (id === playerId) added[id] = penalty;
        else {
          const dropped = form.drops[id];
          added[id] = dropped ? dropValue(dropped.kind) : 0;
        }
      }
    }
  } else if (form.winnerId) {
    for (const id of activeIds(state)) {
      if (id === form.winnerId) {
        added[id] = 0;
        continue;
      }
      const entry = form.entries[id];
      if (!entry) continue;
      const n = entry.kind === 'points' ? wholeNumber(entry.points) : dropValue(entry.kind);
      if (n !== null) added[id] = n;
    }
  }

  const totals: Record<PlayerId, number> = {};
  const out: PlayerId[] = [];
  const close: PlayerId[] = [];
  for (const [id, points] of Object.entries(added)) {
    const total = state.players[id]!.total + points;
    totals[id] = total;
    if (total > limit) out.push(id);
    else if (limit > 0 && (total / limit) * 100 >= DANGER_AT) close.push(id);
  }

  let winners: PlayerId[] | null = null;
  const built = buildRound(state, form, seq);
  if (built.ok) {
    const next = applyRound(state, built.round);
    if (next.status === 'finished') winners = next.winnerIds;
  }
  return { totals, out, close, winners };
}
