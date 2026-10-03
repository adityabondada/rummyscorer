import { gamePath, sharePath } from '@rummy/data';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteGame } from './games';
import { mergePlayers } from './merge';
import { gameView, shareGame } from './share';
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
  smallSettings,
  testDb,
} from './testing';

const db = testDb();
beforeEach(clearDb);

async function setup() {
  const { leagueId, profiles } = await seedLeague(db, ['u2']);
  const [a, b] = [profiles.admin!, profiles.u2!];
  const gameId = await addGame(db, leagueId, [a, b], { settings: smallSettings() });
  await addRound(db, leagueId, gameId, { seq: 1, winnerId: a, entries: { [b]: pts(10) } });
  return { leagueId, gameId, a, b };
}

const on = (leagueId: string, gameId: string, uid = 'admin') =>
  shareGame(db, uid, { leagueId, gameId, enable: true }, NOW);
const off = (leagueId: string, gameId: string, uid = 'admin') =>
  shareGame(db, uid, { leagueId, gameId, enable: false }, NOW);
const exists = async (code: string) => (await db.doc(sharePath(code)).get()).exists;

describe('shareGame', () => {
  it('switches the link on: a code that cannot be guessed, kept on the game and pointing back at it', async () => {
    const { leagueId, gameId } = await setup();
    const { shareCode } = await on(leagueId, gameId);
    expect(shareCode).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await readGame(db, leagueId, gameId)).shareCode).toBe(shareCode);
    expect((await db.doc(sharePath(shareCode!)).get()).data()).toEqual({
      leagueId,
      gameId,
      createdBy: 'admin',
      createdAt: NOW,
    });
  });

  it('gives different games different codes', async () => {
    const { leagueId, gameId, a, b } = await setup();
    const other = await addGame(db, leagueId, [a, b]);
    expect((await on(leagueId, gameId)).shareCode).not.toBe((await on(leagueId, other)).shareCode);
  });

  it('gives back the same link when switched on twice, without making a second one', async () => {
    const { leagueId, gameId } = await setup();
    const first = await on(leagueId, gameId);
    const second = await on(leagueId, gameId, 'u2');
    expect(second).toEqual(first);
    expect((await db.collection('shares').get()).size).toBe(1);
  });

  it('switches it off: the link stops existing, and a new one is a different link', async () => {
    const { leagueId, gameId } = await setup();
    const { shareCode } = await on(leagueId, gameId);
    expect(await off(leagueId, gameId)).toEqual({ shareCode: null });
    expect(await exists(shareCode!)).toBe(false);
    expect((await readGame(db, leagueId, gameId)).shareCode).toBeNull();
    expect((await on(leagueId, gameId)).shareCode).not.toBe(shareCode);
  });

  it('is harmless to switch off when there is no link', async () => {
    const { leagueId, gameId } = await setup();
    expect(await off(leagueId, gameId)).toEqual({ shareCode: null });
  });

  it('is for members only', async () => {
    const { leagueId, gameId } = await setup();
    expect(await caught(() => on(leagueId, gameId, 'stranger'))).toMatchObject({
      code: 'permission-denied',
    });
    expect((await db.collection('shares').get()).size).toBe(0);
  });

  it('needs a game that exists, and a clear on or off', async () => {
    const { leagueId, gameId } = await setup();
    expect(await caught(() => on(leagueId, 'missing'))).toMatchObject({ code: 'not-found' });
    const unclear = () => shareGame(db, 'admin', { leagueId, gameId, enable: 'yes' }, NOW);
    expect(await caught(unclear)).toMatchObject({ code: 'invalid-argument' });
  });

  it('does not touch the game s status or summary', async () => {
    const { leagueId, gameId } = await setup();
    const before = await readGame(db, leagueId, gameId);
    await on(leagueId, gameId);
    const after = await readGame(db, leagueId, gameId);
    expect({ ...after, shareCode: undefined }).toEqual({ ...before, shareCode: undefined });
  });
});

describe('gameView', () => {
  it('shows the league, the names and the scores for anyone with the link', async () => {
    const { leagueId, gameId, a, b } = await setup();
    const { shareCode } = await on(leagueId, gameId);
    const view = await gameView(db, { code: shareCode });
    expect(view.leagueName).toBe('Friday Rummy');
    expect(view.names).toEqual({ [a]: 'Admin', [b]: 'U2' });
    expect(view.state.status).toBe('inProgress');
    expect(view.state.players[b]).toMatchObject({ total: 10, active: true });
    expect(view.state.rounds).toHaveLength(1);
    expect(view.startedAt).toBeGreaterThan(0);
  });

  it('follows the game as rounds are added, and shows the result when it ends', async () => {
    const { leagueId, gameId, a, b } = await setup();
    const { shareCode } = await on(leagueId, gameId);
    await addRound(db, leagueId, gameId, { seq: 2, winnerId: a, entries: { [b]: pts(60) } });
    const view = await gameView(db, { code: shareCode });
    expect(view.state.status).toBe('finished');
    expect(view.state.winnerIds).toEqual([a]);
  });

  it('leaves out scrapped rounds', async () => {
    const { leagueId, gameId, a, b } = await setup();
    await addRound(
      db,
      leagueId,
      gameId,
      { seq: 2, winnerId: b, entries: { [a]: pts(25) } },
      { by: 'admin', at: NOW, reason: 'typo' },
    );
    const { shareCode } = await on(leagueId, gameId);
    const view = await gameView(db, { code: shareCode });
    expect(view.state.players[a]!.total).toBe(0);
  });

  it('shows a guest who was merged into a member under the member s name', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2']);
    const guest = await addGuest(db, leagueId, 'Old guest name');
    const gameId = await addGame(db, leagueId, [guest, profiles.admin!]);
    await addRound(db, leagueId, gameId, {
      seq: 1,
      winnerId: profiles.admin!,
      entries: { [guest]: pts(5) },
    });
    await mergePlayers(db, 'admin', { leagueId, guestId: guest, targetId: profiles.u2! }, NOW);
    const { shareCode } = await on(leagueId, gameId);
    const view = await gameView(db, { code: shareCode });
    expect(Object.values(view.names).sort()).toEqual(['Admin', 'U2']);
    expect(JSON.stringify(view)).not.toContain('Old guest name');
  });

  it('gives away no account ids, and nothing about other members', async () => {
    const { leagueId, gameId } = await setup();
    const { shareCode } = await on(leagueId, gameId);
    const text = JSON.stringify(await gameView(db, { code: shareCode }));
    expect(text).not.toContain('"admin"');
    expect(text).not.toContain('u2');
    expect(text).not.toContain('inviteCode');
    expect(text).not.toContain(leagueId);
    expect(text).not.toContain(shareCode!);
  });

  it('says not found for a code that is wrong, malformed, or switched off', async () => {
    const { leagueId, gameId } = await setup();
    const { shareCode } = await on(leagueId, gameId);
    await off(leagueId, gameId);
    const codes: unknown[] = [
      shareCode,
      'x'.repeat(22),
      'short',
      '../leagues/abc',
      'a/b/c/d/e/f/g/h/i/j/k/l',
      '',
      undefined,
      42,
    ];
    for (const code of codes) {
      expect(await caught(() => gameView(db, { code })), String(code)).toMatchObject({
        code: 'not-found',
      });
    }
  });

  it('stops working when the game is deleted, and the deletion removes the link', async () => {
    const { leagueId, gameId } = await setup();
    const { shareCode } = await on(leagueId, gameId);
    await deleteGame(db, 'admin', { leagueId, gameId }, NOW);
    expect(await exists(shareCode!)).toBe(false);
    expect((await db.doc(gamePath(leagueId, gameId)).get()).exists).toBe(false);
    expect(await caught(() => gameView(db, { code: shareCode }))).toMatchObject({
      code: 'not-found',
    });
  });

  it('says so, without leaking details, when the rounds are not a legal game', async () => {
    const { leagueId, gameId } = await setup();
    const { shareCode } = await on(leagueId, gameId);
    await addRound(db, leagueId, gameId, { seq: 2, winnerId: 'someone-else', entries: {} });
    const error = await caught(() => gameView(db, { code: shareCode }));
    expect(error).toMatchObject({
      code: 'failed-precondition',
      message: 'This game can not be shown right now',
    });
  });
});
