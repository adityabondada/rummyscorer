import { describe, expect, it } from 'vitest';
import { drawForm } from './seatingForm';

const ids = ['a', 'b', 'c'];

describe('drawForm', () => {
  it('starts everyone with one empty box and nobody tied', () => {
    const { view, result } = drawForm(ids, {});
    expect(result).toMatchObject({ resolved: false });
    for (const id of ids) expect(view[id]).toEqual({ slots: [''], status: 'idle' });
  });

  it('needs at least two players', () => {
    expect(drawForm(['a'], {}).result).toBeNull();
  });

  it('seats everyone once the cards differ', () => {
    const { result, view } = drawForm(ids, { a: ['3'], b: ['K'], c: ['9'] });
    expect(result).toEqual({ resolved: true, seatOrder: ['a', 'b', 'c'] });
    expect(view.a!.status).toBe('idle');
  });

  it('asks only the tied players to redraw', () => {
    const { view } = drawForm(ids, { a: ['5'], b: ['5'], c: ['2'] });
    expect(view.a).toEqual({ slots: ['5', ''], status: 'redraw' });
    expect(view.b).toEqual({ slots: ['5', ''], status: 'redraw' });
    expect(view.c).toEqual({ slots: ['2'], status: 'idle' });
  });

  it('makes a player who has redrawn wait for the rest of the tie, not draw a third card', () => {
    const { view } = drawForm(ids, { a: ['5', '9'], b: ['5', ''], c: ['2'] });
    expect(view.a).toEqual({ slots: ['5', '9'], status: 'waiting' });
    expect(view.b).toEqual({ slots: ['5', ''], status: 'redraw' });
  });

  it('settles the tie once everyone has redrawn', () => {
    const { result, view } = drawForm(ids, { a: ['5', '9'], b: ['5', '3'], c: ['2'] });
    expect(result).toEqual({ resolved: true, seatOrder: ['c', 'a', 'b'] });
    expect(view.a!.status).toBe('idle');
  });

  it('asks for another redraw when the redraw ties too', () => {
    const { view, result } = drawForm(ids, { a: ['5', '9'], b: ['5', '9'], c: ['2'] });
    expect(result).toMatchObject({ resolved: false, redraw: [['a', 'b']] });
    expect(view.a).toEqual({ slots: ['5', '9', ''], status: 'redraw' });
    expect(view.b).toEqual({ slots: ['5', '9', ''], status: 'redraw' });
  });

  it('handles a three-way tie where one player redraws first', () => {
    const { view } = drawForm(ids, { a: ['5', '2'], b: ['5', ''], c: ['5', ''] });
    expect(view.a!.status).toBe('waiting');
    expect(view.b!.status).toBe('redraw');
    expect(view.c!.status).toBe('redraw');
  });
});
