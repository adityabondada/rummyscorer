import { DEFAULT_SETTINGS, type Round } from '@rummy/engine';
import { newRoundDoc, type GameDoc, type PlayerDoc, type RoundDoc } from '@rummy/data';
import { describe, expect, it } from 'vitest';
import {
  planEditRound,
  planNewRound,
  planRejoin,
  planRestore,
  planRollback,
  planScrapLatest,
  restorableRow,
  scrappableRow,
} from './edits';
import { gameState, storedIds, toStoredRound, type PlayerMap, type RoundRow } from './game';
import { describeError, pickablePlayers, playerNames, unclaimedGuests } from './names';
import { dayKey, nights, type GameRow } from './night';
import { buildRound, emptyForm, formFromRound, type RoundForm } from './roundEntry';

const person = (name: string, overrides: Partial<PlayerDoc> = {}): PlayerDoc => ({
  name,
  linkedUid: null,
  retired: false,
  mergedInto: null,
  createdBy: 'u1',
  createdAt: 1,
  ...overrides,
});

const players = (): PlayerMap => ({
  a: person('Asha', { linkedUid: 'ua' }),
  b: person('Bo'),
  c: person('Cy'),
});

const game = (overrides: Partial<GameDoc> = {}): GameDoc => ({
  settings: { ...DEFAULT_SETTINGS, limit: 50, maxRoundPenalty: null },
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
const row = (id: string, round: Round): RoundRow => ({ id, doc: newRoundDoc(round, 'ua', 1) });
const withScrap = (r: RoundRow): RoundRow => ({
  ...r,
  doc: { ...r.doc, scrapped: { by: 'ua', at: 2, reason: 'oops' } },
});

// Round 1 puts c on 20; round 2 puts c out on 55.
const rows = (): RoundRow[] => [
  row('r1', { seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(20) } }),
  row('r2', { seq: 2, winnerId: 'a', entries: { b: pts(5), c: pts(35) } }),
];

describe('game state', () => {
  it('replays the stored rounds', () => {
    const s = gameState(game(), rows(), players());
    expect(s.players.c).toMatchObject({ total: 55, active: false });
    expect(s.players.b!.total).toBe(15);
  });

  it('counts a merged guest as the member', () => {
    const p = { ...players(), g: person('Guest Bo', { mergedInto: 'b' }) };
    const g = game({ seatOrder: ['a', 'g', 'c'] });
    const rs = [row('r1', { seq: 1, winnerId: 'a', entries: { g: pts(10), c: pts(5) } })];
    const s = gameState(g, rs, p);
    expect(Object.keys(s.players).sort()).toEqual(['a', 'b', 'c']);
    expect(s.players.b!.total).toBe(10);
  });

  it('maps resolved ids back to the ids stored with the game', () => {
    const p = { ...players(), g: person('Guest Bo', { mergedInto: 'b' }) };
    const to = storedIds(game({ seatOrder: ['a', 'g', 'c'] }), p);
    expect(to('b')).toBe('g');
    expect(to('a')).toBe('a');
    expect(to('unknown')).toBe('unknown');

    const round = toStoredRound(
      { seq: 1, winnerId: 'b', entries: { a: pts(5) }, rejoins: [{ playerId: 'b', seatIndex: 0 }] },
      to,
    );
    expect(round).toMatchObject({
      winnerId: 'g',
      entries: { a: pts(5) },
      rejoins: [{ playerId: 'g' }],
    });
  });
});

describe('buildRound', () => {
  const state = () => gameState(game(), [], players());
  const form = (winnerId: string | null, entries: RoundForm['entries']): RoundForm => ({
    winnerId,
    entries,
  });

  it('needs a winner', () => {
    expect(buildRound(state(), emptyForm(), 1)).toMatchObject({
      ok: false,
      error: 'Pick who won the round',
    });
  });

  it('needs points or a drop for everyone else', () => {
    const r = buildRound(state(), form('a', { b: { kind: 'points', points: '10' } }), 1);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain('c');
  });

  it('rejects points that are not a whole number', () => {
    for (const text of ['', 'x', '-5', '1.5', ' ']) {
      const r = buildRound(
        state(),
        form('a', { b: { kind: 'points', points: text }, c: { kind: 'points', points: '5' } }),
        1,
      );
      expect(r.ok, text).toBe(false);
    }
  });

  it('builds a round from points and drops', () => {
    const r = buildRound(
      state(),
      form('a', { b: { kind: 'points', points: ' 25 ' }, c: { kind: 'middleDrop' } }),
      3,
    );
    expect(r).toEqual({
      ok: true,
      round: { seq: 3, winnerId: 'a', entries: { b: pts(25), c: { kind: 'middleDrop' } } },
    });
  });

  it('applies the engine rules, such as the drop limit', () => {
    const s = gameState(game({ settings: { ...game().settings, maxDrops: 0 } }), [], players());
    const r = buildRound(
      s,
      form('a', { b: { kind: 'drop' }, c: { kind: 'points', points: '5' } }),
      1,
    );
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain('no drops left');
  });

  it('applies the penalty cap', () => {
    const s = gameState(
      game({ settings: { ...game().settings, maxRoundPenalty: 80 } }),
      [],
      players(),
    );
    const r = buildRound(
      s,
      form('a', { b: { kind: 'points', points: '81' }, c: { kind: 'points', points: '5' } }),
      1,
    );
    expect(r.ok).toBe(false);
  });

  it('is pre-filled from an existing round for editing', () => {
    const f = formFromRound({
      seq: 1,
      winnerId: 'a',
      entries: { b: pts(10), c: { kind: 'drop' } },
    });
    expect(f).toEqual({
      winnerId: 'a',
      entries: { b: { kind: 'points', points: '10' }, c: { kind: 'drop' } },
    });
  });
});

describe('writing rounds', () => {
  const g = game();

  it('enters a new round with the next seq, as the caller', () => {
    const plan = planNewRound(
      g,
      rows().slice(0, 1),
      players(),
      { seq: 0, winnerId: 'a', entries: { b: pts(5), c: pts(5) } },
      'ub',
      50,
    );
    expect(plan).toMatchObject({ ok: true, value: { id: null } });
    if (!plan.ok) return;
    expect(plan.value.doc).toMatchObject({
      seq: 2,
      updatedBy: 'ub',
      updatedAt: 50,
      history: [],
      scrapped: null,
    });
  });

  it('numbers a new round after scrapped ones too', () => {
    const rs = [rows()[0]!, withScrap(rows()[1]!)];
    const plan = planNewRound(
      g,
      rs,
      players(),
      { seq: 0, winnerId: 'a', entries: { b: pts(5), c: pts(5) } },
      'ua',
      1,
    );
    expect(plan.ok && plan.value.doc.seq).toBe(3);
  });

  it('writes the ids the game was started with', () => {
    const p = { ...players(), x: person('Guest Bo', { mergedInto: 'b' }) };
    const gm = game({ seatOrder: ['a', 'x', 'c'] });
    const plan = planNewRound(
      gm,
      [],
      p,
      { seq: 0, winnerId: 'b', entries: { a: pts(5), c: pts(5) } },
      'ua',
      1,
    );
    expect(plan.ok && plan.value.doc.winnerId).toBe('x');
  });

  it('refuses a round the game would not accept', () => {
    const plan = planNewRound(
      g,
      rows(),
      players(),
      { seq: 0, winnerId: 'c', entries: { a: pts(1), b: pts(1) } },
      'ua',
      1,
    );
    expect(plan.ok).toBe(false);
  });

  it('edits a round, keeping the old values in history', () => {
    const target = rows()[0]!;
    const plan = planEditRound(
      g,
      rows(),
      players(),
      target,
      { seq: 1, winnerId: 'a', entries: { b: pts(12), c: pts(20) } },
      'ub',
      99,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.id).toBe('r1');
    expect(plan.value.doc.entries.b).toEqual(pts(12));
    expect(plan.value.doc.history).toHaveLength(1);
    expect(plan.value.doc.history[0]!.prev.entries.b).toEqual(pts(10));
    expect(plan.value.doc.updatedBy).toBe('ub');
  });

  it('refuses an edit that breaks the rounds after it', () => {
    // Putting c out in round 1 leaves round 2 with an entry for someone who is no longer playing.
    const plan = planEditRound(
      g,
      rows(),
      players(),
      rows()[0]!,
      { seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(60) } },
      'ua',
      1,
    );
    expect(plan).toMatchObject({ ok: false });
    expect(!plan.ok && plan.error).toContain("doesn't fit");
  });
});

describe('rejoin', () => {
  it('goes on the latest round, in the chosen seat, with history', () => {
    const plan = planRejoin(game(), rows(), players(), 'c', 1, 'ub', 70);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.id).toBe('r2');
    expect(plan.value.doc.rejoins).toEqual([{ playerId: 'c', seatIndex: 1 }]);
    expect(plan.value.doc.history).toHaveLength(1);
  });

  it('is refused for a player who is still in', () => {
    expect(planRejoin(game(), rows(), players(), 'b', 0, 'ua', 1).ok).toBe(false);
  });

  it('is refused when the cutoff has passed', () => {
    const g = game({ settings: { ...game().settings, rejoinCutoff: 10 } });
    const plan = planRejoin(g, rows(), players(), 'c', 0, 'ua', 1);
    expect(plan).toMatchObject({ ok: false });
  });

  it('is refused with no rounds', () => {
    expect(planRejoin(game(), [], players(), 'c', 0, 'ua', 1)).toMatchObject({
      ok: false,
      error: 'There is no round to rejoin after',
    });
  });

  it('uses the stored id for a merged guest', () => {
    const p = { ...players(), x: person('Guest Cy', { mergedInto: 'c' }) };
    const gm = game({ seatOrder: ['a', 'b', 'x'] });
    const rs = [row('r1', { seq: 1, winnerId: 'a', entries: { b: pts(10), x: pts(60) } })];
    const plan = planRejoin(gm, rs, p, 'c', 0, 'ua', 1);
    expect(plan.ok && plan.value.doc.rejoins[0]!.playerId).toBe('x');
  });
});

describe('scrap and restore', () => {
  it('finds the latest round to scrap and nothing to restore', () => {
    expect(scrappableRow(rows())?.id).toBe('r2');
    expect(restorableRow(rows())).toBeUndefined();
  });

  it('scraps the latest round with a reason and keeps history', () => {
    const plan = planScrapLatest(rows(), ' wrong score ', 'ub', 80);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value).toHaveLength(1);
    expect(plan.value[0]!.id).toBe('r2');
    expect(plan.value[0]!.doc.scrapped).toEqual({ by: 'ub', at: 80, reason: 'wrong score' });
    expect(plan.value[0]!.doc.history).toHaveLength(1);
  });

  it('needs a reason', () => {
    expect(planScrapLatest(rows(), '  ', 'ua', 1)).toMatchObject({ ok: false });
  });

  it('rolls back to a round in one step', () => {
    const three = [...rows(), row('r3', { seq: 3, winnerId: 'a', entries: { b: pts(1) } })];
    const plan = planRollback(three, 1, 'start again', 'ua', 5);
    expect(plan.ok && plan.value.map((w) => w.id)).toEqual(['r2', 'r3']);
    expect(planRollback(three, 3, 'x', 'ua', 5)).toMatchObject({ ok: false });
  });

  it('restores the earliest scrapped round first', () => {
    const rs = [
      rows()[0]!,
      withScrap(rows()[1]!),
      withScrap(row('r3', { seq: 3, winnerId: 'a', entries: { b: pts(1) } })),
    ];
    expect(restorableRow(rs)?.id).toBe('r2');
    const plan = planRestore(rs, 'ub', 9);
    expect(plan.ok && plan.value[0]!.id).toBe('r2');
    expect(plan.ok && plan.value[0]!.doc.scrapped).toBeNull();
    expect(planRestore(rows(), 'ua', 1)).toMatchObject({ ok: false });
  });

  it('cannot restore after a new round was entered', () => {
    const rs = [
      rows()[0]!,
      withScrap(rows()[1]!),
      row('r3', { seq: 3, winnerId: 'a', entries: { b: pts(1), c: pts(1) } }),
    ];
    expect(restorableRow(rs)).toBeUndefined();
  });
});

describe('nights', () => {
  const summary = (nets: Record<string, number>): GameDoc['summary'] => ({
    outcome: 'outright',
    winnerIds: ['a'],
    pot: 30,
    payouts: {},
    rounds: 2,
    players: Object.fromEntries(
      Object.entries(nets).map(([id, net]) => [
        id,
        { net, position: 1, roundsPlayed: 2, dropsTaken: 0, rejoins: 0, buyIns: 1 },
      ]),
    ),
    computedAt: 1,
  });
  const at = (y: number, m: number, d: number, h = 20) => new Date(y, m - 1, d, h).getTime();
  const gameRow = (
    id: string,
    createdAt: number,
    status: GameDoc['status'],
    nets?: Record<string, number>,
  ): GameRow => ({
    id,
    doc: game({ createdAt, status, summary: nets ? summary(nets) : null }),
  });

  it('groups games by the day they started, newest first', () => {
    const out = nights([
      gameRow('g1', at(2026, 9, 26), 'finished', { a: 20, b: -10, c: -10 }),
      gameRow('g2', at(2026, 10, 3, 19), 'finished', { a: -10, b: 20, c: -10 }),
      gameRow('g3', at(2026, 10, 3, 22), 'finished', { a: -10, b: 20, c: -10 }),
    ]);
    expect(out.map((n) => n.day)).toEqual(['2026-10-03', '2026-09-26']);
    expect(out[0]!.games.map((g) => g.id)).toEqual(['g2', 'g3']);
  });

  it("adds up each player's net and says who owes whom", () => {
    const [night] = nights([
      gameRow('g2', at(2026, 10, 3, 19), 'finished', { a: -10, b: 20, c: -10 }),
      gameRow('g3', at(2026, 10, 3, 22), 'finished', { a: 20, b: -10, c: -10 }),
    ]);
    expect(night!.nets).toEqual({ a: 10, b: 10, c: -20 });
    expect(night!.transfers).toEqual([
      { from: 'c', to: 'a', amount: 10 },
      { from: 'c', to: 'b', amount: 10 },
    ]);
  });

  it('leaves games still in progress out of the totals and counts them', () => {
    const [night] = nights([
      gameRow('g1', at(2026, 10, 3, 19), 'finished', { a: 10, b: -10 }),
      gameRow('g2', at(2026, 10, 3, 21), 'inProgress'),
    ]);
    expect(night!.nets).toEqual({ a: 10, b: -10 });
    expect(night!.inProgress).toBe(1);
  });

  it('has nothing for no games', () => {
    expect(nights([])).toEqual([]);
  });

  it('keys days by local date', () => {
    expect(dayKey(at(2026, 1, 5))).toBe('2026-01-05');
  });
});

describe('names', () => {
  const p: PlayerMap = {
    a: person('Asha', { linkedUid: 'ua' }),
    b: person('Bo'),
    g: person('Guest Asha', { mergedInto: 'a' }),
    r: person('Retired', { retired: true }),
  };

  it("shows a merged guest under the member's name", () => {
    expect(playerNames(p).g).toBe('Asha');
    expect(playerNames(p).b).toBe('Bo');
  });

  it('offers current, un-retired profiles for new games', () => {
    expect(pickablePlayers(p).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('lists guests nobody has claimed', () => {
    expect(unclaimedGuests(p).map((x) => x.id)).toEqual(['b']);
  });

  it('puts names into engine messages', () => {
    expect(describeError('Missing entry for b and a', { a: 'Asha', b: 'Bo' })).toBe(
      'Missing entry for Bo and Asha',
    );
  });
});

describe('types', () => {
  it('RoundDoc rows keep ids', () => {
    const doc: RoundDoc = rows()[0]!.doc;
    expect(doc.seq).toBe(1);
  });
});
