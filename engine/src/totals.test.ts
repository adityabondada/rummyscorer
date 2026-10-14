import { describe, expect, it } from 'vitest';
import { replay } from './replay';
import { round, settings } from './testing';

const seats = ['D', 'A', 'B', 'C'];

describe('the score kept after each round', () => {
  it("records every player's score once the round was applied", () => {
    const state = replay({
      settings: settings({ limit: 100, maxRoundPenalty: null }),
      seatOrder: seats,
      rounds: [round(1, 'A', { B: 10, C: 20, D: 30 }), round(2, 'B', { A: 5, C: 15, D: 25 })],
    });
    expect(state.rounds[0]!.totals).toEqual({ A: 0, B: 10, C: 20, D: 30 });
    expect(state.rounds[1]!.totals).toEqual({ A: 5, B: 10, C: 35, D: 55 });
  });

  it('keeps a player who is out at the score they went out on', () => {
    const state = replay({
      settings: settings({ limit: 50, maxRoundPenalty: null }),
      seatOrder: seats,
      rounds: [round(1, 'A', { B: 10, C: 60, D: 10 }), round(2, 'A', { B: 10, D: 10 })],
    });
    expect(state.rounds[0]!.totals.C).toBe(60);
    expect(state.rounds[1]!.totals.C).toBe(60);
  });

  it('shows a rejoiner at the score they came back on', () => {
    const state = replay({
      settings: settings({ limit: 50, maxRoundPenalty: null }),
      seatOrder: seats,
      rounds: [round(1, 'A', { B: 10, C: 60, D: 10 }, [{ playerId: 'C', seatIndex: 1 }])],
    });
    expect(state.rounds[0]!.totals.C).toBe(11);
    expect(state.players.C!.total).toBe(11);
  });
});
