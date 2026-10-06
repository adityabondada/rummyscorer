import { describe, expect, it } from 'vitest';
import { displayOrder, initialState, replay } from './replay';
import { drop, round, settings } from './testing';

/** The seat order for a line-up set up as people do: first card at the top, dealer at the bottom. */
const seatsFor = (lineUp: string[]) => [lineUp.at(-1)!, ...lineUp.slice(0, -1)];

describe('the order players are listed in', () => {
  const lineUp = ['A', 'B', 'C', 'D'];

  it('is the order the table was set up in, not the dealer first', () => {
    const state = initialState(settings(), seatsFor(lineUp));
    expect(state.seatOrder).toEqual(['D', 'A', 'B', 'C']);
    expect(state.tableStart).toBe('A');
    expect(displayOrder(state)).toEqual(lineUp);
  });

  it('puts the player at the bottom of the list, who deals round 1, last', () => {
    expect(displayOrder(initialState(settings(), seatsFor(['X', 'Y', 'Z']))).at(-1)).toBe('Z');
  });

  it('works for two players', () => {
    const state = initialState(settings(), seatsFor(['A', 'B']));
    expect(displayOrder(state)).toEqual(['A', 'B']);
  });

  it('stays put as rounds are played and the deal moves round the table', () => {
    const game = (rounds: Parameters<typeof replay>[0]['rounds']) =>
      replay({ settings: settings(), seatOrder: seatsFor(lineUp), rounds });
    const one = game([round(1, 'A', { B: 5, C: 5, D: 5 })]);
    const two = game([round(1, 'A', { B: 5, C: 5, D: 5 }), round(2, 'B', { A: 5, C: 5, D: 5 })]);
    expect(one.dealerId).not.toBe(two.dealerId);
    expect(displayOrder(one)).toEqual(lineUp);
    expect(displayOrder(two)).toEqual(lineUp);
  });

  it('keeps players who are out in their places', () => {
    const state = replay({
      settings: settings({ limit: 50, maxRoundPenalty: null }),
      seatOrder: seatsFor(lineUp),
      rounds: [round(1, 'A', { B: 10, C: 60, D: drop })],
    });
    expect(state.players.C!.active).toBe(false);
    expect(displayOrder(state)).toEqual(lineUp);
  });

  it('follows a rejoin to the place they took, without moving anyone else', () => {
    // C is out after round 1, and rejoins between A and B.
    const state = replay({
      settings: settings({ limit: 50, maxRoundPenalty: null }),
      seatOrder: seatsFor(lineUp),
      rounds: [
        // The seats without C are D, A, B; slot 2 puts C between A and B.
        round(1, 'A', { B: 10, C: 60, D: 10 }, [{ playerId: 'C', seatIndex: 2 }]),
      ],
    });
    expect(state.players.C!.active).toBe(true);
    expect(displayOrder(state)).toEqual(['A', 'C', 'B', 'D']);
  });

  it('is always the same people in the same circle as the seat order', () => {
    const state = replay({
      settings: settings({ limit: 50, maxRoundPenalty: null }),
      seatOrder: seatsFor(lineUp),
      rounds: [round(1, 'A', { B: 10, C: 60, D: 10 }, [{ playerId: 'C', seatIndex: 0 }])],
    });
    const shown = displayOrder(state);
    expect([...shown].sort()).toEqual([...state.seatOrder].sort());
    // Same circle: turning one list round to start at the same place gives the other.
    const at = state.seatOrder.indexOf(shown[0]!);
    expect([...state.seatOrder.slice(at), ...state.seatOrder.slice(0, at)]).toEqual(shown);
  });

  it('falls back to the seat order for a state that has no start, and changes nothing it is given', () => {
    const seats = ['D', 'A', 'B', 'C'];
    expect(displayOrder({ seatOrder: seats })).toEqual(seats);
    const copy = [...seats];
    displayOrder({ seatOrder: seats, tableStart: 'B' });
    expect(seats).toEqual(copy);
    expect(displayOrder({ seatOrder: seats, tableStart: 'B' })).not.toBe(seats);
  });

  it('starts at the seat order when the start is not at the table', () => {
    expect(displayOrder({ seatOrder: ['D', 'A'], tableStart: 'Z' })).toEqual(['D', 'A']);
  });
});
