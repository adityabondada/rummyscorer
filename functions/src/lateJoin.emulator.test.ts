import { beforeEach, describe, expect, it } from 'vitest';
import { deleteGame } from './games';
import { mergePlayers } from './merge';
import { recomputeGame } from './recompute';
import { removePlayer } from './leagues';
import { logPath } from '@rummy/data';
import {
  addGame,
  addGuest,
  addRound,
  caught,
  clearDb,
  NOW,
  pts,
  readGame,
  seedLeague,
  testDb,
} from './testing';

const db = testDb();
beforeEach(clearDb);

/**
 * Admin, u2 and u3 start a game. After round 1 a guest joins late. In round 2 u2 and u3 go out
 * and the admin and the guest are left, then the guest goes out and the admin wins.
 */
async function lateJoinGame() {
  const { leagueId, profiles } = await seedLeague(db, ['u2', 'u3']);
  const [a, b, c] = [profiles.admin!, profiles.u2!, profiles.u3!];
  const guest = await addGuest(db, leagueId, 'Late Larry');
  const gameId = await addGame(db, leagueId, [a, b, c]);
  const roundId = await addRound(db, leagueId, gameId, {
    seq: 1,
    winnerId: a,
    entries: { [b]: pts(10), [c]: pts(20) },
    rejoins: [{ playerId: guest, seatIndex: -1, join: { drops: 1 } }],
  });
  return { leagueId, a, b, c, guest, gameId, roundId };
}

describe('a game with someone who joined late', () => {
  it('records everyone who played, the joiner included, on the game', async () => {
    const { leagueId, a, b, c, guest, gameId } = await lateJoinGame();
    expect(await recomputeGame(db, leagueId, gameId, NOW)).toBe('updated');
    const game = await readGame(db, leagueId, gameId);
    expect(game.playerIds).toEqual([a, b, c, guest]);
    expect(game.seatOrder).toEqual([a, b, c]);
  });

  it('leaves the joiner out again when their round is scrapped', async () => {
    const { leagueId, a, b, c, gameId, roundId } = await lateJoinGame();
    await recomputeGame(db, leagueId, gameId, NOW);
    await db
      .doc(`leagues/${leagueId}/games/${gameId}/rounds/${roundId}`)
      .update({ scrapped: { by: 'admin', at: 1, reason: 'oops' } });
    await recomputeGame(db, leagueId, gameId, NOW);
    expect((await readGame(db, leagueId, gameId)).playerIds).toEqual([a, b, c]);
  });

  it('counts the joiner in the finished game: in the pot, with a buy-in, and in the summary', async () => {
    const { leagueId, a, b, c, guest, gameId } = await lateJoinGame();
    await addRound(db, leagueId, gameId, {
      seq: 2,
      winnerId: a,
      entries: { [b]: pts(45), [c]: pts(40), [guest]: pts(10) },
    });
    await addRound(db, leagueId, gameId, { seq: 3, winnerId: a, entries: { [guest]: pts(25) } });
    await recomputeGame(db, leagueId, gameId, NOW);
    const game = await readGame(db, leagueId, gameId);
    expect(game.summaryError).toBeNull();
    expect(game.status).toBe('finished');
    expect(game.summary.pot).toBe(40);
    expect(Object.keys(game.summary.players).sort()).toEqual([a, b, c, guest].sort());
    expect(game.summary.players[guest].net).toBe(-10);
    expect(game.summary.players[a].net).toBe(30);
  });

  it('is never lost on a game that cannot be replayed', async () => {
    const { leagueId, guest, gameId } = await lateJoinGame();
    await addRound(db, leagueId, gameId, { seq: 5, winnerId: 'nobody', entries: {} });
    await recomputeGame(db, leagueId, gameId, NOW);
    const game = await readGame(db, leagueId, gameId);
    expect(game.summaryError).toBeTruthy();
    expect(game.playerIds).toContain(guest);
  });

  it('stops the joiner being removed as if they had never played', async () => {
    const { leagueId, guest, gameId } = await lateJoinGame();
    await recomputeGame(db, leagueId, gameId, NOW);
    const err = await caught(() => removePlayer(db, 'admin', { leagueId, playerId: guest }, NOW));
    expect(err.code).toBe('failed-precondition');
    expect((await db.doc(`leagues/${leagueId}/players/${guest}`).get()).exists).toBe(true);
    expect(gameId).toBeTruthy();
  });

  it('refuses that merge when both were in the same game, one of them late', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2']);
    const [a, b] = [profiles.admin!, profiles.u2!];
    const guest = await addGuest(db, leagueId, 'Bo (guest)');
    const gameId = await addGame(db, leagueId, [a, guest]);
    await addRound(db, leagueId, gameId, {
      seq: 1,
      winnerId: a,
      entries: { [guest]: pts(10) },
      rejoins: [{ playerId: b, seatIndex: -1, join: { drops: 1 } }],
    });
    await recomputeGame(db, leagueId, gameId, NOW);
    const err = await caught(() =>
      mergePlayers(db, 'admin', { leagueId, guestId: guest, targetId: b }, NOW),
    );
    expect(err.code).toBe('failed-precondition');
    expect(err.message).toMatch(/same game/);
  });

  it('is logged with the number of people who played when the game is deleted', async () => {
    const { leagueId, gameId } = await lateJoinGame();
    await recomputeGame(db, leagueId, gameId, NOW);
    await deleteGame(db, 'admin', { leagueId, gameId }, NOW);
    const entry = (
      await db.collection(logPath(leagueId)).where('type', '==', 'gameDeleted').get()
    ).docs[0]!.data();
    expect(entry.details.players).toBe(4);
  });
});
