// @vitest-environment jsdom
import { DEFAULT_SETTINGS, replay, type Round } from '@rummy/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyText, gameShareText, nightShareText, shareOrCopy, viewUrl } from './share';

const names = { a: 'Asha', b: 'Bo', c: 'Cy' };
const pts = (points: number) => ({ kind: 'points' as const, points });
const settings = { ...DEFAULT_SETTINGS, limit: 50, maxRoundPenalty: null, buyIn: 10 };
const play = (rounds: Round[], split?: { afterSeq: number; shares: Record<string, number> }) =>
  replay({ settings, seatOrder: ['a', 'b', 'c'], rounds, split });

describe('the text for one game', () => {
  it('gives the standings so far, lowest first, while the game is on', () => {
    const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(30), c: pts(10) } }]);
    expect(gameShareText({ leagueName: 'Friday Rummy', state, names })).toBe(
      ['Friday Rummy', 'Round 2 in progress', 'Asha 0, Cy 10, Bo 30'].join('\n'),
    );
  });

  it('marks players who are out', () => {
    const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(60), c: pts(10) } }]);
    expect(gameShareText({ leagueName: 'L', state, names })).toContain('Bo 60 (out)');
  });

  it('gives the scores first when it is over, with who won, and who pays whom at the bottom', () => {
    const state = play([
      { seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(51) } },
      { seq: 2, winnerId: 'a', entries: { b: pts(45) } },
    ]);
    expect(gameShareText({ leagueName: 'Friday Rummy', state, names })).toBe(
      [
        'Friday Rummy',
        'Asha won',
        'Scores: Asha 0, Cy 51 (out), Bo 55 (out)',
        'Settling up:',
        'Bo pays Asha $10',
        'Cy pays Asha $10',
      ].join('\n'),
    );
  });

  it('does not lead with the money: no pot or net line', () => {
    const state = play([
      { seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(51) } },
      { seq: 2, winnerId: 'a', entries: { b: pts(45) } },
    ]);
    const text = gameShareText({ leagueName: 'L', state, names });
    expect(text).not.toContain('pot');
    expect(text).not.toContain('Net:');
    expect(text.indexOf('Scores:')).toBeLessThan(text.indexOf('Settling up'));
  });

  it('describes a split pot by its scores, with no settling up when nobody owes', () => {
    const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(51) } }], {
      afterSeq: 1,
      shares: { a: 10, b: 20 },
    });
    const text = gameShareText({ leagueName: 'L', state, names });
    expect(text).toContain('Split pot');
    expect(text).toContain('Scores: ');
  });

  it('puts a link on the last line, labelled for what it is', () => {
    const open = play([{ seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(5) } }]);
    expect(
      gameShareText({ leagueName: 'L', state: open, names, url: 'https://x.test/view/abc' })
        .split('\n')
        .at(-1),
    ).toBe('Watch live: https://x.test/view/abc');

    const done = play([
      { seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(51) } },
      { seq: 2, winnerId: 'a', entries: { b: pts(45) } },
    ]);
    expect(
      gameShareText({ leagueName: 'L', state: done, names, url: 'https://x.test/view/abc' })
        .split('\n')
        .at(-1),
    ).toBe('Full scores: https://x.test/view/abc');
  });

  it('has no link line when there is no link', () => {
    const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(5) } }]);
    expect(gameShareText({ leagueName: 'L', state, names, url: null })).not.toMatch(/https?:/);
  });

  it('uses a question mark for a player it has no name for', () => {
    const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(5) } }]);
    expect(gameShareText({ leagueName: 'L', state, names: { a: 'Asha' } })).toContain('?');
  });
});

describe('the text for a night', () => {
  const base = {
    leagueName: 'Friday Rummy',
    dayLabel: 'Friday, Oct 2',
    finishedGames: 3,
    inProgress: 0,
    nets: { a: 20, b: -10, c: -10 },
    transfers: [
      { from: 'b', to: 'a', amount: 10 },
      { from: 'c', to: 'a', amount: 10 },
    ],
    names,
  };

  it('gives the nets and who pays whom', () => {
    expect(nightShareText(base)).toBe(
      [
        'Friday Rummy · Friday, Oct 2',
        '3 games',
        'Net: Asha +$20, Bo −$10, Cy −$10',
        'Settling up:',
        'Bo pays Asha $10',
        'Cy pays Asha $10',
      ].join('\n'),
    );
  });

  it('says "1 game" for one', () => {
    expect(nightShareText({ ...base, finishedGames: 1 })).toContain('\n1 game\n');
  });

  it('leaves out the settling up section when nobody owes anything', () => {
    const text = nightShareText({ ...base, nets: { a: 0, b: 0 }, transfers: [] });
    expect(text).not.toContain('Settling up');
  });

  it('says when games are still being played and are not counted', () => {
    expect(nightShareText({ ...base, inProgress: 1 })).toContain(
      '(1 game still in progress, not counted)',
    );
    expect(nightShareText({ ...base, inProgress: 2 })).toContain(
      '(2 games still in progress, not counted)',
    );
  });
});

describe('sharing or copying', () => {
  const clipboard = { writeText: vi.fn() };
  beforeEach(() => {
    clipboard.writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  const withShare = (impl: () => Promise<void>) => {
    const share = vi.fn(impl);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    return share;
  };

  it('opens the phone share sheet when there is one, with the title and text', async () => {
    const share = withShare(() => Promise.resolve());
    expect(await shareOrCopy('Title', 'Body')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Title', text: 'Body' });
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('treats closing the share sheet as an answer, and does not copy behind their back', async () => {
    withShare(() => Promise.reject(new DOMException('closed', 'AbortError')));
    expect(await shareOrCopy('T', 'B')).toBe('cancelled');
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('copies instead when the share sheet fails to open', async () => {
    withShare(() => Promise.reject(new Error('not allowed')));
    expect(await shareOrCopy('T', 'B')).toBe('copied');
    expect(clipboard.writeText).toHaveBeenCalledWith('B');
  });

  it('copies where there is no share sheet, as on a laptop', async () => {
    expect(await shareOrCopy('T', 'B')).toBe('copied');
    expect(clipboard.writeText).toHaveBeenCalledWith('B');
  });

  it('says it failed when nothing can be shared or copied', async () => {
    clipboard.writeText.mockRejectedValue(new Error('blocked'));
    expect(await shareOrCopy('T', 'B')).toBe('failed');
  });

  it('copies text, and reports whether that worked', async () => {
    expect(await copyText('20')).toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith('20');
    clipboard.writeText.mockRejectedValue(new Error('blocked'));
    expect(await copyText('20')).toBe(false);
  });
});

describe('the address of a shared game', () => {
  it('is on this site, under /view', () => {
    expect(viewUrl('abc123')).toBe(`${window.location.origin}/view/abc123`);
  });
});
