import { DEFAULT_SETTINGS, replay, type GameState, type Round } from '@rummy/engine';
import { describe, expect, it } from 'vitest';
import { buildRecap } from './recap';

const names = { a: 'Asha', b: 'Bo', c: 'Cy' };
const pts = (points: number) => ({ kind: 'points' as const, points });

const play = (rounds: Round[], settings = {}): GameState =>
  replay({
    settings: { ...DEFAULT_SETTINGS, limit: 50, maxRoundPenalty: null, buyIn: 10, ...settings },
    seatOrder: ['c', 'a', 'b'],
    rounds,
  });

/** Asha goes out, buys back in, and goes out again. Bo wins. */
const outTwice = () =>
  play([
    {
      seq: 1,
      winnerId: 'b',
      entries: { a: pts(60), c: pts(10) },
      rejoins: [{ playerId: 'a', seatIndex: 1 }],
    },
    { seq: 2, winnerId: 'b', entries: { a: pts(45), c: pts(5) } },
    { seq: 3, winnerId: 'b', entries: { c: pts(50) } },
  ]);

/** Asha goes out, comes back and wins. */
const rejoinWin = () =>
  play([
    {
      seq: 1,
      winnerId: 'b',
      entries: { a: pts(60), c: pts(10) },
      rejoins: [{ playerId: 'a', seatIndex: 1 }],
    },
    { seq: 2, winnerId: 'a', entries: { b: pts(55), c: pts(40) } },
    { seq: 3, winnerId: 'a', entries: { c: pts(5) } },
  ]);

/** Asha is 40 behind after round 1, then wins. */
const comeback = () =>
  play([
    { seq: 1, winnerId: 'b', entries: { a: pts(40), c: pts(10) } },
    { seq: 2, winnerId: 'a', entries: { b: pts(30), c: pts(20) } },
    { seq: 3, winnerId: 'a', entries: { b: pts(25), c: pts(25) } },
  ]);

/** Cy takes a full count of 80, and Asha wins. */
const slam = () =>
  play(
    [
      { seq: 1, winnerId: 'a', entries: { b: pts(5), c: pts(80) } },
      { seq: 2, winnerId: 'a', entries: { b: pts(61) } },
    ],
    { limit: 60 },
  );

describe('the story of a game', () => {
  it('is only told once the game is over', () => {
    const live = play([{ seq: 1, winnerId: 'a', entries: { b: pts(5), c: pts(5) } }]);
    expect(buildRecap(live, names)).toBeNull();
    expect(buildRecap(play([]), names)).toBeNull();
  });

  it('opens with the winner and the pot', () => {
    const recap = buildRecap(slam(), names)!;
    expect(recap.headline).toContain('Asha');
    expect(recap.headline).toContain('$30');
  });

  it('tells of someone who went out, rejoined and went out again, ahead of anything else', () => {
    const recap = buildRecap(outTwice(), names)!;
    expect(recap.lines[0]).toContain('Asha');
    expect(recap.lines[0]).toMatch(/second|again|sequel|back/i);
    expect(recap.lines[0]).toMatch(/\$10|bought|back/i);
  });

  it('tells of a winner who was out and came back', () => {
    const recap = buildRecap(rejoinWin(), names)!;
    expect(recap.lines[0]).toContain('Asha');
    expect(recap.lines[0]).toMatch(/out|back|written off/i);
  });

  it('tells of a comeback, with how far behind the winner was', () => {
    const recap = buildRecap(comeback(), names)!;
    const line = recap.lines.find((l) => l.includes('40'));
    expect(line).toContain('Asha');
  });

  it('tells of a full count, with the player and the points', () => {
    const recap = buildRecap(slam(), names)!;
    const line = recap.lines.find((l) => l.includes('80'));
    expect(line).toContain('Cy');
  });

  it('counts the game cap as the full count when it is lower than 80', () => {
    const state = play(
      [
        { seq: 1, winnerId: 'a', entries: { b: pts(5), c: pts(40) } },
        { seq: 2, winnerId: 'a', entries: { b: pts(5), c: pts(20) } },
        { seq: 3, winnerId: 'a', entries: { b: pts(39) } },
        { seq: 4, winnerId: 'a', entries: { b: pts(39) } },
      ],
      { maxRoundPenalty: 40 },
    );
    const lines = buildRecap(state, names)!.lines;
    expect(lines.some((l) => l.includes('40') && l.includes('Cy'))).toBe(true);
  });

  it('says how many times when a player takes a full count more than once', () => {
    const done = play(
      [
        { seq: 1, winnerId: 'a', entries: { b: pts(5), c: pts(80) } },
        { seq: 2, winnerId: 'a', entries: { b: pts(5), c: pts(80) } },
        { seq: 3, winnerId: 'a', entries: { b: pts(150) } },
      ],
      { limit: 150 },
    );
    const line = buildRecap(done, names)!.lines.find((l) => l.includes('80'))!;
    expect(line).toContain('Cy');
    expect(line).toContain('2');
  });

  it('tells at most three things, without leaving any gaps in the text', () => {
    for (const state of [outTwice(), rejoinWin(), comeback(), slam()]) {
      const recap = buildRecap(state, names)!;
      expect(recap.lines.length).toBeGreaterThan(0);
      expect(recap.lines.length).toBeLessThanOrEqual(3);
      for (const text of [recap.headline, ...recap.lines]) {
        expect(text).not.toMatch(/[{}]|undefined|NaN/);
      }
    }
  });

  it('tells the same story every time for the same game', () => {
    expect(buildRecap(outTwice(), names)).toEqual(buildRecap(outTwice(), names));
  });

  it('never tells the same thing twice', () => {
    for (const state of [outTwice(), rejoinWin(), comeback(), slam()]) {
      const lines = buildRecap(state, names)!.lines;
      expect(new Set(lines).size).toBe(lines.length);
    }
  });

  it('still works for a game saved before running scores were kept, just without the comeback', () => {
    const old = comeback();
    for (const round of old.rounds) delete (round as { totals?: unknown }).totals;
    const recap = buildRecap(old, names)!;
    expect(recap.lines.length).toBeGreaterThan(0);
    expect(recap.lines.some((l) => l.includes('behind') || l.includes('adrift'))).toBe(false);
  });

  it('falls back to a line for a quiet game', () => {
    const state = comeback();
    // Take away everything worth telling.
    state.rounds.forEach((r) => {
      r.eliminated = [];
      r.points = Object.fromEntries(Object.keys(r.points).map((id) => [id, 1]));
    });
    state.players.b!.active = true;
    state.players.c!.active = true;
    for (const id of Object.keys(state.players)) state.players[id]!.dropsUsed = 0;
    state.rounds.forEach((r) => (r.totals = { a: 1, b: 1, c: 1 }));
    state.players.a!.rejoins = 0;
    for (const id of Object.keys(state.players)) state.players[id]!.total = 1;
    const recap = buildRecap(state, names)!;
    expect(recap.lines.length).toBeGreaterThan(0);
  });
});
