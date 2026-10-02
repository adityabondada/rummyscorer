import { DEFAULT_SETTINGS } from '@rummy/engine';
import { describe, expect, it } from 'vitest';
import { moveInOrder, seatOrderFor, tableOrder, toggleAll } from './newGame';

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

describe('seatOrderFor', () => {
  it('follows the order the players were picked in until someone is placed by hand', () => {
    expect(seatOrderFor(['b', 'a', 'c'], [])).toEqual(['b', 'a', 'c']);
  });

  it('keeps hand placement, and puts newly picked players at the end', () => {
    expect(seatOrderFor(['a', 'b', 'c', 'd'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b', 'd']);
  });

  it('drops anyone who was placed but is no longer picked', () => {
    expect(seatOrderFor(['a', 'c'], ['c', 'b', 'a'])).toEqual(['c', 'a']);
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
