import { DEFAULT_SETTINGS, replay, type Round } from '@rummy/engine';
import { describe, expect, it } from 'vitest';
import {
  changeRoundDoc,
  DataError,
  gameInput,
  gamePath,
  makeResolveId,
  newRoundDoc,
  parseGame,
  parseLeague,
  parsePlayer,
  parseRound,
  roundDocToEngine,
  roundPath,
  summaryFromState,
  type GameDoc,
  type RoundDoc,
} from './index';

const game = (overrides: Partial<GameDoc> = {}): GameDoc => ({
  settings: { ...DEFAULT_SETTINGS, limit: 50, maxRoundPenalty: null },
  seatOrder: ['A', 'B', 'C'],
  status: 'inProgress',
  createdBy: 'u1',
  createdAt: 1000,
  split: null,
  summary: null,
  summaryError: null,
  ...overrides,
});

const round = (seq: number, winnerId: string, entries: Round['entries']): Round => ({
  seq,
  winnerId,
  entries,
});
const penaltyRound = (
  seq: number,
  playerId: string,
  points: number,
  entries: Round['entries'] = {},
): Round => ({
  seq,
  winnerId: null,
  penalty: { playerId, points, reason: 'wrongShow' },
  entries,
});
const pts = (points: number) => ({ kind: 'points' as const, points });

describe('parsing stored documents', () => {
  it('reads a league', () => {
    const league = {
      name: 'Fri',
      adminUid: 'u1',
      inviteCode: 'ABC123',
      memberUids: ['u1'],
      createdAt: 5,
    };
    expect(parseLeague(league)).toEqual(league);
  });

  it('reads a guest and a linked player', () => {
    const guest = {
      name: 'Ravi',
      linkedUid: null,
      retired: false,
      mergedInto: null,
      createdBy: 'u1',
      createdAt: 1,
    };
    expect(parsePlayer(guest)).toEqual(guest);
    expect(parsePlayer({ ...guest, linkedUid: 'u2', mergedInto: 'p9' })).toMatchObject({
      linkedUid: 'u2',
      mergedInto: 'p9',
    });
  });

  it('reads a game and its settings', () => {
    expect(parseGame(game())).toEqual(game());
    const grant = game({
      settings: { ...game().settings, dropsOnRejoin: { mode: 'grant', count: 1 } },
    });
    expect(parseGame(grant).settings.dropsOnRejoin).toEqual({ mode: 'grant', count: 1 });
  });

  it('reads a game with a split and a summary', () => {
    const finished = game({
      status: 'finished',
      split: { afterSeq: 3, shares: { A: 12, B: 18 } },
      summary: {
        outcome: 'split',
        winnerIds: ['A', 'B'],
        pot: 30,
        payouts: { A: 12, B: 18 },
        rounds: 3,
        players: {
          A: { net: 2, position: 1, roundsPlayed: 3, dropsTaken: 0, rejoins: 0, buyIns: 1 },
        },
        computedAt: 9,
      },
    });
    expect(parseGame(finished)).toEqual(finished);
  });

  it('treats missing optional values as null', () => {
    const { split: _split, summary: _summary, summaryError: _error, ...rest } = game();
    expect(parseGame(rest)).toMatchObject({ split: null, summary: null, summaryError: null });
  });

  it('rejects the wrong shapes', () => {
    expect(() => parseLeague({ name: 'x' })).toThrow(DataError);
    expect(() => parseLeague('nope')).toThrow('must be an object');
    expect(() => parsePlayer({ name: 'x', retired: 'no' })).toThrow(DataError);
    expect(() => parseGame(game({ status: 'paused' as never }))).toThrow('unknown status');
    expect(() => parseGame(game({ seatOrder: [1] as never }))).toThrow('seatOrder');
  });

  it('rejects settings the engine would not accept', () => {
    const bad = game({ settings: { ...game().settings, limit: 0 } });
    expect(() => parseGame(bad)).toThrow('limit');
  });

  it('reads a round, with and without optional parts', () => {
    const doc: RoundDoc = {
      seq: 2,
      winnerId: 'A',
      penalty: null,
      entries: { B: { kind: 'drop' }, C: { kind: 'middleDrop' }, D: pts(30) },
      rejoins: [{ playerId: 'C', seatIndex: 1 }],
      scrapped: { by: 'u1', at: 5, reason: 'typo' },
      updatedBy: 'u1',
      updatedAt: 6,
      history: [],
    };
    expect(parseRound(doc)).toEqual(doc);
    const { rejoins: _r, history: _h, ...minimal } = { ...doc, scrapped: null };
    expect(parseRound(minimal)).toMatchObject({ rejoins: [], history: [], scrapped: null });
  });

  it('reads a penalty round, which has no winner', () => {
    const doc: RoundDoc = {
      seq: 3,
      winnerId: null,
      penalty: { playerId: 'B', points: 80, reason: 'wrongShow' },
      entries: { A: pts(0), C: { kind: 'drop' } },
      rejoins: [],
      scrapped: null,
      updatedBy: 'u1',
      updatedAt: 6,
      history: [],
    };
    expect(parseRound(doc)).toEqual(doc);
  });

  it('reads rounds saved before penalties existed as ordinary rounds', () => {
    const doc = newRoundDoc(round(1, 'A', { B: pts(5) }), 'u1', 1);
    const { penalty: _p, ...old } = doc;
    expect(parseRound(old)).toMatchObject({ winnerId: 'A', penalty: null });
  });

  it('rejects a penalty with an unknown reason or no player', () => {
    const doc = newRoundDoc(penaltyRound(1, 'B', 80), 'u1', 1);
    expect(() => parseRound({ ...doc, penalty: { ...doc.penalty, reason: 'cheating' } })).toThrow(
      'known reason',
    );
    expect(() => parseRound({ ...doc, penalty: { points: 80, reason: 'error' } })).toThrow(
      'penalty.playerId',
    );
  });

  it('rejects an ordinary round with no winner', () => {
    const doc = newRoundDoc(round(1, 'A', { B: pts(5) }), 'u1', 1);
    expect(() => parseRound({ ...doc, winnerId: null })).toThrow('winnerId');
  });

  it('rejects an unknown entry type', () => {
    const doc = newRoundDoc(round(1, 'A', { B: pts(5) }), 'u1', 1);
    const bad = { ...doc, entries: { B: { kind: 'fold' } } };
    expect(() => parseRound(bad)).toThrow('known entry type');
  });
});

describe('round documents', () => {
  const first = newRoundDoc(round(1, 'A', { B: pts(10), C: pts(20) }), 'u1', 100);

  it('start with no history and nothing scrapped', () => {
    expect(first).toMatchObject({ rejoins: [], scrapped: null, history: [], updatedBy: 'u1' });
  });

  it('keep the previous values in history on every change', () => {
    const edited = changeRoundDoc(first, { entries: { B: pts(15), C: pts(20) } }, 'u2', 200);
    expect(edited.entries.B).toEqual(pts(15));
    expect(edited).toMatchObject({ updatedBy: 'u2', updatedAt: 200 });
    expect(edited.history).toHaveLength(1);
    expect(edited.history[0]).toMatchObject({ by: 'u2', at: 200 });
    expect(edited.history[0]!.prev.entries.B).toEqual(pts(10));

    const scrapped = changeRoundDoc(
      edited,
      { scrapped: { by: 'u3', at: 300, reason: 'wrong round' } },
      'u3',
      300,
    );
    expect(scrapped.history).toHaveLength(2);
    expect(scrapped.history[0]).toEqual(edited.history[0]);
    expect(scrapped.history[1]!.prev.scrapped).toBeNull();
    expect(scrapped.history[1]!.prev.entries.B).toEqual(pts(15));
  });

  it('do not change the document they came from', () => {
    const before = structuredClone(first);
    changeRoundDoc(first, { winnerId: 'B' }, 'u2', 200);
    expect(first).toEqual(before);
  });

  it('give the engine the same round, scrapped or not', () => {
    const scrap = { by: 'u1', at: 1, reason: 'oops' };
    const doc = changeRoundDoc(first, { scrapped: scrap }, 'u1', 5);
    expect(roundDocToEngine(doc)).toMatchObject({ seq: 1, winnerId: 'A', scrapped: scrap });
    expect(roundDocToEngine(first).scrapped).toBeNull();
  });
});

describe('penalty round documents', () => {
  const doc = newRoundDoc(penaltyRound(2, 'B', 80), 'u1', 100);

  it('are stored with no winner and the penalty', () => {
    expect(doc).toMatchObject({
      winnerId: null,
      penalty: { playerId: 'B', points: 80, reason: 'wrongShow' },
    });
  });

  it('keep the penalty in history when it is changed, and when the round is scrapped', () => {
    const edited = changeRoundDoc(
      doc,
      { penalty: { playerId: 'B', points: 40, reason: 'error' } },
      'u2',
      200,
    );
    expect(edited.penalty).toEqual({ playerId: 'B', points: 40, reason: 'error' });
    expect(edited.history[0]!.prev.penalty).toEqual({
      playerId: 'B',
      points: 80,
      reason: 'wrongShow',
    });
    const scrapped = changeRoundDoc(
      edited,
      { scrapped: { by: 'u', at: 1, reason: 'x' } },
      'u',
      300,
    );
    expect(scrapped.penalty).toEqual(edited.penalty);
    expect(scrapped.history[1]!.prev.penalty).toEqual(edited.penalty);
  });

  it('give the engine the same penalty round', () => {
    expect(roundDocToEngine(doc)).toMatchObject({
      winnerId: null,
      penalty: { playerId: 'B', points: 80, reason: 'wrongShow' },
    });
  });

  it('replay: the player with the penalty gets the count and the others 0', () => {
    const state = replay(
      gameInput(game(), [
        newRoundDoc(penaltyRound(1, 'B', 80, { A: pts(0), C: { kind: 'drop' } }), 'u1', 1),
      ]),
    );
    expect(state.players.B!.total).toBe(80);
    expect(state.players.A!.total).toBe(0);
    expect(state.players.C!.total).toBe(20);
  });
});

describe('replaying stored games', () => {
  const rounds = [
    newRoundDoc(round(1, 'A', { B: pts(10), C: pts(51) }), 'u1', 1),
    newRoundDoc(round(2, 'A', { B: pts(45) }), 'u1', 2),
  ];

  it('builds the engine input from documents', () => {
    const state = replay(gameInput(game(), rounds));
    expect(state.status).toBe('finished');
    expect(state.winnerIds).toEqual(['A']);
  });

  it('uses the split stored on the game', () => {
    const open = [rounds[0]!];
    const input = gameInput(game({ split: { afterSeq: 1, shares: { A: 10, B: 20 } } }), open);
    expect(replay(input)).toMatchObject({ status: 'finished', outcome: 'split' });
  });

  it('builds the summary with merged ids and per-player stats', () => {
    const resolveId = (id: string) => (id === 'B' ? 'member' : id);
    const state = replay(gameInput(game(), rounds), { resolveId });
    const summary = summaryFromState(state, 42)!;
    expect(summary).toMatchObject({
      outcome: 'outright',
      winnerIds: ['A'],
      pot: 30,
      rounds: 2,
      computedAt: 42,
    });
    expect(Object.keys(summary.players).sort()).toEqual(['A', 'C', 'member']);
    expect(summary.players.A).toMatchObject({ net: 20, position: 1, roundsPlayed: 2 });
    expect(summary.players.member).toMatchObject({ net: -10, position: 2, roundsPlayed: 2 });
    expect(summary.players.C).toMatchObject({ net: -10, position: 3, roundsPlayed: 1 });
  });

  it('counts rounds won and penalties for each player, under the merged id', () => {
    const resolveId = (id: string) => (id === 'B' ? 'member' : id);
    const withPenalty = [
      newRoundDoc(round(1, 'A', { B: pts(10), C: pts(20) }), 'u1', 1),
      newRoundDoc(penaltyRound(2, 'B', 40, { A: pts(0), C: pts(0) }), 'u1', 2),
      newRoundDoc(round(3, 'A', { B: pts(45), C: pts(40) }), 'u1', 3),
    ];
    const state = replay(
      gameInput(
        game({ settings: { ...DEFAULT_SETTINGS, limit: 50, maxRoundPenalty: null } }),
        withPenalty,
      ),
      { resolveId },
    );
    const summary = summaryFromState(state, 1)!;
    expect(summary.players.A).toMatchObject({ roundsWon: 2, penalties: 0 });
    expect(summary.players.member).toMatchObject({ roundsWon: 0, penalties: 1 });
    expect(summary.players.C).toMatchObject({ roundsWon: 0, penalties: 0 });
  });

  it('reads summaries saved before rounds won were counted, leaving them unset', () => {
    const old = { net: 2, position: 1, roundsPlayed: 3, dropsTaken: 0, rejoins: 0, buyIns: 1 };
    const finished = game({
      status: 'finished',
      summary: {
        outcome: 'outright',
        winnerIds: ['A'],
        pot: 30,
        payouts: { A: 30 },
        rounds: 3,
        players: { A: old },
        computedAt: 1,
      },
    });
    const parsed = parseGame(finished);
    expect(parsed.summary!.players.A).toEqual(old);
    expect(parsed.summary!.players.A!.roundsWon).toBeUndefined();
  });

  it('rejects a rounds won that is not a number', () => {
    const state = replay(gameInput(game(), rounds));
    const stored = JSON.parse(
      JSON.stringify(game({ status: 'finished', summary: summaryFromState(state, 1) })),
    );
    stored.summary.players.A.roundsWon = 'two';
    expect(() => parseGame(stored)).toThrow('roundsWon');
  });

  it('has no summary until the game is finished', () => {
    expect(summaryFromState(replay(gameInput(game(), [rounds[0]!])), 1)).toBeNull();
  });

  it('survives being parsed back from what would be stored', () => {
    const state = replay(gameInput(game(), rounds));
    const stored = game({ status: 'finished', summary: summaryFromState(state, 7) });
    expect(parseGame(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });
});

describe('makeResolveId', () => {
  it('leaves unmerged players alone, including unknown ones', () => {
    const resolve = makeResolveId({ a: { mergedInto: null } });
    expect(resolve('a')).toBe('a');
    expect(resolve('missing')).toBe('missing');
  });

  it('follows a merge, and a chain of merges, to the end', () => {
    const resolve = makeResolveId({
      guest: { mergedInto: 'older' },
      older: { mergedInto: 'member' },
      member: { mergedInto: null },
    });
    expect(resolve('guest')).toBe('member');
    expect(resolve('older')).toBe('member');
    expect(resolve('member')).toBe('member');
  });

  it('stops instead of looping on a cycle', () => {
    const resolve = makeResolveId({ a: { mergedInto: 'b' }, b: { mergedInto: 'a' } });
    expect(['a', 'b']).toContain(resolve('a'));
  });
});

describe('paths', () => {
  it('nest everything under the league', () => {
    expect(gamePath('L', 'G')).toBe('leagues/L/games/G');
    expect(roundPath('L', 'G', 'R')).toBe('leagues/L/games/G/rounds/R');
  });
});
