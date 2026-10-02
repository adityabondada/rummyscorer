import { EngineError, type PlayerId } from './types';

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export type Rank = (typeof RANKS)[number];

/** TODO(open-question): the spec doesn't say whether an ace draws low or high; ace is low here. */
export function rankValue(rank: Rank): number {
  return RANKS.indexOf(rank) + 1;
}

export type SeatingResult =
  { resolved: true; seatOrder: PlayerId[] } | { resolved: false; redraw: PlayerId[][] };

/** Compares two players' draws on the draws they both have; 0 means still tied. */
function compareDraws(a: Rank[], b: Rank[]): number {
  const common = Math.min(a.length, b.length);
  for (let i = 0; i < common; i++) {
    const diff = rankValue(a[i]!) - rankValue(b[i]!);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Turns each player's card draws into a seat order. `draws[id]` holds that player's cards in the
 * order drawn: the first card, then one more for every redraw after a tie.
 *
 * The lowest card deals round 1. The order is the lowest card followed by everyone else from the
 * highest card down, so the highest card is dealt first. Draws of 3, K, 9, 6 give 3, K, 9, 6.
 *
 * If players are tied, nothing is decided and only the tied players are returned in `redraw`.
 */
export function resolveSeating(draws: Record<PlayerId, Rank[]>): SeatingResult {
  const ids = Object.keys(draws);
  if (ids.length < 2) throw new EngineError('At least two players are needed');

  const sorted = [...ids].sort((x, y) => compareDraws(draws[x]!, draws[y]!));

  const redraw: PlayerId[][] = [];
  let group: PlayerId[] = [];
  for (const id of sorted) {
    const last = group[group.length - 1];
    if (last !== undefined && compareDraws(draws[last]!, draws[id]!) !== 0) {
      if (group.length > 1) redraw.push(group);
      group = [];
    }
    group.push(id);
  }
  if (group.length > 1) redraw.push(group);

  // A player with no card at all can't be placed.
  if (ids.some((id) => draws[id]!.length === 0)) {
    return { resolved: false, redraw: [ids.filter((id) => draws[id]!.length === 0)] };
  }
  if (redraw.length > 0) return { resolved: false, redraw };

  const [dealer, ...rest] = sorted;
  return { resolved: true, seatOrder: [dealer!, ...rest.reverse()] };
}
