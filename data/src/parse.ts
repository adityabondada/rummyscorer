import { validateSettings, type GameSettings, type Rejoin, type RoundEntry } from '@rummy/engine';
import type {
  GameDoc,
  GameSummaryDoc,
  LeagueDoc,
  PlayerDoc,
  PlayerStatsDoc,
  RoundDoc,
  RoundHistoryEntry,
  RoundSnapshot,
  SettledDoc,
} from './types';

/** Thrown when stored data doesn't have the shape the app expects. */
export class DataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataError';
  }
}

type Obj = Record<string, unknown>;

function obj(value: unknown, what: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DataError(`${what} must be an object`);
  }
  return value as Obj;
}
function str(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new DataError(`${what} must be a string`);
  return value;
}
function num(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DataError(`${what} must be a number`);
  }
  return value;
}
function bool(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') throw new DataError(`${what} must be true or false`);
  return value;
}
function arr(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new DataError(`${what} must be a list`);
  return value;
}
const nullable = <T>(value: unknown, parse: (v: unknown) => T): T | null =>
  value === null || value === undefined ? null : parse(value);
const strings = (value: unknown, what: string) =>
  arr(value, what).map((v, i) => str(v, `${what}[${i}]`));
const numberMap = (value: unknown, what: string): Record<string, number> =>
  Object.fromEntries(Object.entries(obj(value, what)).map(([k, v]) => [k, num(v, `${what}.${k}`)]));

export function parseLeague(data: unknown): LeagueDoc {
  const d = obj(data, 'league');
  return {
    name: str(d.name, 'name'),
    adminUid: str(d.adminUid, 'adminUid'),
    inviteCode: str(d.inviteCode, 'inviteCode'),
    memberUids: strings(d.memberUids, 'memberUids'),
    createdAt: num(d.createdAt, 'createdAt'),
  };
}

export function parseSettled(data: unknown): SettledDoc {
  const d = obj(data, 'settled');
  return {
    day: str(d.day, 'day'),
    from: str(d.from, 'from'),
    to: str(d.to, 'to'),
    amount: num(d.amount, 'amount'),
    by: str(d.by, 'by'),
    at: num(d.at, 'at'),
  };
}

export function parsePlayer(data: unknown): PlayerDoc {
  const d = obj(data, 'player');
  return {
    name: str(d.name, 'name'),
    linkedUid: nullable(d.linkedUid, (v) => str(v, 'linkedUid')),
    retired: bool(d.retired, 'retired'),
    mergedInto: nullable(d.mergedInto, (v) => str(v, 'mergedInto')),
    createdBy: str(d.createdBy, 'createdBy'),
    createdAt: num(d.createdAt, 'createdAt'),
  };
}

function parseEntry(value: unknown, what: string): RoundEntry {
  const d = obj(value, what);
  const kind = str(d.kind, `${what}.kind`);
  if (kind === 'drop' || kind === 'middleDrop') return { kind };
  if (kind === 'points') return { kind, points: num(d.points, `${what}.points`) };
  throw new DataError(`${what}.kind is not a known entry type`);
}

function parseEntries(value: unknown): Record<string, RoundEntry> {
  return Object.fromEntries(
    Object.entries(obj(value, 'entries')).map(([id, e]) => [id, parseEntry(e, `entries.${id}`)]),
  );
}

function parseRejoins(value: unknown): Rejoin[] {
  return arr(value ?? [], 'rejoins').map((r, i) => {
    const d = obj(r, `rejoins[${i}]`);
    return { playerId: str(d.playerId, 'playerId'), seatIndex: num(d.seatIndex, 'seatIndex') };
  });
}

function parseScrapped(value: unknown): RoundSnapshot['scrapped'] {
  return nullable(value, (v) => {
    const d = obj(v, 'scrapped');
    return { by: str(d.by, 'by'), at: num(d.at, 'at'), reason: str(d.reason, 'reason') };
  });
}

function parseSnapshot(value: unknown, what: string): RoundSnapshot {
  const d = obj(value, what);
  return {
    winnerId: str(d.winnerId, 'winnerId'),
    entries: parseEntries(d.entries),
    rejoins: parseRejoins(d.rejoins),
    scrapped: parseScrapped(d.scrapped),
  };
}

function parseHistory(value: unknown): RoundHistoryEntry[] {
  return arr(value ?? [], 'history').map((h, i) => {
    const d = obj(h, `history[${i}]`);
    return {
      by: str(d.by, 'by'),
      at: num(d.at, 'at'),
      prev: parseSnapshot(d.prev, `history[${i}].prev`),
    };
  });
}

export function parseRound(data: unknown): RoundDoc {
  const d = obj(data, 'round');
  return {
    seq: num(d.seq, 'seq'),
    ...parseSnapshot(d, 'round'),
    updatedBy: str(d.updatedBy, 'updatedBy'),
    updatedAt: num(d.updatedAt, 'updatedAt'),
    history: parseHistory(d.history),
  };
}

function parseSettings(value: unknown): GameSettings {
  const d = obj(value, 'settings');
  const rejoin = obj(d.dropsOnRejoin, 'dropsOnRejoin');
  const settings: GameSettings = {
    limit: num(d.limit, 'limit'),
    buyIn: num(d.buyIn, 'buyIn'),
    dropPoints: num(d.dropPoints, 'dropPoints'),
    middleDropPoints: num(d.middleDropPoints, 'middleDropPoints'),
    maxDrops: num(d.maxDrops, 'maxDrops'),
    dropsOnRejoin:
      rejoin.mode === 'grant'
        ? { mode: 'grant', count: num(rejoin.count, 'dropsOnRejoin.count') }
        : { mode: 'carryOver' },
    maxRoundPenalty: nullable(d.maxRoundPenalty, (v) => num(v, 'maxRoundPenalty')),
    rejoinCutoff: nullable(d.rejoinCutoff, (v) => num(v, 'rejoinCutoff')),
  };
  validateSettings(settings);
  return settings;
}

function parseStats(value: unknown, what: string): PlayerStatsDoc {
  const d = obj(value, what);
  return {
    net: num(d.net, 'net'),
    position: num(d.position, 'position'),
    roundsPlayed: num(d.roundsPlayed, 'roundsPlayed'),
    dropsTaken: num(d.dropsTaken, 'dropsTaken'),
    rejoins: num(d.rejoins, 'rejoins'),
    buyIns: num(d.buyIns, 'buyIns'),
  };
}

function parseSummary(value: unknown): GameSummaryDoc {
  const d = obj(value, 'summary');
  const outcome = str(d.outcome, 'outcome');
  if (outcome !== 'outright' && outcome !== 'split') throw new DataError('unknown outcome');
  return {
    outcome,
    winnerIds: strings(d.winnerIds, 'winnerIds'),
    pot: num(d.pot, 'pot'),
    payouts: numberMap(d.payouts, 'payouts'),
    rounds: num(d.rounds, 'rounds'),
    players: Object.fromEntries(
      Object.entries(obj(d.players, 'players')).map(([id, s]) => [
        id,
        parseStats(s, `players.${id}`),
      ]),
    ),
    computedAt: num(d.computedAt, 'computedAt'),
  };
}

export function parseGame(data: unknown): GameDoc {
  const d = obj(data, 'game');
  const status = str(d.status, 'status');
  if (status !== 'inProgress' && status !== 'finished') throw new DataError('unknown status');
  return {
    settings: parseSettings(d.settings),
    seatOrder: strings(d.seatOrder, 'seatOrder'),
    status,
    createdBy: str(d.createdBy, 'createdBy'),
    createdAt: num(d.createdAt, 'createdAt'),
    split: nullable(d.split, (v) => {
      const s = obj(v, 'split');
      return { afterSeq: num(s.afterSeq, 'afterSeq'), shares: numberMap(s.shares, 'shares') };
    }),
    summary: nullable(d.summary, parseSummary),
    summaryError: nullable(d.summaryError, (v) => str(v, 'summaryError')),
  };
}
