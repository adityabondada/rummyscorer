/** Picks everyone if anyone is missing, otherwise clears the selection. */
export function toggleAll(picked: string[], all: string[]): string[] {
  const everyone = all.length > 0 && all.every((id) => picked.includes(id));
  return everyone
    ? []
    : [...picked.filter((id) => all.includes(id)), ...all.filter((id) => !picked.includes(id))];
}

/**
 * The table order for the players picked. Anyone already placed by hand keeps that order, and
 * players picked since go to the end, in the order they were picked.
 */
export function seatOrderFor(picked: string[], placed: string[]): string[] {
  return [
    ...placed.filter((id) => picked.includes(id)),
    ...picked.filter((id) => !placed.includes(id)),
  ];
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
