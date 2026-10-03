// @vitest-environment jsdom
import { DEFAULT_SETTINGS, replay, type Round } from '@rummy/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildGameCard,
  buildNightCard,
  CARD_WIDTH,
  cardHeight,
  drawGameCard,
  renderGameCard,
  shareImage,
  type CardModel,
  type Ctx,
} from './shareImage';

const names = { a: 'Asha', b: 'Bo', c: 'Cy' };
const pts = (points: number) => ({ kind: 'points' as const, points });
const settings = { ...DEFAULT_SETTINGS, limit: 100, maxRoundPenalty: null, buyIn: 10 };
const play = (rounds: Round[], split?: { afterSeq: number; shares: Record<string, number> }) =>
  replay({ settings, seatOrder: ['a', 'b', 'c'], rounds, split });

const finished = () =>
  play([
    { seq: 1, winnerId: 'a', entries: { b: pts(60), c: pts(101) } },
    { seq: 2, winnerId: 'a', entries: { b: pts(60) } },
  ]);
const inProgress = () => play([{ seq: 1, winnerId: 'a', entries: { b: pts(30), c: pts(90) } }]);
const when = new Date(2026, 9, 2, 20).getTime();

describe('what the picture says', () => {
  it('for a finished game: the winner and each player s final score, best first, with the money small', () => {
    const card = buildGameCard({
      leagueName: 'Friday Rummy',
      state: finished(),
      names,
      startedAt: when,
      locale: 'en-US',
    });
    expect(card).toMatchObject({
      kind: 'finished',
      league: 'Friday Rummy',
      dateLabel: 'Friday, Oct 2',
      headline: 'Asha won',
      subhead: '2 rounds · out past 100',
    });
    expect(card.rows.map((r) => [r.rank, r.name, r.value, r.sub, r.tone, r.highlight])).toEqual([
      [1, 'Asha', '0', 'Winner · +$20', 'win', true],
      [2, 'Bo', '120', 'Out · −$10', 'out', false],
      [3, 'Cy', '101', 'Out · −$10', 'out', false],
    ]);
  });

  it('puts the score in the big number, not the money, and shows the race bar for everyone', () => {
    const card = buildGameCard({ leagueName: 'L', state: finished(), names });
    expect(card.rows.every((r) => /^\d+$/.test(r.value))).toBe(true);
    expect(card.rows.every((r) => r.bar !== null)).toBe(true);
    expect(card.rows[0]!.bar).toMatchObject({ pct: 0, tone: 'safe' });
    expect(card.rows[1]!.bar).toMatchObject({ pct: 100, tone: 'out' });
  });

  it('lists who pays whom', () => {
    const card = buildGameCard({ leagueName: 'L', state: finished(), names });
    expect(card.payments).toEqual(['Bo pays Asha $10', 'Cy pays Asha $10']);
  });

  it('says "1 round" for a one-round game, and leaves the date out when it is not known', () => {
    const one = play([{ seq: 1, winnerId: 'a', entries: { b: pts(101), c: pts(101) } }]);
    const card = buildGameCard({ leagueName: 'L', state: one, names });
    expect(card.subhead).toBe('1 round · out past 100');
    expect(card.dateLabel).toBe('');
  });

  it('for a split: says so, and still shows everyone s score', () => {
    const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(5) } }], {
      afterSeq: 1,
      shares: { a: 10, b: 10, c: 10 },
    });
    const card = buildGameCard({ leagueName: 'L', state, names });
    expect(card.headline).toBe('Split pot');
    expect(card.subhead).toBe('1 round · out past 100');
    expect(card.rows.map((r) => [r.name, r.value])).toEqual([
      ['Asha', '0'],
      ['Bo', '10'],
      ['Cy', '5'],
    ]);
    expect(card.rows.every((r) => r.sub.startsWith('Shared win'))).toBe(true);
    expect(card.payments).toEqual([]);
  });

  it('for a game still on: the round, and each player s score with how far they are from the limit', () => {
    const card = buildGameCard({ leagueName: 'L', state: inProgress(), names });
    expect(card).toMatchObject({
      kind: 'live',
      headline: 'Round 2',
      subhead: 'In progress · out past 100',
      payments: [],
    });
    expect(card.rows.map((r) => [r.name, r.value, r.sub])).toEqual([
      ['Asha', '0', '100 to go'],
      ['Bo', '30', '70 to go'],
      ['Cy', '90', '10 to go'],
    ]);
    expect(card.rows[2]!.bar).toMatchObject({ tone: 'danger' });
    expect(card.rows[0]!.bar).toMatchObject({ pct: 0, tone: 'safe' });
  });

  it('marks someone who is out, and uses a question mark for a name it does not have', () => {
    const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(30), c: pts(101) } }]);
    const card = buildGameCard({ leagueName: 'L', state, names: { a: 'Asha', b: 'Bo' } });
    const cy = card.rows.find((r) => r.name === '?')!;
    expect(cy).toMatchObject({ sub: 'Out', tone: 'out' });
  });
});

/** A stand-in for the canvas that records what is written on it. */
function recorder() {
  const texts: string[] = [];
  const calls: string[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    beginPath: () => calls.push('beginPath'),
    moveTo: () => {},
    lineTo: () => {},
    arcTo: () => {},
    closePath: () => {},
    fill: () => calls.push('fill'),
    stroke: () => {},
    fillRect: (...a: number[]) => calls.push(`rect ${a.join(',')}`),
    arc: () => calls.push('arc'),
    save: () => {},
    restore: () => {},
    // Every character is 10 wide, so a long line is easy to make too long.
    measureText: (t: string) => ({ width: t.length * 10 }) as TextMetrics,
    fillText: (t: string) => texts.push(t),
  };
  return { ctx: ctx as unknown as Ctx, texts, calls };
}

describe('drawing the picture', () => {
  const model = (over: Partial<CardModel> = {}): CardModel => ({
    ...buildGameCard({ leagueName: 'Friday Rummy', state: finished(), names, startedAt: when }),
    ...over,
  });

  it('writes the league, the date, the headline, every player and every payment', () => {
    const { ctx, texts } = recorder();
    const m = model();
    drawGameCard(ctx, m);
    for (const line of [
      'Friday Rummy',
      m.dateLabel,
      'Asha won',
      '2 rounds · out past 100',
      'Asha',
      '0',
      'Winner · +$20',
      'Bo',
      '120',
      'Settling up',
      'Bo pays Asha $10',
      'Scored with Rummy Score Tracker',
    ]) {
      expect(texts, line).toContain(line);
    }
  });

  it('is as tall as it says, so the canvas can be sized to fit', () => {
    const two = model({ rows: model().rows.slice(0, 2) });
    expect(cardHeight(model())).toBeGreaterThan(cardHeight(two));
    expect(cardHeight(model({ payments: [] }))).toBeLessThan(cardHeight(model()));
    const { ctx, calls } = recorder();
    drawGameCard(ctx, model());
    // The footer is the last band drawn and ends at the bottom edge.
    const last = calls.filter((c) => c.startsWith('rect')).at(-1)!;
    const [x, y, w, h] = last.slice(5).split(',').map(Number);
    expect([x, w]).toEqual([0, CARD_WIDTH]);
    expect(y! + h!).toBe(cardHeight(model()));
  });

  it('has no payments section when nobody owes anything, or for a game still on', () => {
    const { ctx, texts } = recorder();
    drawGameCard(ctx, model({ payments: [] }));
    expect(texts).not.toContain('Settling up');
  });

  it('shows the scores in the big numbers and the payments last, in a smaller type', () => {
    const { ctx, texts } = recorder();
    drawGameCard(ctx, model());
    expect(texts.indexOf('120')).toBeLessThan(texts.indexOf('Settling up'));
    expect(texts.indexOf('Settling up')).toBeLessThan(texts.indexOf('Bo pays Asha $10'));
    expect(texts.at(-1)).toBe('Scored with Rummy Score Tracker');
  });

  it('draws the race bar for a game still on', () => {
    const live = recorder();
    drawGameCard(live.ctx, buildGameCard({ leagueName: 'L', state: inProgress(), names }));
    expect(live.texts).toContain('100 to go');
  });

  it('cuts a very long name short instead of running it into the number beside it', () => {
    const { ctx, texts } = recorder();
    const long = 'A'.repeat(80);
    const m = model();
    drawGameCard(ctx, { ...m, rows: [{ ...m.rows[0]!, name: long }, ...m.rows.slice(1)] });
    const shown = texts.find((t) => t.startsWith('AAAA'))!;
    expect(shown.endsWith('…')).toBe(true);
    expect(shown.length).toBeLessThan(long.length);
  });
});

describe('making the picture file', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects where the browser cannot draw, so the window can offer text instead', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(
      renderGameCard(buildGameCard({ leagueName: 'L', state: finished(), names })),
    ).rejects.toThrow(/cannot draw/);
  });

  it('sizes the canvas to the content and draws a PNG', async () => {
    const { ctx } = recorder();
    const full = Object.assign(ctx, { scale: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      full as unknown as CanvasRenderingContext2D,
    );
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((cb) => cb(new Blob(['png'], { type: 'image/png' })));
    const model = buildGameCard({ leagueName: 'L', state: finished(), names });
    const blob = await renderGameCard(model);
    expect(blob.type).toBe('image/png');
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(full.scale).toHaveBeenCalledWith(1, 1);
  });

  it('rejects when the browser gives no image back', async () => {
    const { ctx } = recorder();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      Object.assign(ctx, { scale: vi.fn() }) as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(null));
    await expect(
      renderGameCard(buildGameCard({ leagueName: 'L', state: finished(), names })),
    ).rejects.toThrow(/Could not make/);
  });
});

describe('sending the picture', () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  const set = (name: string, value: unknown) =>
    Object.defineProperty(navigator, name, { value, configurable: true });
  beforeEach(() => {
    set('canShare', undefined);
    set('share', undefined);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it('uses the share sheet when it can take a file', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    set('canShare', () => true);
    set('share', share);
    expect(await shareImage(blob, 'scores.png', 'Friday scores')).toBe('shared');
    const arg = share.mock.calls[0]![0] as { files: File[]; title: string };
    expect(arg.title).toBe('Friday scores');
    expect(arg.files[0]).toMatchObject({ name: 'scores.png', type: 'image/png' });
  });

  it('treats closing the share sheet as an answer, and does not save behind their back', async () => {
    set('canShare', () => true);
    set('share', vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await shareImage(blob, 'scores.png', 'T')).toBe('cancelled');
    expect(click).not.toHaveBeenCalled();
  });

  it('saves the file when the share sheet cannot take files, as on a laptop', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('scores.png');
      expect(this.href).toBe('blob:x');
    });
    expect(await shareImage(blob, 'scores.png', 'T')).toBe('saved');
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('saves the file when sharing it fails for another reason', async () => {
    set('canShare', () => true);
    set('share', vi.fn().mockRejectedValue(new Error('not allowed')));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await shareImage(blob, 'scores.png', 'T')).toBe('saved');
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('what a night picture says', () => {
  const game = (
    id: string,
    status: 'finished' | 'inProgress',
    winner: string | null,
    net: Record<string, number>,
  ) =>
    ({
      id,
      doc: {
        status,
        summary:
          winner === null
            ? null
            : {
                winnerIds: [winner],
                players: Object.fromEntries(Object.keys(net).map((p) => [p, {}])),
              },
      },
    }) as never;

  const night = (over = {}) => ({
    day: '2026-10-02',
    games: [
      game('1', 'finished', 'a', { a: 20, b: -10, c: -10 }),
      game('2', 'finished', 'a', { a: 20, b: -10, c: -10 }),
      game('3', 'finished', 'b', { a: -20, b: 40, c: -20 }),
    ],
    nets: { a: 20, b: 20, c: -40 },
    transfers: [
      { from: 'c', to: 'a', amount: 20 },
      { from: 'c', to: 'b', amount: 20 },
    ],
    inProgress: 0,
    ...over,
  });

  const card = (n = night()) =>
    buildNightCard({
      leagueName: 'Friday Rummy',
      dayLabel: 'Friday, Oct 2',
      night: n as never,
      names,
    });

  it('leads with games won, most first, with what each player won or lost small beside it', () => {
    const c = card();
    expect(c).toMatchObject({
      kind: 'night',
      league: 'Friday Rummy',
      dateLabel: 'Friday, Oct 2',
      headline: '3 games',
      valueLabel: 'games won',
      subhead: 'Most wins: Asha (2)',
    });
    expect(c.rows.map((r) => [r.rank, r.name, r.value, r.sub, r.highlight])).toEqual([
      [1, 'Asha', '2', '3 played · +$20', true],
      [2, 'Bo', '1', '3 played · +$20', false],
      [3, 'Cy', '0', '3 played · −$40', false],
    ]);
  });

  it('puts who pays whom last', () => {
    expect(card().payments).toEqual(['Cy pays Asha $20', 'Cy pays Bo $20']);
  });

  it('shares the top spot when games won are tied, and breaks other ties by money', () => {
    const tied = night({
      games: [
        game('1', 'finished', 'a', { a: 10, b: -10 }),
        game('2', 'finished', 'b', { a: -10, b: 10 }),
      ],
      nets: { a: 0, b: 0 },
      transfers: [],
    });
    const c = card(tied);
    expect(c.subhead).toBe('Most wins: Asha, Bo (1)');
    expect(c.rows.every((r) => r.highlight)).toBe(true);
    expect(c.payments).toEqual([]);
  });

  it('counts only finished games, and says one is still being played', () => {
    const c = card(
      night({
        games: [game('1', 'finished', 'a', { a: 20, b: -20 }), game('2', 'inProgress', null, {})],
        inProgress: 1,
      }),
    );
    expect(c.headline).toBe('1 game');
    expect(c.subhead).toBe('Most wins: Asha (1) · 1 still being played, not counted');
  });

  it('has no leader when nobody has won a game', () => {
    const c = card(night({ games: [], nets: {}, transfers: [] }));
    expect(c.rows).toEqual([]);
    expect(c.subhead).toBe('No wins yet');
  });

  it('can be drawn: the league, the day, each player and the payments', () => {
    const { ctx, texts } = recorder();
    drawGameCard(ctx, card());
    for (const line of [
      'Friday Rummy',
      'Friday, Oct 2',
      '3 games',
      'games won',
      'Asha',
      '3 played · +$20',
      'Settling up',
    ]) {
      expect(texts, line).toContain(line);
    }
  });
});
