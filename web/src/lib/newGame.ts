import type { GameSettings } from '@rummy/engine';

/** Adds a player to the end of the line-up, or takes them out if they are already in it. */
export function togglePlayer(order: string[], id: string): string[] {
  return order.includes(id) ? order.filter((p) => p !== id) : [...order, id];
}

/**
 * Adds everyone who isn't in yet, after those already placed (so the order set so far is kept), or
 * clears the line-up when everyone is already in.
 */
export function toggleAll(order: string[], all: string[]): string[] {
  const everyone = all.length > 0 && all.every((id) => order.includes(id));
  if (everyone) return [];
  return [...order.filter((id) => all.includes(id)), ...all.filter((id) => !order.includes(id))];
}

/**
 * Turns the list people arrange (the order cards are dealt in: the player at the top gets the first
 * card, and the player at the bottom has the lowest card) into the game's seat order, where the
 * first seat is the dealer. The player at the bottom deals round 1, then the deal moves to the top
 * of the list and down. The cycle around the table is unchanged; only who starts it moves.
 */
export function tableOrder(list: string[]): string[] {
  const dealer = list.at(-1);
  return dealer === undefined ? [] : [dealer, ...list.slice(0, -1)];
}

/** Moves one player up (-1) or down (1) by a seat. Returns the order unchanged at either end. */
export function moveInOrder(order: string[], id: string, delta: -1 | 1): string[] {
  const from = order.indexOf(id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The rules that sit under "More rules", in one line, so they can be checked without opening it.
 * The elimination limit and buy-in are always on screen, so they are not repeated here.
 */
export function moreRulesSummary(s: GameSettings): string {
  const drops =
    s.maxDrops === 0
      ? 'No drops'
      : `Drop ${s.dropPoints}, middle drop ${s.middleDropPoints}, up to ${s.maxDrops} each`;
  const cap = s.maxRoundPenalty === null ? 'no penalty cap' : `penalty cap ${s.maxRoundPenalty}`;
  const rejoinDrops =
    s.dropsOnRejoin.mode === 'carryOver'
      ? 'rejoin keeps the drops left'
      : s.dropsOnRejoin.count === 0
        ? 'rejoin with no drops'
        : `rejoin with ${plural(s.dropsOnRejoin.count, 'drop')}`;
  const cutoff =
    s.rejoinCutoff === null ? 'rejoin always open' : `rejoin closes past ${s.rejoinCutoff}`;
  return [drops, cap, rejoinDrops, cutoff].join(' · ');
}
