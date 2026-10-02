import { simplifyTransfers, summarize, type GameState, type Transfer } from '@rummy/engine';
import { money } from '../ui';

const name = (names: Record<string, string>, id: string) => names[id] ?? '?';
const dollars = (n: number) => `$${n}`;

/** "Asha +$20, Bo −$10", biggest win first. */
const netLine = (nets: Record<string, number>, names: Record<string, string>) =>
  Object.entries(nets)
    .sort(([a, x], [b, y]) => y - x || name(names, a).localeCompare(name(names, b)))
    .map(([id, net]) => `${name(names, id)} ${money(net)}`)
    .join(', ');

const paymentLines = (transfers: Transfer[], names: Record<string, string>) =>
  transfers.map((t) => `${name(names, t.from)} pays ${name(names, t.to)} ${dollars(t.amount)}`);

/**
 * The scores of one game as a message for a group chat: who won and who pays whom when it is over,
 * or the standings so far when it isn't. A link, if there is one, goes on the last line so chat apps
 * make it tappable.
 */
export function gameShareText(args: {
  leagueName: string;
  state: GameState;
  names: Record<string, string>;
  url?: string | null;
}): string {
  const { leagueName, state, names, url } = args;
  const lines = [leagueName];
  const summary = summarize(state);
  if (summary) {
    const winners = summary.winnerIds.map((id) => name(names, id)).join(' & ');
    lines.push(
      summary.outcome === 'split'
        ? `Split pot: ${summary.winnerIds
            .map((id) => `${name(names, id)} ${dollars(summary.payouts[id] ?? 0)}`)
            .join(', ')}`
        : `${winners} won the ${dollars(summary.pot)} pot.`,
      `Net: ${netLine(summary.net, names)}`,
      ...paymentLines(simplifyTransfers(summary.net), names),
    );
  } else {
    const standings = Object.values(state.players)
      .sort((a, b) => a.total - b.total || name(names, a.id).localeCompare(name(names, b.id)))
      .map((p) => `${name(names, p.id)} ${p.total}${p.active ? '' : ' (out)'}`);
    lines.push(`Round ${state.rounds.length + 1} in progress`, standings.join(', '));
  }
  if (url) lines.push(summary ? `Full scores: ${url}` : `Watch live: ${url}`);
  return lines.join('\n');
}

/** A night's results for a group chat: the nets and who pays whom. */
export function nightShareText(args: {
  leagueName: string;
  dayLabel: string;
  finishedGames: number;
  inProgress: number;
  nets: Record<string, number>;
  transfers: Transfer[];
  names: Record<string, string>;
}): string {
  const { leagueName, dayLabel, finishedGames, inProgress, nets, transfers, names } = args;
  const lines = [
    `${leagueName} · ${dayLabel}`,
    `${finishedGames} game${finishedGames === 1 ? '' : 's'}`,
    `Net: ${netLine(nets, names)}`,
  ];
  const payments = paymentLines(transfers, names);
  if (payments.length > 0) lines.push('Settling up:', ...payments);
  if (inProgress > 0) {
    lines.push(`(${inProgress} game${inProgress === 1 ? '' : 's'} still in progress, not counted)`);
  }
  return lines.join('\n');
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Puts text on the clipboard. Returns false when the browser won't allow it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the phone's share sheet where there is one, so the text goes straight to a chat. Anywhere
 * else, or if the sheet can't open, the text is copied instead so it can be pasted.
 */
export async function shareOrCopy(title: string, text: string): Promise<ShareResult> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (error) {
      // Closing the share sheet is an answer, not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

/** The address of a game's read-only view. */
export const viewUrl = (code: string) => `${window.location.origin}/view/${code}`;
