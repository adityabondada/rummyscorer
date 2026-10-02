import { DEFAULT_SETTINGS, type Round } from '@rummy/engine';
import { newRoundDoc, type GameDoc, type PlayerDoc } from '@rummy/data';
import { describe, expect, it } from 'vitest';
import { planEditRound, planNewRound } from './edits';
import {
  gameState,
  storedIds,
  toResolvedRound,
  toStoredRound,
  type PlayerMap,
  type RoundRow,
} from './game';
import { buildRound, emptyForm, formFromRound, reasonLabel, type RoundForm } from './roundEntry';

const person = (name: string, overrides: Partial<PlayerDoc> = {}): PlayerDoc => ({
  name,
  linkedUid: null,
  retired: false,
  mergedInto: null,
  createdBy: 'u1',
  createdAt: 1,
  ...overrides,
});
const players = (): PlayerMap => ({ a: person('Asha'), b: person('Bo'), c: person('Cy') });
const game = (overrides: Partial<GameDoc> = {}): GameDoc => ({
  settings: { ...DEFAULT_SETTINGS },
  seatOrder: ['a', 'b', 'c'],
  status: 'inProgress',
  createdBy: 'ua',
  createdAt: 1000,
  split: null,
  summary: null,
  summaryError: null,
  ...overrides,
});
const pts = (points: number) => ({ kind: 'points' as const, points });
const state = () => gameState(game(), [], players());

const penaltyForm = (
  over: Partial<RoundForm['penalty']> = {},
  drops: RoundForm['drops'] = {},
): RoundForm => ({
  ...emptyForm(80),
  mode: 'penalty',
  penalty: { playerId: 'b', points: '80', reason: 'wrongShow', ...over },
  drops,
});

describe('the penalty form', () => {
  it('starts at the most the game allows', () => {
    expect(emptyForm(80).penalty).toEqual({ playerId: null, points: '80', reason: 'wrongShow' });
    expect(emptyForm(null).penalty.points).toBe('');
    expect(emptyForm().mode).toBe('win');
  });

  it('builds a penalty round: the culprit takes it and everyone else scores 0', () => {
    const built = buildRound(state(), penaltyForm(), 1);
    expect(built).toEqual({
      ok: true,
      round: {
        seq: 1,
        winnerId: null,
        penalty: { playerId: 'b', points: 80, reason: 'wrongShow' },
        entries: { a: pts(0), c: pts(0) },
      },
    });
  });

  it('keeps the drops of players who dropped', () => {
    const drops: RoundForm['drops'] = { a: { kind: 'drop' }, c: { kind: 'middleDrop' } };
    const built = buildRound(state(), penaltyForm({}, drops), 1);
    expect(built.ok && built.round.entries).toEqual({
      a: { kind: 'drop' },
      c: { kind: 'middleDrop' },
    });
  });

  it('can be a smaller penalty for another reason', () => {
    const built = buildRound(state(), penaltyForm({ points: '40', reason: 'error' }), 1);
    expect(built.ok && built.round.penalty).toEqual({
      playerId: 'b',
      points: 40,
      reason: 'error',
    });
  });

  it('needs the player who made the mistake', () => {
    expect(buildRound(state(), penaltyForm({ playerId: null }), 1)).toMatchObject({
      ok: false,
      error: expect.stringContaining('who made the mistake'),
    });
  });

  it('needs whole penalty points above 0', () => {
    for (const points of ['', '  ', '0', '-5', '12.5', 'abc']) {
      expect(buildRound(state(), penaltyForm({ points }), 1), points).toMatchObject({
        ok: false,
        error: 'Enter the penalty points',
      });
    }
  });

  it('is checked by the engine, so more than the cap is refused', () => {
    expect(buildRound(state(), penaltyForm({ points: '81' }), 1)).toMatchObject({
      ok: false,
      error: expect.stringContaining('80 cap'),
    });
  });

  it('ignores what was typed in the other mode', () => {
    const form: RoundForm = {
      ...penaltyForm(),
      winnerId: 'a',
      entries: { b: { kind: 'points', points: '30' } },
    };
    const built = buildRound(state(), form, 1);
    expect(built.ok && built.round.winnerId).toBeNull();
    expect(built.ok && built.round.entries.a).toEqual(pts(0));
  });

  it('is pre-filled from a penalty round for editing, with the drops', () => {
    const round: Round = {
      seq: 1,
      winnerId: null,
      penalty: { playerId: 'b', points: 40, reason: 'error' },
      entries: { a: { kind: 'drop' }, c: pts(0) },
    };
    const form = formFromRound(round, 80);
    expect(form).toMatchObject({
      mode: 'penalty',
      penalty: { playerId: 'b', points: '40', reason: 'error' },
      drops: { a: { kind: 'drop' } },
    });
    expect(Object.keys(form.drops)).toEqual(['a']);
  });

  it('names the reasons', () => {
    expect(reasonLabel('wrongShow')).toBe('Wrong show');
    expect(reasonLabel('error')).toBe('Other error');
  });
});

describe('penalty rounds and stored ids', () => {
  const p = { ...players(), g: person('Guest Bo', { mergedInto: 'b' }) };
  const g = game({ seatOrder: ['a', 'g', 'c'] });

  it('are written with the ids the game was started with, and read back resolved', () => {
    const to = storedIds(g, p);
    const round: Round = {
      seq: 1,
      winnerId: null,
      penalty: { playerId: 'b', points: 80, reason: 'wrongShow' },
      entries: { a: pts(0), c: pts(0) },
    };
    const stored = toStoredRound(round, to);
    expect(stored.winnerId).toBeNull();
    expect(stored.penalty!.playerId).toBe('g');
    expect(toResolvedRound(stored, p).penalty!.playerId).toBe('b');
  });

  it('leave an ordinary round with no penalty', () => {
    const stored = toStoredRound(
      { seq: 1, winnerId: 'b', entries: { a: pts(5) } },
      storedIds(g, p),
    );
    expect(stored.winnerId).toBe('g');
    expect(stored.penalty).toBeNull();
  });
});

describe('saving penalty rounds', () => {
  const round: Round = {
    seq: 0,
    winnerId: null,
    penalty: { playerId: 'b', points: 80, reason: 'wrongShow' },
    entries: { a: pts(0), c: pts(0) },
  };

  it('writes a round with no winner and the penalty', () => {
    const plan = planNewRound(game(), [], players(), round, 'ua', 5);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.doc).toMatchObject({
      seq: 1,
      winnerId: null,
      penalty: { playerId: 'b', points: 80, reason: 'wrongShow' },
    });
  });

  it('changes an ordinary round into a penalty round, keeping the old round in history', () => {
    const target: RoundRow = {
      id: 'r1',
      doc: newRoundDoc({ seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(20) } }, 'ua', 1),
    };
    const plan = planEditRound(game(), [target], players(), target, { ...round, seq: 1 }, 'ub', 9);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.doc).toMatchObject({
      winnerId: null,
      penalty: { playerId: 'b', points: 80 },
    });
    expect(plan.value.doc.history[0]!.prev).toMatchObject({ winnerId: 'a', penalty: null });
  });

  it('refuses a penalty round the game would not accept', () => {
    const plan = planNewRound(
      game(),
      [],
      players(),
      { ...round, penalty: { ...round.penalty!, points: 200 } },
      'ua',
      5,
    );
    expect(plan.ok).toBe(false);
  });
});
