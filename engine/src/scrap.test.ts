import { describe, expect, it } from 'vitest';
import { initialState, replay } from './replay';
import {
  latestScrappable,
  liveRounds,
  nextRestorable,
  nextSeq,
  restoreNext,
  rollbackTo,
  scrapLatest,
  seqsAfter,
} from './scrap';
import { summarize } from './settlement';
import { drop, round, settings } from './testing';
import type { Round } from './types';

const small = { limit: 50, maxRoundPenalty: null, buyIn: 10 };
const meta = { by: 'u1', at: 1000, reason: 'wrong score' };
const play = (rounds: Round[], split?: Parameters<typeof replay>[0]['split']) =>
  replay({ settings: settings(small), seatOrder: ['A', 'B', 'C'], rounds, split });

// Round 3 knocks C out and round 4 ends the game.
const rounds = (): Round[] => [
  round(1, 'A', { B: 10, C: drop }),
  round(2, 'B', { A: 5, C: 15 }),
  round(3, 'A', { B: 5, C: 30 }),
  round(4, 'A', { B: 50 }),
];

describe('scrapLatest', () => {
  it('marks the latest round with who, when and why', () => {
    const scrapped = scrapLatest(rounds(), meta);
    expect(scrapped[3]!.scrapped).toEqual(meta);
    expect(scrapped.slice(0, 3).every((r) => !r.scrapped)).toBe(true);
  });

  it('then lets the previous round be scrapped', () => {
    const twice = scrapLatest(scrapLatest(rounds(), meta), { ...meta, reason: 'again' });
    expect(twice[2]!.scrapped?.reason).toBe('again');
    expect(latestScrappable(twice)?.seq).toBe(2);
  });

  it('needs a reason', () => {
    expect(() => scrapLatest(rounds(), { ...meta, reason: '  ' })).toThrow('reason');
  });

  it('has nothing to scrap in an empty game', () => {
    expect(() => scrapLatest([], meta)).toThrow('no round to scrap');
  });

  it('does not change the original rounds', () => {
    const original = rounds();
    scrapLatest(original, meta);
    expect(original.every((r) => !r.scrapped)).toBe(true);
  });
});

describe('replaying after a scrap', () => {
  it('rolls back totals, drops, eliminations and the dealer', () => {
    const before = play(rounds().slice(0, 2));
    const after = play(scrapLatest(scrapLatest(rounds(), meta), meta));
    expect(after).toEqual(before);
    expect(after.players.C).toMatchObject({ total: 35, active: true, dropsLeft: 1 });
    expect(after.rounds.map((r) => r.dealerId)).toEqual(['A', 'B']);
    expect(after.dealerId).toBe('C');
  });

  it('reopens a game that the scrapped round ended', () => {
    expect(play(rounds()).status).toBe('finished');
    const reopened = play(scrapLatest(rounds(), meta));
    expect(reopened.status).toBe('inProgress');
    expect(reopened.winnerIds).toEqual([]);
    expect(summarize(reopened)).toBeNull();
  });

  it('reverses a rejoin and its buy-in', () => {
    const withRejoin = [
      round(1, 'A', { B: 10, C: 51 }, [{ playerId: 'C', seatIndex: 2 }]),
      round(2, 'A', { B: 5, C: 5 }),
    ];
    expect(play(withRejoin).pot).toBe(40);
    // Scrapping only round 2 keeps round 1's rejoin.
    expect(play(scrapLatest(withRejoin, meta)).pot).toBe(40);
    const back = play(rollbackTo(withRejoin, 0, meta));
    expect(back.pot).toBe(30);
    expect(back.players.C).toMatchObject({ total: 0, rejoins: 0, buyIns: 1 });
  });

  it('puts a rejoin back to being possible when the round is scrapped and re-entered', () => {
    const first = [round(1, 'A', { B: 10, C: 51 }, [{ playerId: 'C', seatIndex: 0 }])];
    const scrapped = scrapLatest(first, meta);
    const redo = [...scrapped, round(nextSeq(scrapped), 'A', { B: 10, C: 20 })];
    expect(play(redo).players.C).toMatchObject({ total: 20, active: true, buyIns: 1 });
  });

  it('reverses the settlement of a split by ignoring it', () => {
    const base = [round(1, 'A', { B: 51, C: 10 })];
    const split = { afterSeq: 1, shares: { A: 12, C: 18 } };
    expect(play(base, split).status).toBe('finished');
    const scrapped = scrapLatest(base, meta);
    const s = play(scrapped, split);
    expect(s.status).toBe('inProgress');
    expect(s.splitIgnored).toBe(true);
  });
});

describe('rollbackTo', () => {
  it('scraps every round after N in one step with one reason', () => {
    const out = rollbackTo(rounds(), 2, meta);
    expect(out.map((r) => !!r.scrapped)).toEqual([false, false, true, true]);
    expect(out[2]!.scrapped).toEqual(meta);
    expect(out[3]!.scrapped).toEqual(meta);
  });

  it('can roll back to before the first round', () => {
    expect(liveRounds(rollbackTo(rounds(), 0, meta))).toHaveLength(0);
    expect(play(rollbackTo(rounds(), 0, meta))).toEqual(
      initialState(settings(small), ['A', 'B', 'C']),
    );
  });

  it('lists the rounds it would scrap, latest first', () => {
    expect(seqsAfter(rounds(), 1)).toEqual([4, 3, 2]);
  });

  it('only rolls back to a live round, and only if there is something to scrap', () => {
    const scrapped = scrapLatest(rounds(), meta);
    expect(() => rollbackTo(scrapped, 4, meta)).toThrow('not a live round');
    expect(() => rollbackTo(rounds(), 4, meta)).toThrow('nothing to roll back');
    expect(() => rollbackTo(rounds(), 2, { ...meta, reason: '' })).toThrow('reason');
  });
});

describe('restore', () => {
  it('restores in reverse order of scrapping, earliest scrapped round first', () => {
    const scrapped = rollbackTo(rounds(), 2, meta);
    expect(nextRestorable(scrapped)?.seq).toBe(3);
    const once = restoreNext(scrapped);
    expect(once[2]!.scrapped).toBeNull();
    expect(nextRestorable(once)?.seq).toBe(4);
    const twice = restoreNext(once);
    expect(play(twice)).toEqual(play(rounds()));
  });

  it('brings back a game-ending round and its result', () => {
    const restored = restoreNext(scrapLatest(rounds(), meta));
    expect(play(restored).status).toBe('finished');
  });

  it('is no longer possible after a new round is added', () => {
    const scrapped = scrapLatest(rounds(), meta);
    const next = [...scrapped, round(nextSeq(scrapped), 'A', { B: 1, C: 1 })];
    expect(nextRestorable(next)).toBeUndefined();
    expect(() => restoreNext(next)).toThrow('no round that can be restored');
  });

  it('has nothing to restore when nothing is scrapped', () => {
    expect(nextRestorable(rounds())).toBeUndefined();
  });
});

describe('seq handling', () => {
  it('gives a new round the seq after the highest, scrapped or not', () => {
    expect(nextSeq([])).toBe(1);
    expect(nextSeq(rounds())).toBe(5);
    expect(nextSeq(scrapLatest(rounds(), meta))).toBe(5);
  });

  it('keeps scrapped rounds in the list so they stay visible', () => {
    expect(scrapLatest(rounds(), meta)).toHaveLength(4);
  });
});
