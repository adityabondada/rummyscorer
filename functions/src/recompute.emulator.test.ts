import { gamePath, roundsPath } from '@rummy/data';
import { beforeEach, describe, expect, it } from 'vitest';
import { recomputeGame, recomputeLeague } from './recompute';
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

// With a limit of 50: round 1 puts C out, round 2 puts B out, so A wins the $30 pot.
async function finishedGame(leagueId: string, [a, b, c]: [string, string, string]) {
  const gameId = await addGame(db, leagueId, [a, b, c]);
  await addRound(db, leagueId, gameId, {
    seq: 1,
    winnerId: a,
    entries: { [b]: pts(10), [c]: pts(51) },
  });
  await addRound(db, leagueId, gameId, { seq: 2, winnerId: a, entries: { [b]: pts(45) } });
  return gameId;
}

describe('recomputeGame', () => {
  it('marks a finished game and caches its summary', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2', 'u3']);
    const [a, b, c] = [profiles.admin!, profiles.u2!, profiles.u3!];
    const gameId = await finishedGame(leagueId, [a, b, c]);

    expect(await recomputeGame(db, leagueId, gameId, NOW)).toBe('updated');
    const game = await readGame(db, leagueId, gameId);
    expect(game.status).toBe('finished');
    expect(game.summaryError).toBeNull();
    expect(game.summary).toMatchObject({
      outcome: 'outright',
      winnerIds: [a],
      pot: 30,
      rounds: 2,
      computedAt: NOW,
    });
    expect(game.summary.players[a]).toMatchObject({ net: 20, position: 1, roundsPlayed: 2 });
    expect(game.summary.players[b]).toMatchObject({ net: -10, position: 2 });
    expect(game.summary.players[c]).toMatchObject({ net: -10, position: 3, roundsPlayed: 1 });
  });

  it('leaves a game in progress without a summary', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2']);
    const gameId = await addGame(db, leagueId, [profiles.admin!, profiles.u2!]);
    await addRound(db, leagueId, gameId, {
      seq: 1,
      winnerId: profiles.admin!,
      entries: { [profiles.u2!]: pts(10) },
    });

    expect(await recomputeGame(db, leagueId, gameId, NOW)).toBe('unchanged');
    const game = await readGame(db, leagueId, gameId);
    expect(game).toMatchObject({ status: 'inProgress', summary: null, summaryError: null });
  });

  it('writes nothing when the result is the same', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2', 'u3']);
    const gameId = await finishedGame(leagueId, [profiles.admin!, profiles.u2!, profiles.u3!]);
    await recomputeGame(db, leagueId, gameId, NOW);

    expect(await recomputeGame(db, leagueId, gameId, NOW + 5000)).toBe('unchanged');
    expect((await readGame(db, leagueId, gameId)).summary.computedAt).toBe(NOW);
  });

  it('reopens the game and clears the summary when the last round is scrapped', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2', 'u3']);
    const [a, b, c] = [profiles.admin!, profiles.u2!, profiles.u3!];
    const gameId = await finishedGame(leagueId, [a, b, c]);
    await recomputeGame(db, leagueId, gameId, NOW);

    const rounds = await db.collection(roundsPath(leagueId, gameId)).where('seq', '==', 2).get();
    await rounds.docs[0]!.ref.update({ scrapped: { by: 'admin', at: NOW, reason: 'wrong score' } });

    expect(await recomputeGame(db, leagueId, gameId, NOW + 1)).toBe('updated');
    expect(await readGame(db, leagueId, gameId)).toMatchObject({
      status: 'inProgress',
      summary: null,
      summaryError: null,
    });
  });

  it('ends a game on an agreed split, and reopens it when the split goes', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2', 'u3']);
    const [a, b, c] = [profiles.admin!, profiles.u2!, profiles.u3!];
    const gameId = await addGame(db, leagueId, [a, b, c], {
      split: { afterSeq: 1, shares: { [a]: 18, [b]: 12 } },
    });
    await addRound(db, leagueId, gameId, {
      seq: 1,
      winnerId: a,
      entries: { [b]: pts(10), [c]: pts(51) },
    });

    await recomputeGame(db, leagueId, gameId, NOW);
    const split = await readGame(db, leagueId, gameId);
    expect(split.status).toBe('finished');
    expect(split.summary).toMatchObject({ outcome: 'split', winnerIds: [a, b], pot: 30 });
    expect(split.summary.players[a].net).toBe(8);
    expect(split.summary.players[b].net).toBe(2);

    await db.doc(gamePath(leagueId, gameId)).update({ split: null });
    await recomputeGame(db, leagueId, gameId, NOW + 1);
    expect(await readGame(db, leagueId, gameId)).toMatchObject({
      status: 'inProgress',
      summary: null,
    });
  });

  it('records why when the rounds are not a legal game', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2']);
    const gameId = await addGame(db, leagueId, [profiles.admin!, profiles.u2!]);
    await addRound(db, leagueId, gameId, { seq: 1, winnerId: 'someone-else', entries: {} });

    expect(await recomputeGame(db, leagueId, gameId, NOW)).toBe('updated');
    const game = await readGame(db, leagueId, gameId);
    expect(game.status).toBe('inProgress');
    expect(game.summary).toBeNull();
    expect(game.summaryError).toContain('not playing');
  });

  it('clears the error once the rounds are fixed', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2']);
    const gameId = await addGame(db, leagueId, [profiles.admin!, profiles.u2!]);
    const bad = await addRound(db, leagueId, gameId, { seq: 1, winnerId: 'nobody', entries: {} });
    await recomputeGame(db, leagueId, gameId, NOW);

    await db.doc(`${roundsPath(leagueId, gameId)}/${bad}`).update({
      winnerId: profiles.admin!,
      entries: { [profiles.u2!]: pts(10) },
    });
    await recomputeGame(db, leagueId, gameId, NOW + 1);
    expect((await readGame(db, leagueId, gameId)).summaryError).toBeNull();
  });

  it('records a malformed round as an error rather than failing', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2']);
    const gameId = await addGame(db, leagueId, [profiles.admin!, profiles.u2!]);
    await db.collection(roundsPath(leagueId, gameId)).add({ seq: 'one' });

    await recomputeGame(db, leagueId, gameId, NOW);
    expect((await readGame(db, leagueId, gameId)).summaryError).toContain('seq');
  });

  it('counts a merged guest as the member in the summary', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2', 'u3']);
    const guest = await addGuest(db, leagueId, 'Ravi');
    await db.doc(`leagues/${leagueId}/players/${guest}`).update({ mergedInto: profiles.u2! });
    const gameId = await finishedGame(leagueId, [profiles.admin!, guest, profiles.u3!]);

    await recomputeGame(db, leagueId, gameId, NOW);
    const { players } = (await readGame(db, leagueId, gameId)).summary;
    expect(Object.keys(players).sort()).toEqual(
      [profiles.admin!, profiles.u2!, profiles.u3!].sort(),
    );
    expect(players[profiles.u2!]).toMatchObject({ net: -10, position: 2 });
  });

  it('does nothing for a game that does not exist', async () => {
    const { leagueId } = await seedLeague(db);
    expect(await recomputeGame(db, leagueId, 'missing', NOW)).toBe('missing');
  });

  it('settings from a game are used as stored', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2']);
    const [a, b] = [profiles.admin!, profiles.u2!];
    const gameId = await addGame(db, leagueId, [a, b], { settings: smallSettings({ buyIn: 25 }) });
    await addRound(db, leagueId, gameId, { seq: 1, winnerId: a, entries: { [b]: pts(60) } });

    await recomputeGame(db, leagueId, gameId, NOW);
    expect((await readGame(db, leagueId, gameId)).summary).toMatchObject({ pot: 50 });
  });
});

describe('recomputeGame with penalty rounds', () => {
  it('finishes a game that was decided by penalties, with nobody credited with a win', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2', 'u3']);
    const [a, b, c] = [profiles.admin!, profiles.u2!, profiles.u3!];
    const gameId = await addGame(db, leagueId, [a, b, c]);
    // With a limit of 50: C is out after a 60 penalty, then B after a 55 penalty, so A wins.
    await addRound(db, leagueId, gameId, {
      seq: 1,
      winnerId: null,
      penalty: { playerId: c, points: 60, reason: 'wrongShow' },
      entries: { [a]: pts(0), [b]: pts(0) },
    });
    await addRound(db, leagueId, gameId, {
      seq: 2,
      winnerId: null,
      penalty: { playerId: b, points: 55, reason: 'error' },
      entries: { [a]: pts(0) },
    });

    expect(await recomputeGame(db, leagueId, gameId, NOW)).toBe('updated');
    const game = await readGame(db, leagueId, gameId);
    expect(game.status).toBe('finished');
    expect(game.summaryError).toBeNull();
    expect(game.summary).toMatchObject({ outcome: 'outright', winnerIds: [a], pot: 30, rounds: 2 });
    expect(game.summary.players[a]).toMatchObject({ net: 20, position: 1 });
    expect(game.summary.players[b]).toMatchObject({ net: -10, position: 2 });
    expect(game.summary.players[c]).toMatchObject({ net: -10, position: 3 });
  });

  it('records why when a penalty names someone who is not playing', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2']);
    const [a, b] = [profiles.admin!, profiles.u2!];
    const gameId = await addGame(db, leagueId, [a, b]);
    await addRound(db, leagueId, gameId, {
      seq: 1,
      winnerId: null,
      penalty: { playerId: 'someone-else', points: 20, reason: 'error' },
      entries: { [a]: pts(0), [b]: pts(0) },
    });
    expect(await recomputeGame(db, leagueId, gameId, NOW)).toBe('updated');
    const game = await readGame(db, leagueId, gameId);
    expect(game.status).toBe('inProgress');
    expect(game.summaryError).toContain('not playing');
  });
});

describe('recomputeLeague', () => {
  /** Takes the rounds-won numbers out of a finished game's summary, as old summaries lack them. */
  async function stripRoundStats(leagueId: string, gameId: string) {
    const ref = db.doc(gamePath(leagueId, gameId));
    const summary = (await ref.get()).data()!.summary;
    for (const p of Object.values<Record<string, unknown>>(summary.players)) {
      delete p.roundsWon;
      delete p.penalties;
    }
    await ref.update({ summary });
  }

  it('adds rounds won to the summaries of games finished before they were counted', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2', 'u3']);
    const [a, b, c] = [profiles.admin!, profiles.u2!, profiles.u3!];
    const first = await finishedGame(leagueId, [a, b, c]);
    const second = await finishedGame(leagueId, [a, b, c]);
    await recomputeGame(db, leagueId, first, NOW);
    await recomputeGame(db, leagueId, second, NOW);
    await stripRoundStats(leagueId, first);
    await stripRoundStats(leagueId, second);
    expect((await readGame(db, leagueId, first)).summary.players[a].roundsWon).toBeUndefined();

    expect(await recomputeLeague(db, 'admin', { leagueId }, NOW)).toEqual({ games: 2, updated: 2 });
    for (const gameId of [first, second]) {
      const players = (await readGame(db, leagueId, gameId)).summary.players;
      expect(players[a]).toMatchObject({ roundsWon: 2, penalties: 0 });
      expect(players[b]).toMatchObject({ roundsWon: 0 });
    }
  });

  it('leaves games that are already right alone, so running it again changes nothing', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2', 'u3']);
    const gameId = await finishedGame(leagueId, [profiles.admin!, profiles.u2!, profiles.u3!]);
    await recomputeGame(db, leagueId, gameId, NOW);
    expect(await recomputeLeague(db, 'admin', { leagueId }, NOW)).toEqual({ games: 1, updated: 0 });
  });

  it('skips games still being played', async () => {
    const { leagueId, profiles } = await seedLeague(db, ['u2']);
    await addGame(db, leagueId, [profiles.admin!, profiles.u2!]);
    expect(await recomputeLeague(db, 'admin', { leagueId }, NOW)).toEqual({ games: 0, updated: 0 });
  });

  it('is for members only', async () => {
    const { leagueId } = await seedLeague(db, ['u2']);
    const error = await caught(() => recomputeLeague(db, 'stranger', { leagueId }, NOW));
    expect(error).toMatchObject({ code: 'permission-denied' });
  });
});
