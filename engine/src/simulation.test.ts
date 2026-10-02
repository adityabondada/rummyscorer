import { describe, expect, it } from 'vitest';
import { applyRound, initialState, rejoinEligibility, replay, activeIds } from './replay';
import { rollbackTo } from './scrap';
import { simplifyTransfers, suggestSplit, summarize } from './settlement';
import { mulberry32, settings } from './testing';
import type { GameInput, GameState, PlayerId, Rejoin, Round, RoundEntry } from './types';

const NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Plays a random but legal game and returns its input, the way a table of friends might. */
function randomGame(seed: number): GameInput {
  const rand = mulberry32(seed);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T>(items: T[]): T => items[int(0, items.length - 1)]!;

  const count = int(2, 6);
  const maxDrops = pick([0, 1, 2, 3]);
  const gameSettings = settings({
    limit: pick([61, 101, 201]),
    buyIn: pick([5, 10, 20]),
    maxRoundPenalty: pick([80, 40, null]),
    maxDrops,
    dropsOnRejoin: pick([
      { mode: 'carryOver' as const },
      { mode: 'grant' as const, count: 0 },
      { mode: 'grant' as const, count: Math.min(1, maxDrops) },
    ]),
    rejoinCutoff: pick([null, 60, 100]),
  });
  const seatOrder = NAMES.slice(0, count);
  const rounds: Round[] = [];
  let state: GameState = initialState(gameSettings, seatOrder);

  for (let seq = 1; seq <= 120 && state.status === 'inProgress'; seq++) {
    const active = activeIds(state);
    const winnerId = pick(active);
    const entries: Record<PlayerId, RoundEntry> = {};
    for (const id of active.filter((p) => p !== winnerId)) {
      const player = state.players[id]!;
      const cap = gameSettings.maxRoundPenalty ?? 120;
      if (player.dropsLeft > 0 && rand() < 0.25) {
        entries[id] = { kind: rand() < 0.5 ? 'drop' : 'middleDrop' };
      } else {
        entries[id] = { kind: 'points', points: int(1, cap) };
      }
    }
    const plain: Round = { seq, winnerId, entries };
    const afterScoring = applyRound(state, plain);

    const rejoins: Rejoin[] = [];
    if (afterScoring.status === 'inProgress') {
      for (const id of afterScoring.seatOrder) {
        if (!afterScoring.players[id]!.active && rejoinEligibility(afterScoring, id).ok) {
          if (rand() < 0.6) {
            rejoins.push({ playerId: id, seatIndex: int(0, afterScoring.seatOrder.length - 1) });
          }
        }
      }
    }
    const full: Round = rejoins.length > 0 ? { ...plain, rejoins } : plain;
    rounds.push(full);
    state = applyRound(state, full);
  }
  return { settings: gameSettings, seatOrder, rounds };
}

const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);
const meta = { by: 'u', at: 1, reason: 'test' };

describe('random games', () => {
  it('replay matches playing the rounds one at a time', () => {
    for (const seed of SEEDS) {
      const input = randomGame(seed);
      let state = initialState(input.settings, input.seatOrder);
      for (const r of input.rounds) state = applyRound(state, r);
      expect(replay(input), `seed ${seed}`).toEqual(state);
    }
  });

  it('keeps the books balanced when a game finishes', () => {
    let finished = 0;
    for (const seed of SEEDS) {
      const input = randomGame(seed);
      const state = replay(input);
      const summary = summarize(state);
      if (!summary) continue;
      finished++;

      const { buyIn } = input.settings;
      const buyIns = Object.values(state.players).reduce((n, p) => n + p.buyIns, 0);
      const paid = Object.values(summary.payouts).reduce((n, v) => n + v, 0);
      const net = Object.values(summary.net).reduce((n, v) => n + v, 0);
      expect(summary.pot, `seed ${seed}`).toBe(buyIns * buyIn);
      expect(paid, `seed ${seed}`).toBe(summary.pot);
      expect(net, `seed ${seed}`).toBe(0);
      expect(state.winnerIds, `seed ${seed}`).toHaveLength(1);
      expect(summary.positions[state.winnerIds[0]!]).toBe(1);
      expect(Object.keys(summary.positions).sort()).toEqual([...input.seatOrder].sort());

      const transfers = simplifyTransfers(summary.net);
      expect(transfers.length).toBeLessThan(input.seatOrder.length);
    }
    expect(finished).toBeGreaterThan(SEEDS.length / 2);
  });

  it('never has more than the limit on an active player, or a dealer who is out', () => {
    for (const seed of SEEDS) {
      const input = randomGame(seed);
      let state = initialState(input.settings, input.seatOrder);
      for (const r of input.rounds) {
        state = applyRound(state, r);
        for (const id of activeIds(state)) {
          expect(state.players[id]!.total).toBeLessThanOrEqual(input.settings.limit);
          expect(state.players[id]!.dropsLeft).toBeGreaterThanOrEqual(0);
        }
        if (state.dealerId) expect(state.players[state.dealerId]!.active).toBe(true);
        expect([...state.seatOrder].sort()).toEqual([...input.seatOrder].sort());
      }
    }
  });

  it('scrapping the last rounds is the same as never having played them', () => {
    for (const seed of SEEDS) {
      const input = randomGame(seed);
      const n = input.rounds.length;
      if (n < 2) continue;
      const keep = 1 + (seed % (n - 1));
      const keepSeq = input.rounds[keep - 1]!.seq;
      const scrapped = rollbackTo(input.rounds, keepSeq, meta);
      const without = { ...input, rounds: input.rounds.slice(0, keep) };
      expect(replay({ ...input, rounds: scrapped }), `seed ${seed}`).toEqual(replay(without));
    }
  });

  it('scrapping every round gives back the starting state', () => {
    for (const seed of SEEDS) {
      const input = randomGame(seed);
      const scrapped = rollbackTo(input.rounds.length ? input.rounds : [], 0, meta);
      expect(replay({ ...input, rounds: scrapped })).toEqual(
        initialState(input.settings, input.seatOrder),
      );
    }
  });

  it('suggests a split that adds up to the pot at every point', () => {
    for (const seed of SEEDS) {
      const input = randomGame(seed);
      let state = initialState(input.settings, input.seatOrder);
      for (const r of input.rounds) {
        state = applyRound(state, r);
        if (state.status === 'finished') break;
        const { shares } = suggestSplit(state);
        expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBe(state.pot);
        expect(Object.values(shares).every((s) => s >= 0 && Number.isInteger(s))).toBe(true);
      }
    }
  });
});
