import { summarize, type GameState } from '@rummy/engine';
import { buildRecap } from './recap';
import type { GameSummaryDoc } from './types';

/**
 * The cached summary for a finished game, or null while it's still being played. Build `state`
 * with `replay(..., { resolveId })` so every id here is already the merged member profile. With
 * `names` (by that same id) the story of the game is kept in the summary as well.
 */
export function summaryFromState(
  state: GameState,
  computedAt: number,
  names?: Record<string, string>,
): GameSummaryDoc | null {
  const summary = summarize(state);
  if (!summary) return null;

  const players: GameSummaryDoc['players'] = {};
  for (const id of state.seatOrder) {
    const p = state.players[id]!;
    players[id] = {
      net: summary.net[id]!,
      position: summary.positions[id]!,
      roundsPlayed: p.roundsPlayed,
      dropsTaken: p.dropsTaken,
      rejoins: p.rejoins,
      buyIns: p.buyIns,
      roundsWon: p.roundsWon,
      penalties: p.penalties,
    };
  }
  const recap = names ? buildRecap(state, names) : null;
  return {
    outcome: summary.outcome,
    winnerIds: summary.winnerIds,
    pot: summary.pot,
    payouts: summary.payouts,
    rounds: summary.rounds,
    players,
    ...(recap ? { recap } : {}),
    computedAt,
  };
}
