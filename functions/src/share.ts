import { randomBytes } from 'node:crypto';
import { EngineError, type GameState } from '@rummy/engine';
import {
  DataError,
  gamePath,
  leaguePath,
  makeResolveId,
  parseLeague,
  parsePlayer,
  playersPath,
  roundsPath,
  sharePath,
  type PlayerDoc,
  type ShareDoc,
} from '@rummy/data';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { readLeague, requireMember, stringArg } from './access';
import { replayStored } from './recompute';

/** 22 characters from 16 random bytes, so a link can't be guessed. */
export const newShareCode = () => randomBytes(16).toString('base64url');

const VALID_CODE = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Turns the read-only link for a game on or off. Any member can. The link is a code that points at
 * the game; anyone who has it can watch the scores without signing in, and turning it off makes the
 * old link stop working. Switching it on twice gives back the same link.
 */
export async function shareGame(
  db: Firestore,
  uid: string,
  args: { leagueId: unknown; gameId: unknown; enable: unknown },
  now: number,
): Promise<{ shareCode: string | null }> {
  const leagueId = stringArg(args.leagueId, 'leagueId', 128);
  const gameId = stringArg(args.gameId, 'gameId', 128);
  if (typeof args.enable !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Say whether to switch the link on or off');
  }

  return db.runTransaction(async (tx) => {
    requireMember(await readLeague(tx, db, leagueId), uid);
    const gameRef = db.doc(gamePath(leagueId, gameId));
    const game = await tx.get(gameRef);
    if (!game.exists) throw new HttpsError('not-found', 'That game does not exist');
    const current = game.data()?.shareCode;
    const existing = typeof current === 'string' && current !== '' ? current : null;

    if (!args.enable) {
      if (existing) tx.delete(db.doc(sharePath(existing)));
      tx.update(gameRef, { shareCode: null });
      return { shareCode: null };
    }
    if (existing) return { shareCode: existing };

    const shareCode = newShareCode();
    const share: ShareDoc = { leagueId, gameId, createdBy: uid, createdAt: now };
    tx.set(db.doc(sharePath(shareCode)), share);
    tx.update(gameRef, { shareCode });
    return { shareCode };
  });
}

/** What someone with a link sees. No sign-in is needed, so it holds names and scores and nothing else. */
export interface GameView {
  leagueName: string;
  /** Player names by the ids used in `state`, with merged guests shown as the member. */
  names: Record<string, string>;
  /** When the game was started, in milliseconds. */
  startedAt: number;
  state: GameState;
}

/**
 * The current state of a shared game, replayed from its rounds. Gives away the league's name, the
 * players' names and the scores, which is what the link is for: no ids of people's accounts, no
 * other games, and nothing about the league's other members.
 */
export async function gameView(db: Firestore, args: { code: unknown }): Promise<GameView> {
  if (typeof args.code !== 'string' || !VALID_CODE.test(args.code)) {
    throw new HttpsError('not-found', 'That link is not valid any more');
  }
  const share = await db.doc(sharePath(args.code)).get();
  const target = share.data() as ShareDoc | undefined;
  if (!share.exists || !target) {
    throw new HttpsError('not-found', 'That link is not valid any more');
  }
  const { leagueId, gameId } = target;

  const [league, game, rounds, players] = await Promise.all([
    db.doc(leaguePath(leagueId)).get(),
    db.doc(gamePath(leagueId, gameId)).get(),
    db.collection(roundsPath(leagueId, gameId)).get(),
    db.collection(playersPath(leagueId)).get(),
  ]);
  if (!league.exists || !game.exists) {
    throw new HttpsError('not-found', 'That link is not valid any more');
  }

  const profiles: Record<string, PlayerDoc> = {};
  for (const doc of players.docs) {
    try {
      profiles[doc.id] = parsePlayer(doc.data());
    } catch {
      // Skipped, as when recalculating a game.
    }
  }
  let state: GameState;
  try {
    state = replayStored(
      { ...game.data(), summary: null, summaryError: null },
      rounds.docs.map((d) => d.data()),
      players.docs.map((d) => [d.id, d.data()] as [string, unknown]),
    );
  } catch (error) {
    if (error instanceof EngineError || error instanceof DataError) {
      throw new HttpsError('failed-precondition', 'This game can not be shown right now');
    }
    throw error;
  }

  const resolve = makeResolveId(profiles);
  const names: Record<string, string> = {};
  for (const id of state.seatOrder) names[id] = profiles[resolve(id)]?.name ?? 'Player';
  return {
    leagueName: parseLeague(league.data()).name,
    names,
    startedAt: typeof game.data()?.createdAt === 'number' ? game.data()!.createdAt : 0,
    state,
  };
}

/** Removes a game's link, if it has one. Used when the game itself is deleted. */
export async function removeShare(db: Firestore, gameData: unknown): Promise<void> {
  const code =
    typeof gameData === 'object' && gameData !== null && 'shareCode' in gameData
      ? (gameData as { shareCode: unknown }).shareCode
      : null;
  if (typeof code === 'string' && code !== '') await db.doc(sharePath(code)).delete();
}
