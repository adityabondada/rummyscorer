import { DEFAULT_SETTINGS, type GameSettings } from '@rummy/engine';
import { describe, expect, it } from 'vitest';
import { moreRulesSummary, moveInOrder, tableOrder, toggleAll, togglePlayer } from './newGame';

describe('toggleAll', () => {
  const all = ['a', 'b', 'c'];

  it('picks everyone when nobody is picked', () => {
    expect(toggleAll([], all)).toEqual(['a', 'b', 'c']);
  });

  it('picks the rest when only some are picked, keeping the order already chosen', () => {
    expect(toggleAll(['c'], all)).toEqual(['c', 'a', 'b']);
  });

  it('clears the selection when everyone is already picked', () => {
    expect(toggleAll(['b', 'a', 'c'], all)).toEqual([]);
  });

  it('ignores someone picked who is no longer on the list', () => {
    expect(toggleAll(['gone'], all)).toEqual(['a', 'b', 'c']);
  });

  it('does nothing with nobody to pick', () => {
    expect(toggleAll([], [])).toEqual([]);
  });
});

describe('togglePlayer', () => {
  it('adds a player to the end of the line-up', () => {
    expect(togglePlayer(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(togglePlayer([], 'a')).toEqual(['a']);
  });

  it('takes a player out, keeping everyone else in order', () => {
    expect(togglePlayer(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('does not change the list it is given', () => {
    const order = ['a', 'b'];
    togglePlayer(order, 'c');
    togglePlayer(order, 'a');
    expect(order).toEqual(['a', 'b']);
  });
});

describe('moreRulesSummary', () => {
  const summary = (over: Partial<GameSettings> = {}) =>
    moreRulesSummary({ ...DEFAULT_SETTINGS, ...over });

  it('describes the standard rules in one line', () => {
    expect(summary()).toBe(
      'Drop 20, middle drop 40, up to 2 each · penalty cap 80 · rejoin with no drops · rejoin always open',
    );
  });

  it('follows the settings', () => {
    expect(summary({ dropPoints: 25, middleDropPoints: 50, maxDrops: 3 })).toContain(
      'Drop 25, middle drop 50, up to 3 each',
    );
    expect(summary({ maxRoundPenalty: 60 })).toContain('penalty cap 60');
    expect(summary({ rejoinCutoff: 150 })).toContain('rejoin closes past 150');
  });

  it('says so when there is no cap, no drops, or drops are carried over or granted', () => {
    expect(summary({ maxRoundPenalty: null })).toContain('no penalty cap');
    expect(summary({ maxDrops: 0, dropsOnRejoin: { mode: 'grant', count: 0 } })).toMatch(
      /^No drops/,
    );
    expect(summary({ dropsOnRejoin: { mode: 'carryOver' } })).toContain(
      'rejoin keeps the drops left',
    );
    expect(summary({ dropsOnRejoin: { mode: 'grant', count: 1 } })).toContain(
      'rejoin with 1 drop ·',
    );
    expect(summary({ dropsOnRejoin: { mode: 'grant', count: 2 } })).toContain(
      'rejoin with 2 drops ·',
    );
  });

  it('leaves out the limit and buy-in, which are always on screen', () => {
    expect(summary()).not.toMatch(/201|\$|buy/i);
  });
});
describe('moveInOrder', () => {
  const order = ['a', 'b', 'c'];

  it('moves a player up or down one seat', () => {
    expect(moveInOrder(order, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(order, 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('leaves the order alone at either end', () => {
    expect(moveInOrder(order, 'a', -1)).toBe(order);
    expect(moveInOrder(order, 'c', 1)).toBe(order);
  });

  it('leaves the order alone for someone not in it, and never changes the original', () => {
    expect(moveInOrder(order, 'z', 1)).toBe(order);
    moveInOrder(order, 'b', 1);
    expect(order).toEqual(['a', 'b', 'c']);
  });
});

describe('tableOrder', () => {
  it('makes the player at the bottom of the list, with the lowest card, the dealer', () => {
    // Dealt in the order high, mid, low: the lowest card deals round 1.
    expect(tableOrder(['high', 'mid', 'low'])).toEqual(['low', 'high', 'mid']);
  });

  it('keeps the cycle round the table the same, so the deal then passes to the top of the list', () => {
    const list = ['a', 'b', 'c', 'd'];
    const seats = tableOrder(list);
    expect(seats[0]).toBe('d');
    // The next dealer is the next seat: the player who was dealt the first card.
    expect(seats[1]).toBe('a');
    // Reading the seats round from the dealer gives the same cycle as the list.
    expect([...seats.slice(1), seats[0]]).toEqual(list);
  });

  it('works for two players and for nobody', () => {
    expect(tableOrder(['a', 'b'])).toEqual(['b', 'a']);
    expect(tableOrder([])).toEqual([]);
  });

  it('does not change the list it is given', () => {
    const list = ['a', 'b', 'c'];
    tableOrder(list);
    expect(list).toEqual(['a', 'b', 'c']);
  });
});

describe('new game defaults', () => {
  it('start with no drops granted on rejoin', () => {
    expect(DEFAULT_SETTINGS.dropsOnRejoin).toEqual({ mode: 'grant', count: 0 });
  });
});
