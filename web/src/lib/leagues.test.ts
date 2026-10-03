import type { LeagueDoc } from '@rummy/data';
import { describe, expect, it } from 'vitest';
import { firstName, lastPlayedLabel, leagueCountLine, orderLeagues } from './leagues';

// Saturday 3 October 2026, mid-afternoon.
const now = new Date(2026, 9, 3, 15).getTime();
const at = (y: number, m: number, d: number, h = 20) => new Date(y, m - 1, d, h).getTime();

describe('when a league was last played', () => {
  it('says today, even for a game started this morning or late last night', () => {
    expect(lastPlayedLabel(at(2026, 10, 3, 9), now, 'en-US')).toBe('today');
    expect(lastPlayedLabel(now + 60_000, now, 'en-US')).toBe('today');
  });

  it('says yesterday by the calendar day, not by 24 hours', () => {
    expect(lastPlayedLabel(at(2026, 10, 2, 23), now, 'en-US')).toBe('yesterday');
    expect(lastPlayedLabel(at(2026, 10, 2, 1), now, 'en-US')).toBe('yesterday');
  });

  it('names the weekday for the rest of the last week', () => {
    expect(lastPlayedLabel(at(2026, 10, 1), now, 'en-US')).toBe('Thu');
    expect(lastPlayedLabel(at(2026, 9, 27), now, 'en-US')).toBe('Sun');
  });

  it('gives the date once it is a week or more ago', () => {
    expect(lastPlayedLabel(at(2026, 9, 26), now, 'en-US')).toBe('Sep 26');
    expect(lastPlayedLabel(at(2026, 3, 4), now, 'en-US')).toBe('Mar 4');
  });

  it('adds the year for an earlier year', () => {
    expect(lastPlayedLabel(at(2025, 12, 20), now, 'en-US')).toBe('Dec 20, 2025');
  });
});

describe('the line under the title', () => {
  it('counts the leagues, and says nothing with none', () => {
    expect(leagueCountLine(0)).toBe('');
    expect(leagueCountLine(1)).toBe('1 league, tap it to open it');
    expect(leagueCountLine(2)).toBe('2 leagues, tap one to open it');
  });
});

describe('the greeting', () => {
  it('uses the first name only', () => {
    expect(firstName('Asha Rao')).toBe('Asha');
    expect(firstName('  Asha  ')).toBe('Asha');
  });

  it('is empty when there is no name', () => {
    expect(firstName(null)).toBe('');
    expect(firstName(undefined)).toBe('');
    expect(firstName('   ')).toBe('');
  });
});

describe('the order of leagues', () => {
  const league = (id: string, name: string) => ({
    id,
    doc: { name } as LeagueDoc,
  });
  const leagues = [league('c', 'Chess club'), league('a', 'Alpha'), league('b', 'Bravo')];
  const order = (activity: Parameters<typeof orderLeagues>[1]) =>
    orderLeagues(leagues, activity).map((l) => l.id);

  it('puts a league with a game on first', () => {
    expect(
      order({
        a: { live: false, lastAt: 500 },
        b: { live: false, lastAt: 100 },
        c: { live: true, lastAt: 50 },
      }),
    ).toEqual(['c', 'a', 'b']);
  });

  it('then the one played most recently', () => {
    expect(
      order({
        a: { live: false, lastAt: 100 },
        b: { live: false, lastAt: 900 },
        c: { live: false, lastAt: 500 },
      }),
    ).toEqual(['b', 'c', 'a']);
  });

  it('puts leagues with no games, or not yet loaded, last and by name', () => {
    expect(order({ b: { live: false, lastAt: 10 }, c: { live: false, lastAt: null } })).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(order({})).toEqual(['a', 'b', 'c']);
  });

  it('breaks a tie by name, and does not change the list it was given', () => {
    const copy = [...leagues];
    expect(
      order({
        a: { live: false, lastAt: 7 },
        b: { live: false, lastAt: 7 },
        c: { live: false, lastAt: 7 },
      }),
    ).toEqual(['a', 'b', 'c']);
    expect(leagues).toEqual(copy);
  });
});
