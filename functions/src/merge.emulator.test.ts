import { logPath } from '@rummy/data';
import { beforeEach, describe, expect, it } from 'vitest';
import { mergePlayers, unmergePlayers } from './merge';
import { recomputeGame } from './recompute';
import {
  addGame,
  addGuest,
  addRound,
  caught,
  clearDb,
  NOW,
  pts,
  readGame,
  readPlayer,
  seedLeague,
  testDb,
} from './testing';

const db = testDb();
beforeEach(clearDb);

// A finished game: the first player wins, the other two go out.
async function finishedGame(leagueId: string, [a, b, c]: [string, string, string]) {
  const gameId = await addGame(db, leagueId, [a, b, c]);
  await addRound(db, leagueId, gameId, {
    seq: 1,
    winnerId: a,
    entries: { [b]: pts(10), [c]: pts(51) },
  });
  await addRound(db, leagueId, gameId, { seq: 2, winnerId: a, entries: { [b]: pts(45) } });
  await recomputeGame(db, leagueId, gameId, NOW);
  return gameId;
}

const logged = async (leagueId: string, type: string) =>
  (await db.collection(logPath(leagueId)).where('type', '==', type).get()).docs.map((d) =>
    d.data(),
  );

async function setup() {
  const league = await seedLeague(db, ['u2', 'u3']);
  const guest = await addGuest(db, league.leagueId, 'Ravi');
  return {
    ...league,
    guest,
    member: league.profiles.u2!,
    admin: league.profiles.admin!,
    other: league.profiles.u3!,
  };
}

describe('mergePlayers', () => {
  it('links the guest to the member and logs it', async () => {
    const { leagueId, guest, member } = await setup();
    await mergePlayers(db, 'u2', { leagueId, guestId: guest, targetId: member }, NOW);

    expect((await readPlayer(db, leagueId, guest)).mergedInto).toBe(member);
    expect(await logged(leagueId, 'playerMerged')).toMatchObject([
      { by: 'u2', details: { guestId: guest, targetId: member } },
    ]);
  });

  it('can be done by any member, for any member', async () => {
    const { leagueId, guest, member } = await setup();
    await mergePlayers(db, 'u3', { leagueId, guestId: guest, targetId: member }, NOW);
    expect((await readPlayer(db, leagueId, guest)).mergedInto).toBe(member);
  });

  it("moves the guest's games over to the member in the cached summaries", async () => {
    const { leagueId, guest, member, admin, other } = await setup();
    const gameId = await finishedGame(leagueId, [admin, guest, other]);
    expect(Object.keys((await readGame(db, leagueId, gameId)).summary.players)).toContain(guest);

    const result = await mergePlayers(
      db,
      'u2',
      { leagueId, guestId: guest, targetId: member },
      NOW + 1,
    );
    expect(result.gamesUpdated).toBe(1);
    const { players } = (await readGame(db, leagueId, gameId)).summary;
    expect(Object.keys(players)).not.toContain(guest);
    expect(players[member]).toMatchObject({ net: -10, position: 2 });
  });

  it('combines histories when the member already has games of their own', async () => {
    const { leagueId, guest, member, admin, other } = await setup();
    const guestGame = await finishedGame(leagueId, [admin, guest, other]);
    const memberGame = await finishedGame(leagueId, [member, admin, other]);

    await mergePlayers(db, 'u2', { leagueId, guestId: guest, targetId: member }, NOW + 1);
    expect((await readGame(db, leagueId, guestGame)).summary.players[member]).toBeDefined();
    expect((await readGame(db, leagueId, memberGame)).summary.players[member]).toMatchObject({
      position: 1,
    });
  });

  it('is blocked if both profiles played in the same game, and changes nothing', async () => {
    const { leagueId, guest, member, admin } = await setup();
    const gameId = await finishedGame(leagueId, [admin, guest, member]);

    const err = await caught(() =>
      mergePlayers(db, 'u2', { leagueId, guestId: guest, targetId: member }, NOW),
    );
    expect(err.code).toBe('failed-precondition');
    expect(err.message).toContain(gameId);
    expect((await readPlayer(db, leagueId, guest)).mergedInto).toBeNull();
    expect(await logged(leagueId, 'playerMerged')).toHaveLength(0);
  });

  it('is blocked if a guest already merged into the member played in the same game', async () => {
    const { leagueId, guest, member, admin } = await setup();
    const earlier = await addGuest(db, leagueId, 'Ravi K');
    await mergePlayers(db, 'u2', { leagueId, guestId: earlier, targetId: member }, NOW);
    await finishedGame(leagueId, [admin, guest, earlier]);

    const err = await caught(() =>
      mergePlayers(db, 'u2', { leagueId, guestId: guest, targetId: member }, NOW),
    );
    expect(err.code).toBe('failed-precondition');
  });

  it("refuses to merge a member's own profile away", async () => {
    const { leagueId, member, other } = await setup();
    const err = await caught(() =>
      mergePlayers(db, 'u2', { leagueId, guestId: member, targetId: other }, NOW),
    );
    expect(err.code).toBe('failed-precondition');
    expect(err.message).toContain("member's own profile");
  });

  it('only merges into a member, never into another guest', async () => {
    const { leagueId, guest } = await setup();
    const another = await addGuest(db, leagueId, 'Sam');
    const err = await caught(() =>
      mergePlayers(db, 'u2', { leagueId, guestId: guest, targetId: another }, NOW),
    );
    expect(err.code).toBe('failed-precondition');
    expect(err.message).toContain('into a member');
  });

  it('refuses a guest that is already merged', async () => {
    const { leagueId, guest, member, other } = await setup();
    await mergePlayers(db, 'u2', { leagueId, guestId: guest, targetId: member }, NOW);
    const err = await caught(() =>
      mergePlayers(db, 'u2', { leagueId, guestId: guest, targetId: other }, NOW),
    );
    expect(err.code).toBe('failed-precondition');
  });

  it('is for league members only', async () => {
    const { leagueId, guest, member } = await setup();
    const err = await caught(() =>
      mergePlayers(db, 'stranger', { leagueId, guestId: guest, targetId: member }, NOW),
    );
    expect(err.code).toBe('permission-denied');
  });

  it('needs players that exist', async () => {
    const { leagueId, guest } = await setup();
    const err = await caught(() =>
      mergePlayers(db, 'u2', { leagueId, guestId: guest, targetId: 'nobody' }, NOW),
    );
    expect(err.code).toBe('not-found');
  });
});

describe('unmergePlayers', () => {
  it('makes the guest their own profile again and puts their games back', async () => {
    const { leagueId, guest, member, admin, other } = await setup();
    const gameId = await finishedGame(leagueId, [admin, guest, other]);
    await mergePlayers(db, 'u2', { leagueId, guestId: guest, targetId: member }, NOW + 1);

    const result = await unmergePlayers(db, 'u3', { leagueId, guestId: guest }, NOW + 2);
    expect(result.gamesUpdated).toBe(1);
    expect((await readPlayer(db, leagueId, guest)).mergedInto).toBeNull();
    const { players } = (await readGame(db, leagueId, gameId)).summary;
    expect(players[guest]).toMatchObject({ net: -10, position: 2 });
    expect(players[member]).toBeUndefined();
    expect(await logged(leagueId, 'playerUnmerged')).toMatchObject([
      { by: 'u3', details: { guestId: guest, wasMergedInto: member } },
    ]);
  });

  it('can be merged again afterwards, into someone else', async () => {
    const { leagueId, guest, member, other } = await setup();
    await mergePlayers(db, 'u2', { leagueId, guestId: guest, targetId: member }, NOW);
    await unmergePlayers(db, 'u2', { leagueId, guestId: guest }, NOW);
    await mergePlayers(db, 'u2', { leagueId, guestId: guest, targetId: other }, NOW);
    expect((await readPlayer(db, leagueId, guest)).mergedInto).toBe(other);
  });

  it('only applies to a guest that is merged', async () => {
    const { leagueId, guest } = await setup();
    const err = await caught(() => unmergePlayers(db, 'u2', { leagueId, guestId: guest }, NOW));
    expect(err.code).toBe('failed-precondition');
  });

  it('is for league members only, and needs a real player', async () => {
    const { leagueId, guest, member } = await setup();
    await mergePlayers(db, 'u2', { leagueId, guestId: guest, targetId: member }, NOW);
    const stranger = await caught(() =>
      unmergePlayers(db, 'stranger', { leagueId, guestId: guest }, NOW),
    );
    expect(stranger.code).toBe('permission-denied');
    const missing = await caught(() =>
      unmergePlayers(db, 'u2', { leagueId, guestId: 'nobody' }, NOW),
    );
    expect(missing.code).toBe('not-found');
  });
});
