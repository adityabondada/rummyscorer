import { simplifyTransfers, summarize, type GameState } from '@rummy/engine';
import { raceView, type RaceTone } from './race';

/** One player's line on the picture. */
export interface CardRow {
  rank: number;
  name: string;
  /** The big number on the right: a net amount for a finished game, or the score so far. */
  value: string;
  /** Small text under the name. */
  sub: string;
  tone: 'win' | 'lose' | 'even' | 'plain' | 'out';
  /** The race-to-the-limit bar, for a game still being played. */
  bar: { pct: number; tone: RaceTone } | null;
  highlight: boolean;
}

/** Everything the picture says, worked out before any drawing, so it can be checked on its own. */
export interface CardModel {
  kind: 'finished' | 'live';
  league: string;
  dateLabel: string;
  headline: string;
  subhead: string;
  rows: CardRow[];
  /** "Bo pays Cy $20", for a finished game. */
  payments: string[];
}

const ordinal = (n: number) =>
  `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

const signed = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}$${Math.abs(n)}`;

export function buildGameCard(args: {
  leagueName: string;
  state: GameState;
  names: Record<string, string>;
  startedAt?: number | null;
  locale?: string;
}): CardModel {
  const { leagueName, state, names, startedAt, locale } = args;
  const nameOf = (id: string) => names[id] ?? '?';
  const dateLabel = startedAt
    ? new Date(startedAt).toLocaleDateString(locale, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
    : '';
  const summary = summarize(state);

  if (summary) {
    const order = [...state.seatOrder].sort(
      (a, b) => summary.positions[a]! - summary.positions[b]! || summary.net[b]! - summary.net[a]!,
    );
    const split = summary.outcome === 'split';
    const rows: CardRow[] = order.map((id, i) => {
      const net = summary.net[id]!;
      const won = summary.winnerIds.includes(id);
      return {
        rank: i + 1,
        name: nameOf(id),
        value: signed(net),
        sub: won ? (split ? 'Shared win' : 'Winner') : ordinal(summary.positions[id]!),
        tone: net > 0 ? 'win' : net < 0 ? 'lose' : 'even',
        bar: null,
        highlight: won,
      };
    });
    const winners = summary.winnerIds.map(nameOf).join(' & ');
    return {
      kind: 'finished',
      league: leagueName,
      dateLabel,
      headline: split ? 'Split pot' : `${winners} won`,
      subhead: split
        ? summary.winnerIds.map((id) => `${nameOf(id)} $${summary.payouts[id] ?? 0}`).join(' · ')
        : `$${summary.pot} pot · ${summary.rounds} round${summary.rounds === 1 ? '' : 's'}`,
      rows,
      payments: simplifyTransfers(summary.net).map(
        (t) => `${nameOf(t.from)} pays ${nameOf(t.to)} $${t.amount}`,
      ),
    };
  }

  const players = Object.values(state.players).sort(
    (a, b) => a.total - b.total || nameOf(a.id).localeCompare(nameOf(b.id)),
  );
  const { limit } = state.settings;
  return {
    kind: 'live',
    league: leagueName,
    dateLabel,
    headline: `Round ${state.rounds.length + 1}`,
    subhead: `In progress · out past ${limit}`,
    rows: players.map((p, i) => {
      const view = raceView(p.total, limit, p.active);
      return {
        rank: i + 1,
        name: nameOf(p.id),
        value: String(p.total),
        sub: p.active ? `${view.left} to go` : 'Out',
        tone: p.active ? 'plain' : 'out',
        bar: { pct: view.pct, tone: view.tone },
        highlight: false,
      };
    }),
    payments: [],
  };
}

/* ---------- drawing ---------- */

export const CARD_WIDTH = 1080;
const PAD = 64;
const FONT = '"Inter", "Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const GREEN = '#047857';
const RED = '#b91c1c';
const BAR: Record<RaceTone, string> = {
  safe: '#10b981',
  warn: '#f59e0b',
  danger: '#ef4444',
  out: '#cbd5e1',
};
const VALUE_COLOR: Record<CardRow['tone'], string> = {
  win: GREEN,
  lose: RED,
  even: MUTED,
  plain: INK,
  out: '#94a3b8',
};

const HEADER_H = 250;
const HEADLINE_H = 210;
const ROW_H = 118;
const PAY_HEAD_H = 110;
const PAY_ROW_H = 62;
const FOOTER_H = 130;

/** How tall the picture is for this content. */
export function cardHeight(model: CardModel): number {
  const pay = model.payments.length > 0 ? PAY_HEAD_H + model.payments.length * PAY_ROW_H + 30 : 0;
  return HEADER_H + HEADLINE_H + model.rows.length * ROW_H + 20 + pay + FOOTER_H;
}

/** The parts of the canvas drawing API that are used, so tests can pass a recording stand-in. */
export type Ctx = Pick<
  CanvasRenderingContext2D,
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'arcTo'
  | 'closePath'
  | 'fill'
  | 'stroke'
  | 'fillRect'
  | 'fillText'
  | 'arc'
  | 'save'
  | 'restore'
  | 'measureText'
> & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
};

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  opts: { size: number; weight?: number; color: string; align?: CanvasTextAlign; max?: number },
) {
  ctx.font = `${opts.weight ?? 400} ${opts.size}px ${FONT}`;
  ctx.fillStyle = opts.color;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = 'middle';
  let shown = value;
  // A long name is cut with an ellipsis rather than running into the number beside it.
  if (opts.max !== undefined && ctx.measureText(shown).width > opts.max) {
    while (shown.length > 1 && ctx.measureText(`${shown}…`).width > opts.max)
      shown = shown.slice(0, -1);
    shown = `${shown}…`;
  }
  ctx.fillText(shown, x, y);
}

/** Draws the picture. The canvas must be `CARD_WIDTH` wide and `cardHeight(model)` tall. */
export function drawGameCard(ctx: Ctx, model: CardModel): void {
  const W = CARD_WIDTH;
  const H = cardHeight(model);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Header band: the four suits, the league and the day.
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, HEADER_H);
  const suits = ['♠', '♥', '♦', '♣'];
  suits.forEach((s, i) =>
    text(ctx, s, PAD + i * 56, 74, {
      size: 44,
      color: i === 1 || i === 2 ? '#f87171' : '#e2e8f0',
    }),
  );
  text(ctx, model.league, PAD, 148, { size: 60, weight: 700, color: '#ffffff', max: W - PAD * 2 });
  if (model.dateLabel) text(ctx, model.dateLabel, PAD, 206, { size: 32, color: '#cbd5e1' });

  // Headline: who won, or what round it is.
  const headY = HEADER_H + 84;
  text(ctx, model.headline, PAD, headY, { size: 84, weight: 800, color: INK, max: W - PAD * 2 });
  text(ctx, model.subhead, PAD, headY + 78, { size: 36, color: MUTED, max: W - PAD * 2 });

  // One row per player.
  let y = HEADER_H + HEADLINE_H;
  for (const row of model.rows) {
    if (row.highlight) {
      ctx.fillStyle = '#ecfdf5';
      roundRect(ctx, PAD - 24, y, W - PAD * 2 + 48, ROW_H - 12, 22);
      ctx.fill();
    }
    ctx.fillStyle = row.highlight ? GREEN : '#e2e8f0';
    ctx.beginPath();
    ctx.arc(PAD + 28, y + 52, 28, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, String(row.rank), PAD + 28, y + 53, {
      size: 30,
      weight: 700,
      color: row.highlight ? '#ffffff' : INK,
      align: 'center',
    });
    text(ctx, row.name, PAD + 88, y + 38, { size: 44, weight: 600, color: INK, max: 520 });
    text(ctx, row.sub, PAD + 88, y + 80, { size: 28, color: MUTED });
    text(ctx, row.value, W - PAD, y + 52, {
      size: 56,
      weight: 800,
      color: VALUE_COLOR[row.tone],
      align: 'right',
    });
    if (row.bar) {
      const bx = PAD + 88 + 340;
      const bw = W - PAD - 220 - bx;
      ctx.fillStyle = '#f1f5f9';
      roundRect(ctx, bx, y + 70, bw, 14, 7);
      ctx.fill();
      ctx.fillStyle = BAR[row.bar.tone];
      roundRect(ctx, bx, y + 70, Math.max(14, (bw * row.bar.pct) / 100), 14, 7);
      ctx.fill();
    }
    y += ROW_H;
  }

  // Who pays whom.
  if (model.payments.length > 0) {
    y += 20;
    ctx.fillStyle = LINE;
    ctx.fillRect(PAD, y, W - PAD * 2, 3);
    text(ctx, 'Settling up', PAD, y + 62, { size: 40, weight: 700, color: INK });
    let py = y + PAY_HEAD_H;
    for (const line of model.payments) {
      text(ctx, line, PAD, py + 22, { size: 38, color: INK, max: W - PAD * 2 });
      py += PAY_ROW_H;
    }
  }

  // Footer.
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, H - FOOTER_H, W, FOOTER_H);
  text(ctx, 'Scored with Rummy Score Tracker', PAD, H - FOOTER_H / 2, {
    size: 34,
    weight: 600,
    color: MUTED,
  });
}

/** Makes the picture as a PNG. Rejects where the browser can't draw (no canvas). */
export async function renderGameCard(model: CardModel, scale = 1): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH * scale;
  canvas.height = cardHeight(model) * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the picture');
  ctx.scale(scale, scale);
  drawGameCard(ctx, model);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not make the picture'))),
      'image/png',
    ),
  );
}

export type ImageShareResult = 'shared' | 'saved' | 'cancelled';

/**
 * Sends the picture where the person chooses, using the phone's share sheet when it can take a
 * file. Anywhere else it is saved to the device, so it can be attached by hand.
 */
export async function shareImage(
  blob: Blob,
  filename: string,
  title: string,
): Promise<ImageShareResult> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (error) {
      // Closing the share sheet is an answer, not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}
