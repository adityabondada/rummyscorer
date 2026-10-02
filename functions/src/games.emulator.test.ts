import { logPath, roundsPath, settledPath } from '@rummy/data';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteGame } from './games';
import { recomputeGame } from './recompute';
import { addGame, addRound, caught, clearDb, NOW, pts, seedLeague, testDb } from './testing';

const db = testDb();
beforeEach(clearDb);

async function gameWithRounds() {
  const { leagueId, profiles } = await seedLeague(db, ['u2']);
  const [a, b] = [profiles.admin!, profiles.u2!];
  const gameId = await addGame(db, leagueId, [a, b]);
  await addRound(db, leagueId, gameId, { seq: 1, winnerId: a, entries: { [b]: pts(10) } });
  await addRound(db, leagueId, gameId, { seq: 2, winnerId: a, entries: { [b]: pts(60) } });
  await recomputeGame(db, leagueId, gameId, NOW);
  return { leagueId, gameId, a, b };
}

const exists = async (path: string) => (await db.doc(path).get()).exists;
const count = async (path: string) => (await db.collection(path).get()).size;

describe('deleteGame', () => {
  it('removes the game and every one of its rounds', async () => {
    const { leagueId, gameId } = await gameWithRounds();
    expect(await count(roundsPath(leagueId, gameId))).toBe(2);

    await deleteGame(db, 'u2', { leagueId, gameId }, NOW);

    expect(await exists(`leagues/${leagueId}/games/${gameId}`)).toBe(false);
    expect(await count(roundsPath(leagueId, gameId))).toBe(0);
  });

  it('can be done by any member, not only the one who started the game', async () => {
    const { leagueId, gameId } = await gameWithRounds();
    await expect(deleteGame(db, 'admin', { leagueId, gameId }, NOW)).resolves.toBeUndefined();
  });

  it('leaves a log entry saying what was deleted and by whom', async () => {
    const { leagueId, gameId } = await gameWithRounds();
    await deleteGame(db, 'u2', { leagueId, gameId }, NOW + 7);

    const entries = (
      await db.collection(logPath(leagueId)).where('type', '==', 'gameDeleted').get()
    ).docs;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.data()).toMatchObject({
      by: 'u2',
      at: NOW + 7,
      details: { gameId, players: 2, rounds: 2, finished: true, startedAt: NOW },
    });
  });

  it('only removes the game it was asked to, and leaves other games and the league alone', async () => {
    const { leagueId, gameId, a, b } = await gameWithRounds();
    const other = await addGame(db, leagueId, [a, b]);
    await addRound(db, leagueId, other, { seq: 1, winnerId: a, entries: { [b]: pts(5) } });

    await deleteGame(db, 'u2', { leagueId, gameId }, NOW);

    expect(await exists(`leagues/${leagueId}/games/${other}`)).toBe(true);
    expect(await count(roundsPath(leagueId, other))).toBe(1);
    expect(await exists(`leagues/${leagueId}`)).toBe(true);
  });

  it('does not touch settled payments, which stop matching on their own', async () => {
    const { leagueId, gameId } = await gameWithRounds();
    await db.doc(`${settledPath(leagueId)}/2026-10-03_x_y_10`).set({
      day: '2026-10-03',
      from: 'x',
      to: 'y',
      amount: 10,
      by: 'u2',
      at: 1,
    });
    await deleteGame(db, 'u2', { leagueId, gameId }, NOW);
    expect(await count(settledPath(leagueId))).toBe(1);
  });

  it('deletes a game that is still in progress', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2']);
    const gameId = await addGame(db, leagueId, [profiles.admin!, profiles.u2!]);
    await deleteGame(db, 'admin', { leagueId, gameId }, NOW);
    expect(await exists(`leagues/${leagueId}/games/${gameId}`)).toBe(false);
  });

  it('is for league members only', async () => {
    const { leagueId, gameId } = await gameWithRounds();
    const err = await caught(() => deleteGame(db, 'stranger', { leagueId, gameId }, NOW));
    expect(err.code).toBe('permission-denied');
    expect(await exists(`leagues/${leagueId}/games/${gameId}`)).toBe(true);
    expect(await count(roundsPath(leagueId, gameId))).toBe(2);
  });

  it('says so when the game or the league does not exist', async () => {
    const { leagueId } = await gameWithRounds();
    const noGame = await caught(() => deleteGame(db, 'u2', { leagueId, gameId: 'missing' }, NOW));
    expect(noGame.code).toBe('not-found');
    const noLeague = await caught(() =>
      deleteGame(db, 'u2', { leagueId: 'nope', gameId: 'x' }, NOW),
    );
    expect(noLeague.code).toBe('not-found');
  });

  it('needs both ids', async () => {
    const err = await caught(() => deleteGame(db, 'u2', { leagueId: 'x', gameId: '' }, NOW));
    expect(err.code).toBe('invalid-argument');
  });
});
