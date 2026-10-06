import { logPath, parseLeague, parsePlayer, playersPath, leaguePath } from '@rummy/data';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createLeague,
  inviteInfo,
  joinLeague,
  regenerateInvite,
  removeMember,
  removePlayer,
  setAdmin,
} from './leagues';
import { CODE_LENGTH } from './inviteCode';
import { addGame, addGuest, caught, clearDb, NOW, readPlayer, seedLeague, testDb } from './testing';

const db = testDb();
beforeEach(clearDb);

const readLeague = async (id: string) => parseLeague((await db.doc(leaguePath(id)).get()).data());
const logTypes = async (id: string) =>
  (await db.collection(logPath(id)).get()).docs.map((d) => d.data().type).sort();

describe('createLeague', () => {
  it('makes the caller the admin and only member, with a profile of their own', async () => {
    const { leagueId, inviteCode, playerId } = await createLeague(
      db,
      'u1',
      { name: '  Friday Rummy ', displayName: 'Aditya' },
      NOW,
    );
    expect(await readLeague(leagueId)).toEqual({
      name: 'Friday Rummy',
      adminUid: 'u1',
      adminUids: [],
      inviteCode,
      memberUids: ['u1'],
      createdAt: NOW,
    });
    expect(inviteCode).toHaveLength(CODE_LENGTH);
    expect(await readPlayer(db, leagueId, playerId)).toMatchObject({
      name: 'Aditya',
      linkedUid: 'u1',
      retired: false,
      mergedInto: null,
    });
    expect(await logTypes(leagueId)).toEqual(['memberJoined']);
  });

  it('needs a league name and a display name', async () => {
    const bad = { name: '', displayName: 'A' };
    expect((await caught(() => createLeague(db, 'u1', bad, NOW))).code).toBe('invalid-argument');
    const noName = { name: 'L', displayName: undefined };
    expect((await caught(() => createLeague(db, 'u1', noName, NOW))).code).toBe('invalid-argument');
  });

  it('gives different leagues different codes', async () => {
    const a = await seedLeague(db);
    const b = await seedLeague(db);
    expect(a.inviteCode).not.toBe(b.inviteCode);
  });
});

describe('joinLeague', () => {
  it('adds the caller as a member with their own profile and logs it', async () => {
    const { leagueId, inviteCode } = await seedLeague(db);
    const { playerId } = await joinLeague(db, 'u2', { code: inviteCode, displayName: 'Ravi' }, NOW);

    expect((await readLeague(leagueId)).memberUids).toEqual(['admin', 'u2']);
    expect(parsePlayer(await readPlayer(db, leagueId, playerId))).toMatchObject({
      name: 'Ravi',
      linkedUid: 'u2',
    });
    expect(await logTypes(leagueId)).toEqual(['memberJoined', 'memberJoined']);
  });

  it('accepts the code in lower case with spaces or dashes', async () => {
    const { leagueId, inviteCode } = await seedLeague(db);
    const typed = `${inviteCode.slice(0, 4)}-${inviteCode.slice(4)}`.toLowerCase();
    await joinLeague(db, 'u2', { code: ` ${typed} `, displayName: 'Ravi' }, NOW);
    expect((await readLeague(leagueId)).memberUids).toContain('u2');
  });

  it('is harmless to do twice', async () => {
    const { leagueId, inviteCode } = await seedLeague(db);
    const first = await joinLeague(db, 'u2', { code: inviteCode, displayName: 'Ravi' }, NOW);
    const second = await joinLeague(db, 'u2', { code: inviteCode, displayName: 'Ravi' }, NOW);
    expect(second.playerId).toBe(first.playerId);
    expect((await readLeague(leagueId)).memberUids).toEqual(['admin', 'u2']);
    const profiles = await db
      .collection(playersPath(leagueId))
      .where('linkedUid', '==', 'u2')
      .get();
    expect(profiles.size).toBe(1);
  });

  it('rejects a code that does not exist, or no code at all', async () => {
    await seedLeague(db);
    const wrong = await caught(() =>
      joinLeague(db, 'u2', { code: 'NOPE0000', displayName: 'R' }, NOW),
    );
    expect(wrong.code).toBe('not-found');
    const none = await caught(() =>
      joinLeague(db, 'u2', { code: undefined, displayName: 'R' }, NOW),
    );
    expect(none.code).toBe('invalid-argument');
    const blank = await caught(() => joinLeague(db, 'u2', { code: ' - ', displayName: 'R' }, NOW));
    expect(blank.code).toBe('not-found');
  });

  it('needs a display name', async () => {
    const { inviteCode } = await seedLeague(db);
    const err = await caught(() =>
      joinLeague(db, 'u2', { code: inviteCode, displayName: '' }, NOW),
    );
    expect(err.code).toBe('invalid-argument');
  });

  it('brings back the old profile for someone who was removed and rejoins', async () => {
    const { leagueId, inviteCode, profiles } = await seedLeague(db, ['u2']);
    await removeMember(db, 'admin', { leagueId, memberUid: 'u2' }, NOW);
    expect((await readPlayer(db, leagueId, profiles.u2!)).retired).toBe(true);

    const again = await joinLeague(db, 'u2', { code: inviteCode, displayName: 'Ravi' }, NOW);
    expect(again.playerId).toBe(profiles.u2);
    expect((await readPlayer(db, leagueId, profiles.u2!)).retired).toBe(false);
    expect((await readLeague(leagueId)).memberUids).toContain('u2');
  });
});

describe('inviteInfo', () => {
  it('gives the league name and how many people are in it, and nothing else', async () => {
    const { inviteCode } = await seedLeague(db, ['u2', 'u3']);
    const info = await inviteInfo(db, { code: inviteCode });
    expect(info).toEqual({ leagueName: 'Friday Rummy', members: 3 });
  });

  it('accepts the code in lower case with spaces or dashes, as joining does', async () => {
    const { inviteCode } = await seedLeague(db);
    const messy = `${inviteCode.slice(0, 4)}-${inviteCode.slice(4)}`.toLowerCase();
    expect(await inviteInfo(db, { code: messy })).toMatchObject({ leagueName: 'Friday Rummy' });
  });

  it('counts people as they join', async () => {
    const { inviteCode } = await seedLeague(db);
    await joinLeague(db, 'u9', { code: inviteCode, displayName: 'Ravi' }, NOW);
    expect(await inviteInfo(db, { code: inviteCode })).toMatchObject({ members: 2 });
  });

  it('says not found for a code that does not exist, is blank, or was replaced', async () => {
    const { leagueId, inviteCode } = await seedLeague(db);
    for (const code of ['NOSUCHCD', '', '  -- ']) {
      expect(await caught(() => inviteInfo(db, { code }))).toMatchObject({ code: 'not-found' });
    }
    await regenerateInvite(db, 'admin', { leagueId }, NOW);
    expect(await caught(() => inviteInfo(db, { code: inviteCode }))).toMatchObject({
      code: 'not-found',
    });
  });

  it('needs a code', async () => {
    expect(await caught(() => inviteInfo(db, { code: undefined }))).toMatchObject({
      code: 'invalid-argument',
    });
  });
});

describe('regenerateInvite', () => {
  it('replaces the code so the old one stops working, and logs it', async () => {
    const { leagueId, inviteCode } = await seedLeague(db);
    const fresh = await regenerateInvite(db, 'admin', { leagueId }, NOW);

    expect(fresh.inviteCode).not.toBe(inviteCode);
    expect((await readLeague(leagueId)).inviteCode).toBe(fresh.inviteCode);
    const old = await caught(() =>
      joinLeague(db, 'u2', { code: inviteCode, displayName: 'R' }, NOW),
    );
    expect(old.code).toBe('not-found');
    await joinLeague(db, 'u2', { code: fresh.inviteCode, displayName: 'R' }, NOW);
    expect(await logTypes(leagueId)).toContain('inviteRegenerated');
  });

  it('is for the admin only', async () => {
    const { leagueId } = await seedLeague(db, ['u2']);
    const member = await caught(() => regenerateInvite(db, 'u2', { leagueId }, NOW));
    expect(member.code).toBe('permission-denied');
    const stranger = await caught(() => regenerateInvite(db, 'zed', { leagueId }, NOW));
    expect(stranger.code).toBe('permission-denied');
  });

  it('needs a league that exists', async () => {
    const err = await caught(() => regenerateInvite(db, 'admin', { leagueId: 'missing' }, NOW));
    expect(err.code).toBe('not-found');
  });
});

describe('removeMember', () => {
  it('takes them out of the league, retires their profile and logs it', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2', 'u3']);
    await removeMember(db, 'admin', { leagueId, memberUid: 'u2' }, NOW);

    expect((await readLeague(leagueId)).memberUids).toEqual(['admin', 'u3']);
    expect(await readPlayer(db, leagueId, profiles.u2!)).toMatchObject({
      retired: true,
      linkedUid: 'u2',
    });
    expect(await readPlayer(db, leagueId, profiles.u3!)).toMatchObject({ retired: false });
    expect(await logTypes(leagueId)).toContain('memberRemoved');
  });

  it('is for the admin only', async () => {
    const { leagueId } = await seedLeague(db, ['u2', 'u3']);
    const err = await caught(() => removeMember(db, 'u2', { leagueId, memberUid: 'u3' }, NOW));
    expect(err.code).toBe('permission-denied');
  });

  it('cannot remove the admin', async () => {
    const { leagueId } = await seedLeague(db);
    const err = await caught(() =>
      removeMember(db, 'admin', { leagueId, memberUid: 'admin' }, NOW),
    );
    expect(err.code).toBe('failed-precondition');
  });

  it('needs someone who is a member', async () => {
    const { leagueId } = await seedLeague(db);
    const err = await caught(() => removeMember(db, 'admin', { leagueId, memberUid: 'zed' }, NOW));
    expect(err.code).toBe('not-found');
  });
});

describe('setAdmin', () => {
  it('makes a member an admin, who can then do what an admin can, and logs it', async () => {
    const { leagueId } = await seedLeague(db, ['u2', 'u3']);
    await setAdmin(db, 'admin', { leagueId, memberUid: 'u2', admin: true }, NOW);

    expect((await readLeague(leagueId)).adminUids).toEqual(['u2']);
    await expect(regenerateInvite(db, 'u2', { leagueId }, NOW)).resolves.toBeDefined();
    expect(await logTypes(leagueId)).toContain('adminChanged');
  });

  it('lets a new admin make others admins too', async () => {
    const { leagueId } = await seedLeague(db, ['u2', 'u3']);
    await setAdmin(db, 'admin', { leagueId, memberUid: 'u2', admin: true }, NOW);
    await setAdmin(db, 'u2', { leagueId, memberUid: 'u3', admin: true }, NOW);
    expect((await readLeague(leagueId)).adminUids.sort()).toEqual(['u2', 'u3']);
  });

  it('takes it away again, and promoting twice changes nothing', async () => {
    const { leagueId } = await seedLeague(db, ['u2']);
    await setAdmin(db, 'admin', { leagueId, memberUid: 'u2', admin: true }, NOW);
    await setAdmin(db, 'admin', { leagueId, memberUid: 'u2', admin: true }, NOW);
    expect((await readLeague(leagueId)).adminUids).toEqual(['u2']);
    await setAdmin(db, 'admin', { leagueId, memberUid: 'u2', admin: false }, NOW);
    expect((await readLeague(leagueId)).adminUids).toEqual([]);
    const err = await caught(() => regenerateInvite(db, 'u2', { leagueId }, NOW));
    expect(err.code).toBe('permission-denied');
  });

  it('is for admins only', async () => {
    const { leagueId } = await seedLeague(db, ['u2', 'u3']);
    const err = await caught(() =>
      setAdmin(db, 'u2', { leagueId, memberUid: 'u3', admin: true }, NOW),
    );
    expect(err.code).toBe('permission-denied');
  });

  it('never changes the person who made the league', async () => {
    const { leagueId } = await seedLeague(db, ['u2']);
    await setAdmin(db, 'admin', { leagueId, memberUid: 'u2', admin: true }, NOW);
    const err = await caught(() =>
      setAdmin(db, 'u2', { leagueId, memberUid: 'admin', admin: false }, NOW),
    );
    expect(err.code).toBe('failed-precondition');
  });

  it('needs a member, and a true or false', async () => {
    const { leagueId } = await seedLeague(db);
    const none = await caught(() =>
      setAdmin(db, 'admin', { leagueId, memberUid: 'zed', admin: true }, NOW),
    );
    expect(none.code).toBe('not-found');
    const bad = await caught(() =>
      setAdmin(db, 'admin', { leagueId, memberUid: 'zed', admin: 'yes' }, NOW),
    );
    expect(bad.code).toBe('invalid-argument');
  });

  it('stops counting someone who is no longer a member', async () => {
    const { leagueId } = await seedLeague(db, ['u2']);
    await setAdmin(db, 'admin', { leagueId, memberUid: 'u2', admin: true }, NOW);
    await setAdmin(db, 'admin', { leagueId, memberUid: 'u2', admin: false }, NOW);
    await removeMember(db, 'admin', { leagueId, memberUid: 'u2' }, NOW);
    const err = await caught(() => regenerateInvite(db, 'u2', { leagueId }, NOW));
    expect(err.code).toBe('permission-denied');
  });
});

describe('removeMember and admins', () => {
  it('can be done by an admin who is not the owner', async () => {
    const { leagueId } = await seedLeague(db, ['u2', 'u3']);
    await setAdmin(db, 'admin', { leagueId, memberUid: 'u2', admin: true }, NOW);
    await removeMember(db, 'u2', { leagueId, memberUid: 'u3' }, NOW);
    expect((await readLeague(leagueId)).memberUids).toEqual(['admin', 'u2']);
  });

  it('refuses to remove an admin until they are made a regular member', async () => {
    const { leagueId } = await seedLeague(db, ['u2']);
    await setAdmin(db, 'admin', { leagueId, memberUid: 'u2', admin: true }, NOW);
    const err = await caught(() => removeMember(db, 'admin', { leagueId, memberUid: 'u2' }, NOW));
    expect(err.code).toBe('failed-precondition');
    await setAdmin(db, 'admin', { leagueId, memberUid: 'u2', admin: false }, NOW);
    await removeMember(db, 'admin', { leagueId, memberUid: 'u2' }, NOW);
    expect((await readLeague(leagueId)).memberUids).toEqual(['admin']);
  });
});

describe('removePlayer', () => {
  it('removes a guest who was never in a game, and logs it', async () => {
    const { leagueId } = await seedLeague(db);
    const guest = await addGuest(db, leagueId, 'Eli');
    await removePlayer(db, 'admin', { leagueId, playerId: guest }, NOW);

    expect((await db.doc(`leagues/${leagueId}/players/${guest}`).get()).exists).toBe(false);
    expect(await logTypes(leagueId)).toContain('playerRemoved');
  });

  it('keeps a guest who has played, so the games still add up', async () => {
    const { leagueId, profiles } = await seedLeague(db);
    const guest = await addGuest(db, leagueId, 'Eli');
    await addGame(db, leagueId, [profiles.admin!, guest]);
    const err = await caught(() => removePlayer(db, 'admin', { leagueId, playerId: guest }, NOW));
    expect(err.code).toBe('failed-precondition');
    expect((await db.doc(`leagues/${leagueId}/players/${guest}`).get()).exists).toBe(true);
  });

  it('keeps a guest that someone was merged into', async () => {
    const { leagueId } = await seedLeague(db);
    const guest = await addGuest(db, leagueId, 'Eli');
    const other = await addGuest(db, leagueId, 'Eli (old)');
    await db.doc(`leagues/${leagueId}/players/${other}`).update({ mergedInto: guest });
    const err = await caught(() => removePlayer(db, 'admin', { leagueId, playerId: guest }, NOW));
    expect(err.code).toBe('failed-precondition');
  });

  it('is not for members, who are removed from the league instead', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2']);
    const err = await caught(() =>
      removePlayer(db, 'admin', { leagueId, playerId: profiles.u2! }, NOW),
    );
    expect(err.code).toBe('failed-precondition');
  });

  it('is for admins only, and needs a player that exists', async () => {
    const { leagueId } = await seedLeague(db, ['u2']);
    const guest = await addGuest(db, leagueId, 'Eli');
    const denied = await caught(() => removePlayer(db, 'u2', { leagueId, playerId: guest }, NOW));
    expect(denied.code).toBe('permission-denied');
    const missing = await caught(() =>
      removePlayer(db, 'admin', { leagueId, playerId: 'nope' }, NOW),
    );
    expect(missing.code).toBe('not-found');
  });
});
