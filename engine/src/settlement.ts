import { activeIds } from './replay';
import {
  EngineError,
  type GameState,
  type GameSummary,
  type PlayerId,
  type Transfer,
} from './types';

export interface SplitSuggestion {
  shares: Record<PlayerId, number>;
  /** Each remaining player's weight: distance from the limit plus the value of unused drops. */
  weights: Record<PlayerId, number>;
}

/**
 * Suggests how the remaining players split the pot. Each player's weight is
 * `(limit - total) + dropsLeft * dropPoints`, and their share is weight / sum of weights of the
 * pot, rounded down to whole dollars. The leftover dollars go to the lowest total; a tie there goes
 * to the earlier seat. Members can override the suggestion.
 *
 * TODO(open-question): the drop weight and the tie-break for the leftover may be tuned later.
 */
export function suggestSplit(state: GameState): SplitSuggestion {
  if (state.status === 'finished') throw new EngineError('The game is already over');
  const ids = activeIds(state);
  const { limit, dropPoints } = state.settings;

  const weights: Record<PlayerId, number> = {};
  for (const id of ids) {
    const p = state.players[id]!;
    weights[id] = limit - p.total + p.dropsLeft * dropPoints;
  }
  const sum = ids.reduce((acc, id) => acc + weights[id]!, 0);

  const shares: Record<PlayerId, number> = {};
  let paid = 0;
  for (const id of ids) {
    // Everyone is at exactly the limit with no drops: nothing to weigh by, so split evenly.
    shares[id] = Math.floor(sum === 0 ? state.pot / ids.length : (state.pot * weights[id]!) / sum);
    paid += shares[id]!;
  }

  let lowest = ids[0]!;
  for (const id of ids) {
    if (state.players[id]!.total < state.players[lowest]!.total) lowest = id;
  }
  shares[lowest] = shares[lowest]! + (state.pot - paid);
  return { shares, weights };
}

/** Final positions: winners share 1st, then players who lasted longer, then lower totals. */
function positions(state: GameState): Record<PlayerId, number> {
  const out: Record<PlayerId, number> = {};
  const winners = new Set(state.winnerIds);
  const others = state.seatOrder.filter((id) => !winners.has(id));

  for (const id of winners) out[id] = 1;
  const better = (a: PlayerId, b: PlayerId) => {
    const ea = state.players[a]!.eliminated!;
    const eb = state.players[b]!.eliminated!;
    return ea.afterSeq !== eb.afterSeq ? ea.afterSeq > eb.afterSeq : ea.total < eb.total;
  };
  for (const id of others) {
    out[id] = winners.size + 1 + others.filter((other) => better(other, id)).length;
  }
  return out;
}

/** Cached result of a finished game, or null while it's still being played. */
export function summarize(state: GameState): GameSummary | null {
  if (state.status !== 'finished' || state.outcome === null) return null;
  const { buyIn } = state.settings;
  const net: Record<PlayerId, number> = {};
  for (const id of state.seatOrder) {
    net[id] = (state.payouts[id] ?? 0) - state.players[id]!.buyIns * buyIn;
  }
  return {
    outcome: state.outcome,
    winnerIds: state.winnerIds,
    pot: state.pot,
    payouts: state.payouts,
    net,
    positions: positions(state),
    rounds: state.rounds.length,
  };
}

/**
 * Turns per-player nets (summed over a night, if you like) into who pays whom. Transfers that
 * settle one debtor against one creditor exactly are used first, then the rest is matched largest
 * to largest. That keeps the count low, though it isn't guaranteed to be the true minimum.
 */
export function simplifyTransfers(nets: Record<PlayerId, number>): Transfer[] {
  const total = Object.values(nets).reduce((a, b) => a + b, 0);
  if (total !== 0) throw new EngineError('Nets must add up to zero');

  const byAmount = (a: [PlayerId, number], b: [PlayerId, number]) =>
    b[1] - a[1] || a[0].localeCompare(b[0]);
  const debtors = Object.entries(nets)
    .filter(([, n]) => n < 0)
    .map(([id, n]): [PlayerId, number] => [id, -n])
    .sort(byAmount);
  const creditors = Object.entries(nets)
    .filter(([, n]) => n > 0)
    .sort(byAmount);

  const transfers: Transfer[] = [];
  for (const debtor of [...debtors]) {
    const match = creditors.findIndex(([, owed]) => owed === debtor[1]);
    if (match === -1) continue;
    transfers.push({ from: debtor[0], to: creditors[match]![0], amount: debtor[1] });
    creditors.splice(match, 1);
    debtors.splice(debtors.indexOf(debtor), 1);
  }

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(byAmount);
    creditors.sort(byAmount);
    const debtor = debtors[0]!;
    const creditor = creditors[0]!;
    const amount = Math.min(debtor[1], creditor[1]);
    transfers.push({ from: debtor[0], to: creditor[0], amount });
    debtor[1] -= amount;
    creditor[1] -= amount;
    if (debtor[1] === 0) debtors.shift();
    if (creditor[1] === 0) creditors.shift();
  }
  return transfers;
}
