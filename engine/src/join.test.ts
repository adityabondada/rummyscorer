import { describe, expect, it } from 'vitest';
import { displayOrder, joinEligibility, replay } from './replay';
import { drop, round, settings } from './testing';
import type { Rejoin, Round } from './types';

/** Line-up A, B, C, D: A has the first card, D deals round 1. */
const seats = ['D', 'A', 'B', 'C'];
const config = settings({ limit: 101, maxRoundPenalty: null, buyIn: 10, maxDrops: 2 });
const play = (rounds: Round[], over = {}) =>
  replay({ settings: { ...config, ...over }, seatOrder: seats, rounds });

const joinE: Rejoin = { playerId: 'E', seatIndex: -1, join: { drops: 1 } };
const joinF: Rejoin = { playerId: 'F', seatIndex: -1, join: { drops: 2 } };
const first = (rejoins?: Rejoin[]) => round(1, 'A', { B: 10, C: 20, D: 30 }, rejoins);

describe('someone joining the game late', () => {
  it('comes in one point above the highest score, and pays into the pot', () => {
    const state = play([first([joinE])]);
    expect(state.players.E).toMatchObject({
      total: 31,
      active: true,
      buyIns: 1,
      rejoins: 0,
      roundsPlayed: 0,
    });
    expect(state.pot).toBe(50);
    expect(state.rounds[0]!.joined).toEqual(['E']);
    expect(state.rounds[0]!.rejoined).toEqual([]);
    expect(state.rounds[0]!.totals.E).toBe(31);
  });

  it('starts with the number of drops chosen when they join', () => {
    const state = play([first([joinE, { ...joinF, join: { drops: 0 } }])]);
    expect(state.players.E).toMatchObject({ dropsLeft: 1, dropsUsed: 1 });
    expect(state.players.F).toMatchObject({ dropsLeft: 0, dropsUsed: 2 });
  });

  it('changes neither who deals next nor who gets the opening card', () => {
    const without = play([first()]);
    const withJoin = play([first([joinE])]);
    expect(withJoin.dealerId).toBe(without.dealerId);
    expect(withJoin.firstPlayerId).toBe(without.firstPlayerId);
    expect(withJoin.dealerId).toBe('A');
    expect(withJoin.firstPlayerId).toBe('B');
  });

  it('sits just before the dealer, so they are the last in the list the deal goes round', () => {
    const state = play([first([joinE])]);
    expect(state.seatOrder).toEqual(['D', 'E', 'A', 'B', 'C']);
    // As people read the line-up: first card at the top, the new player at the bottom.
    expect(displayOrder(state)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('takes part in the next round and gets a turn to deal after everyone else', () => {
    const state = play([
      first([joinE]),
      round(2, 'A', { B: 5, C: 5, D: 5, E: 5 }),
      round(3, 'A', { B: 5, C: 5, D: 5, E: 5 }),
      round(4, 'A', { B: 5, C: 5, D: 5, E: 5 }),
      round(5, 'A', { B: 5, C: 5, D: 5, E: 5 }),
      round(6, 'A', { B: 5, C: 5, D: 5, E: 5 }),
    ]);
    expect(state.rounds.map((r) => r.dealerId)).toEqual(['D', 'A', 'B', 'C', 'D', 'E']);
    expect(state.players.E!.roundsPlayed).toBe(5);
    expect(state.dealerId).toBe('A');
  });

  it('can use their drops like anyone else, and no more than they were given', () => {
    const rounds = [
      first([joinE]),
      round(2, 'A', { B: 5, C: 5, D: 5, E: drop }),
      round(3, 'A', { B: 5, C: 5, D: 5, E: drop }),
    ];
    expect(() => play(rounds)).toThrow(/no drops left/);
    expect(play(rounds.slice(0, 2)).players.E!.dropsLeft).toBe(0);
  });

  it('works for several people in one break: the same score, in the order given, last one right before the dealer', () => {
    const state = play([first([joinE, joinF])]);
    expect(state.players.E!.total).toBe(31);
    expect(state.players.F!.total).toBe(31);
    expect(state.pot).toBe(60);
    expect(state.seatOrder).toEqual(['D', 'E', 'F', 'A', 'B', 'C']);
    expect(state.dealerId).toBe('A');
    expect(state.firstPlayerId).toBe('B');
    expect(state.rounds[0]!.joined).toEqual(['E', 'F']);
  });

  it('can happen in the same break as a rejoin, without moving the dealer or the opening card', () => {
    const state = play(
      [round(1, 'A', { B: 10, C: 20, D: 120 }, [{ playerId: 'D', seatIndex: 3 }, joinE])],
      { limit: 101 },
    );
    expect(state.players.D!.active).toBe(true);
    expect(state.players.E!.active).toBe(true);
    expect(state.players.D!.total).toBe(state.players.E!.total);
    expect(state.dealerId).toBe('A');
    expect(state.firstPlayerId).toBe('B');
  });

  it('can join after a later round too, at whatever the highest score is by then', () => {
    const state = play([first(), round(2, 'A', { B: 5, C: 5, D: 40 }, [joinE])]);
    expect(state.players.E!.total).toBe(71);
    expect(state.dealerId).toBe('B');
    expect(state.firstPlayerId).toBe('C');
    expect(state.seatOrder.indexOf('E')).toBe(state.seatOrder.indexOf('B') - 1);
  });

  it('is undone when the round is scrapped', () => {
    const scrapped: Round = {
      ...first([joinE]),
      scrapped: { by: 'u', at: 1, reason: 'oops' },
    };
    const state = play([scrapped]);
    expect(state.players.E).toBeUndefined();
    expect(state.pot).toBe(40);
    expect(state.seatOrder).toEqual(seats);
  });

  it('is refused for someone who is already in the game, or listed twice', () => {
    expect(() => play([first([{ playerId: 'B', seatIndex: -1, join: { drops: 1 } }])])).toThrow(
      /already in the game/,
    );
    expect(() => play([first([joinE, joinE])])).toThrow(/already in the game/);
  });

  it.each([-1, 3, 1.5])('is refused with %s drops, when the game allows 0 to 2', (drops) => {
    expect(() => play([first([{ playerId: 'E', seatIndex: -1, join: { drops } }])])).toThrow(
      /Drops for E must be from 0 to 2/,
    );
  });

  it('is allowed right up to the limit, and refused past it', () => {
    const edge = play([round(1, 'A', { B: 100, C: 10, D: 10 }, [joinE])]);
    expect(edge.players.E!.total).toBe(101);
    expect(() => play([first([joinE])], { limit: 30 })).toThrow(/past the limit/);
  });

  it('is refused in the round that ends the game', () => {
    expect(() => play([round(1, 'A', { B: 200, C: 200, D: 200 }, [joinE])])).toThrow(
      /nobody can rejoin or join/,
    );
  });
});

describe('whether someone could join now', () => {
  it('says yes with the score they would enter on', () => {
    const state = play([first()]);
    expect(joinEligibility(state)).toEqual({ ok: true, entryScore: 31 });
  });

  it('says no once the entry score would be past the limit, or the game is over', () => {
    const near = play([round(1, 'A', { B: 100, C: 101, D: 100 })]);
    expect(joinEligibility(near)).toMatchObject({ ok: false });
    const closed = play([first()], { limit: 30 });
    expect(joinEligibility(closed)).toMatchObject({ ok: false });
    const over = play([round(1, 'A', { B: 200, C: 200, D: 200 })]);
    expect(joinEligibility(over)).toEqual({ ok: false, reason: 'The game is over' });
  });
});
