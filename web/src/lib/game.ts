import {
  replay,
  type GameState,
  type PlayerId,
  type Rejoin,
  type Round,
  type Split,
} from '@rummy/engine';
import {
  gameInput,
  makeResolveId,
  roundDocToEngine,
  type GameDoc,
  type PlayerDoc,
  type RoundDoc,
} from '@rummy/data';

export interface RoundRow {
  id: string;
  doc: RoundDoc;
}

export type PlayerMap = Record<string, PlayerDoc>;

/** Rounds in the order they were played, scrapped ones included. */
export const bySeq = (rows: RoundRow[]): RoundRow[] =>
  [...rows].sort((a, b) => a.doc.seq - b.doc.seq);

export const liveRows = (rows: RoundRow[]): RoundRow[] => bySeq(rows).filter((r) => !r.doc.scrapped);

/** Replays a game as members see it: merged guests count as the member they were merged into. */
export function gameState(game: GameDoc, rows: RoundRow[], players: PlayerMap): GameState {
  const input = gameInput(game, rows.map((r) => r.doc));
  return replay(input, { resolveId: makeResolveId(players) });
}

/** The state just before a round was played, ignoring any split. */
export function stateBefore(
  game: GameDoc,
  rows: RoundRow[],
  players: PlayerMap,
  seq: number,
): GameState {
  const earlier = rows.filter((r) => r.doc.seq < seq);
  return gameState({ ...game, split: null }, earlier, players);
}

/**
 * Game documents keep the ids their players had when the game started, even after a guest is
 * merged into a member. Anything written to a game has to use those ids, or an unmerge would leave
 * rounds that name someone who isn't in the game. This maps a resolved id back to the stored one.
 */
export function storedIds(game: GameDoc, players: PlayerMap): (id: PlayerId) => PlayerId {
  const resolve = makeResolveId(players);
  const stored = new Map(game.seatOrder.map((id) => [resolve(id), id]));
  return (id) => stored.get(id) ?? id;
}

const mapKeys = <T>(map: Record<PlayerId, T>, to: (id: PlayerId) => PlayerId) =>
  Object.fromEntries(Object.entries(map).map(([id, value]) => [to(id), value]));

/** Rewrites a round built from resolved ids to the ids stored with the game. */
export function toStoredRound(round: Round, to: (id: PlayerId) => PlayerId): Round {
  return {
    ...round,
    winnerId: to(round.winnerId),
    entries: mapKeys(round.entries, to),
    rejoins: round.rejoins?.map((r: Rejoin) => ({ ...r, playerId: to(r.playerId) })),
  };
}

/** The reverse: a stored round with each id swapped for the profile it resolves to, for editing. */
export function toResolvedRound(round: Round, players: PlayerMap): Round {
  const resolve = makeResolveId(players);
  return {
    ...round,
    winnerId: resolve(round.winnerId),
    entries: mapKeys(round.entries, resolve),
    rejoins: round.rejoins?.map((r: Rejoin) => ({ ...r, playerId: resolve(r.playerId) })),
  };
}

export function toStoredSplit(split: Split, to: (id: PlayerId) => PlayerId): Split {
  return { ...split, shares: mapKeys(split.shares, to) };
}

export { roundDocToEngine };
