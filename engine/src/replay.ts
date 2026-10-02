import { validateSettings, type GameSettings } from './settings';
import {
  EngineError,
  type GameInput,
  type GameState,
  type PlayerId,
  type Penalty,
  type PlayerState,
  type Rejoin,
  type Round,
  type RoundEntry,
  type RoundRecord,
  type Split,
} from './types';

/** Maps a stored player id to the profile it was merged into. */
export type ResolveId = (id: PlayerId) => PlayerId;

export interface ReplayOptions {
  resolveId?: ResolveId;
}

export const REJOIN_ENTRY_OFFSET = 1;

export function activeIds(state: GameState): PlayerId[] {
  return state.seatOrder.filter((id) => state.players[id]!.active);
}

/** First active player after `fromId` in seat order, leaving out anyone in `skip`. */
function nextActiveAfter(
  state: GameState,
  fromId: PlayerId,
  skip: ReadonlySet<PlayerId> = new Set(),
): PlayerId | null {
  const order = state.seatOrder;
  const start = order.indexOf(fromId);
  if (start === -1) return null;
  for (let i = 1; i <= order.length; i++) {
    const id = order[(start + i) % order.length]!;
    if (!skip.has(id) && state.players[id]!.active) return id;
  }
  return null;
}

export function initialState(settings: GameSettings, seatOrder: PlayerId[]): GameState {
  validateSettings(settings);
  if (seatOrder.length < 2) throw new EngineError('A game needs at least two players');
  if (new Set(seatOrder).size !== seatOrder.length) {
    throw new EngineError('Seat order has a player more than once');
  }
  const players: Record<PlayerId, PlayerState> = {};
  for (const id of seatOrder) {
    players[id] = {
      id,
      total: 0,
      dropsUsed: 0,
      dropsLeft: settings.maxDrops,
      active: true,
      buyIns: 1,
      rejoins: 0,
      roundsPlayed: 0,
      dropsTaken: 0,
      roundsWon: 0,
      penalties: 0,
      eliminated: null,
    };
  }
  const state: GameState = {
    settings,
    seatOrder: [...seatOrder],
    players,
    rounds: [],
    lastSeq: 0,
    pot: settings.buyIn * seatOrder.length,
    status: 'inProgress',
    outcome: null,
    winnerIds: [],
    payouts: {},
    dealerId: seatOrder[0]!,
    firstPlayerId: null,
    splitIgnored: false,
  };
  state.firstPlayerId = nextActiveAfter(state, seatOrder[0]!);
  return state;
}

export type RejoinCheck = { ok: true; entryScore: number } | { ok: false; reason: string };

function highestActiveScore(state: GameState): number {
  return Math.max(...activeIds(state).map((id) => state.players[id]!.total));
}

function checkRejoin(state: GameState, playerId: PlayerId, highest: number): RejoinCheck {
  const player = state.players[playerId];
  if (!player) return { ok: false, reason: 'Unknown player' };
  if (player.active) return { ok: false, reason: 'Player is still in the game' };
  const { rejoinCutoff, limit } = state.settings;
  if (rejoinCutoff !== null && highest > rejoinCutoff) {
    return { ok: false, reason: `Rejoin closed: the highest score is past ${rejoinCutoff}` };
  }
  const entryScore = highest + REJOIN_ENTRY_OFFSET;
  if (entryScore > limit) {
    return { ok: false, reason: 'Rejoin closed: the entry score would be past the limit' };
  }
  return { ok: true, entryScore };
}

/** Whether an eliminated player could rejoin right now, and at what score. */
export function rejoinEligibility(state: GameState, playerId: PlayerId): RejoinCheck {
  if (state.status === 'finished') return { ok: false, reason: 'The game is over' };
  return checkRejoin(state, playerId, highestActiveScore(state));
}

function applyEntry(
  settings: GameSettings,
  player: PlayerState,
  entry: RoundEntry | undefined,
): number {
  if (!entry) throw new EngineError(`Missing entry for ${player.id}`);
  if (entry.kind === 'points') {
    const { points } = entry;
    if (!Number.isInteger(points) || points < 0) {
      throw new EngineError(`Invalid points for ${player.id}`);
    }
    if (settings.maxRoundPenalty !== null && points > settings.maxRoundPenalty) {
      throw new EngineError(`${player.id} scored more than the ${settings.maxRoundPenalty} cap`);
    }
    return points;
  }
  if (player.dropsLeft <= 0) throw new EngineError(`${player.id} has no drops left`);
  player.dropsUsed += 1;
  player.dropsLeft -= 1;
  player.dropsTaken += 1;
  return entry.kind === 'drop' ? settings.dropPoints : settings.middleDropPoints;
}

function checkPenalty(state: GameState, penalty: Penalty, active: PlayerId[]): void {
  if (!active.includes(penalty.playerId))
    throw new EngineError('The penalty player is not playing');
  if (penalty.reason !== 'wrongShow' && penalty.reason !== 'error') {
    throw new EngineError('Unknown penalty reason');
  }
  const { points } = penalty;
  if (!Number.isInteger(points) || points <= 0) {
    throw new EngineError('A penalty needs a whole number of points above 0');
  }
  const cap = state.settings.maxRoundPenalty;
  if (cap !== null && points > cap) {
    throw new EngineError(`The penalty is more than the ${cap} cap`);
  }
}

interface DealerCursor {
  id: PlayerId;
  skip: Set<PlayerId>;
}

function applyRejoin(
  state: GameState,
  rejoin: Rejoin,
  highest: number,
  dealerCursor: DealerCursor,
): void {
  const check = checkRejoin(state, rejoin.playerId, highest);
  if (!check.ok) throw new EngineError(check.reason);

  const player = state.players[rejoin.playerId]!;
  const { settings } = state;
  player.active = true;
  player.total = check.entryScore;
  player.eliminated = null;
  player.rejoins += 1;
  player.buyIns += 1;
  if (settings.dropsOnRejoin.mode === 'grant') {
    player.dropsLeft = settings.dropsOnRejoin.count;
    player.dropsUsed = settings.maxDrops - settings.dropsOnRejoin.count;
  }
  state.pot += settings.buyIn;

  // Move the seat. If the dealer is the one moving, the cursor falls back to the seat before them
  // and they are skipped, so the next dealer is whoever followed them at the table.
  const order = state.seatOrder;
  const from = order.indexOf(rejoin.playerId);
  if (dealerCursor.id === rejoin.playerId) {
    dealerCursor.id = order[(from - 1 + order.length) % order.length]!;
    dealerCursor.skip.add(rejoin.playerId);
  }
  order.splice(from, 1);
  if (
    !Number.isInteger(rejoin.seatIndex) ||
    rejoin.seatIndex < 0 ||
    rejoin.seatIndex > order.length
  ) {
    throw new EngineError(`Invalid seat for ${rejoin.playerId}`);
  }
  order.splice(rejoin.seatIndex, 0, rejoin.playerId);
}

/** Applies one round (and the rejoins after it). Pure: returns a new state, or throws. */
export function applyRound(prev: GameState, round: Round): GameState {
  if (prev.status === 'finished') throw new EngineError('The game is already over');
  if (!Number.isInteger(round.seq) || round.seq <= prev.lastSeq) {
    throw new EngineError(`Round ${round.seq} is out of order`);
  }
  const state = structuredClone(prev);
  const active = activeIds(state);

  const penalty = round.penalty ?? null;
  if (penalty) {
    if (round.winnerId !== null) throw new EngineError('A penalty round has no winner');
    checkPenalty(state, penalty, active);
  } else if (round.winnerId === null || !active.includes(round.winnerId)) {
    throw new EngineError('The round winner is not playing');
  }
  // The one who scores without an entry: the winner, or the player with the penalty.
  const special = penalty ? penalty.playerId : round.winnerId;
  const expected = active.filter((id) => id !== special);
  const given = Object.keys(round.entries);
  if (given.length !== expected.length || expected.some((id) => !(id in round.entries))) {
    throw new EngineError(
      penalty
        ? 'Entries must cover every active player except the one with the penalty'
        : 'Entries must cover every active player except the winner',
    );
  }
  if (penalty) {
    for (const id of expected) {
      const entry = round.entries[id]!;
      if (entry.kind === 'points' && entry.points !== 0) {
        throw new EngineError('In a penalty round only the player with the penalty scores');
      }
    }
  }

  const dealerId = state.dealerId!;
  const record: RoundRecord = {
    seq: round.seq,
    dealerId,
    winnerId: round.winnerId,
    penalty: penalty ? { ...penalty } : null,
    points: {},
    entries: structuredClone(round.entries),
    eliminated: [],
    rejoined: [],
  };

  for (const id of active) {
    const player = state.players[id]!;
    const points =
      id === special
        ? penalty
          ? penalty.points
          : 0
        : applyEntry(state.settings, player, round.entries[id]);
    record.points[id] = points;
    player.total += points;
    player.roundsPlayed += 1;
    if (id === round.winnerId) player.roundsWon += 1;
    if (penalty && id === penalty.playerId) player.penalties += 1;
    if (player.total > state.settings.limit) {
      player.active = false;
      player.eliminated = { afterSeq: round.seq, total: player.total };
      record.eliminated.push(id);
    }
  }
  state.lastSeq = round.seq;

  const remaining = activeIds(state);
  const rejoins = round.rejoins ?? [];
  if (remaining.length === 0) throw new EngineError('That would put every player out of the game');
  if (remaining.length === 1) {
    if (rejoins.length > 0) throw new EngineError('The game ended, so nobody can rejoin');
    state.status = 'finished';
    state.outcome = 'outright';
    state.winnerIds = [remaining[0]!];
    state.payouts = { [remaining[0]!]: state.pot };
    state.dealerId = null;
    state.firstPlayerId = null;
  } else {
    // Everyone rejoining in the same break enters at the same score.
    const highest = highestActiveScore(state);
    const cursor: DealerCursor = { id: dealerId, skip: new Set() };
    for (const rejoin of rejoins) {
      applyRejoin(state, rejoin, highest, cursor);
      record.rejoined.push(rejoin.playerId);
    }
    state.dealerId = nextActiveAfter(state, cursor.id, cursor.skip);
    state.firstPlayerId = state.dealerId ? nextActiveAfter(state, state.dealerId) : null;
  }

  state.rounds.push(record);
  return state;
}

/** Ends an in-progress game by agreement, paying out `split.shares`. */
export function applySplit(prev: GameState, split: Split): GameState {
  if (prev.status === 'finished') throw new EngineError('The game is already over');
  if (split.afterSeq !== prev.lastSeq)
    throw new EngineError('The split is not for the latest round');
  const active = activeIds(prev);
  const ids = Object.keys(split.shares);
  if (ids.length !== active.length || active.some((id) => !(id in split.shares))) {
    throw new EngineError('A split must name every remaining player');
  }
  let sum = 0;
  for (const id of ids) {
    const share = split.shares[id]!;
    if (!Number.isInteger(share) || share < 0) throw new EngineError(`Invalid share for ${id}`);
    sum += share;
  }
  if (sum !== prev.pot)
    throw new EngineError(`Shares add up to ${sum}, but the pot is ${prev.pot}`);

  const state = structuredClone(prev);
  state.status = 'finished';
  state.outcome = 'split';
  state.winnerIds = active;
  state.payouts = { ...split.shares };
  state.dealerId = null;
  state.firstPlayerId = null;
  return state;
}

function remap<T>(map: Record<PlayerId, T>, resolve: ResolveId): Record<PlayerId, T> {
  const out: Record<PlayerId, T> = {};
  for (const [id, value] of Object.entries(map)) {
    const to = resolve(id);
    if (to in out) throw new EngineError(`Two merged profiles appear in one round (${to})`);
    out[to] = value;
  }
  return out;
}

function resolveInput(input: GameInput, resolve: ResolveId): GameInput {
  return {
    settings: input.settings,
    seatOrder: input.seatOrder.map(resolve),
    rounds: input.rounds.map((round) => ({
      ...round,
      winnerId: round.winnerId === null ? null : resolve(round.winnerId),
      penalty: round.penalty
        ? { ...round.penalty, playerId: resolve(round.penalty.playerId) }
        : null,
      entries: remap(round.entries, resolve),
      rejoins: round.rejoins?.map((r) => ({ ...r, playerId: resolve(r.playerId) })),
    })),
    split: input.split ? { ...input.split, shares: remap(input.split.shares, resolve) } : null,
  };
}

/**
 * Derives the whole game state from its settings, seat order and rounds. Scrapped rounds are
 * skipped, along with their rejoins. Throws EngineError if the recorded rounds aren't a legal game.
 */
export function replay(input: GameInput, options: ReplayOptions = {}): GameState {
  const { settings, seatOrder, rounds, split } = options.resolveId
    ? resolveInput(input, options.resolveId)
    : input;

  let state = initialState(settings, seatOrder);
  const live = rounds.filter((r) => !r.scrapped).sort((a, b) => a.seq - b.seq);
  for (const round of live) state = applyRound(state, round);

  if (split) {
    if (split.afterSeq === state.lastSeq) state = applySplit(state, split);
    else state = { ...state, splitIgnored: true };
  }
  return state;
}
