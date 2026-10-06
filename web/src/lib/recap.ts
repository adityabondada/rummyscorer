import { summarize, type GameState } from '@rummy/engine';
import { pick } from './quips';

/** A short, light-hearted story of a finished game, built from what actually happened in it. */
export interface Recap {
  headline: string;
  lines: string[];
}

interface Fact {
  /** Lower comes first; only the best few are told. */
  rank: number;
  text: string;
}

const MAX_LINES = 3;
/** How far behind the winner has to have been for it to count as a comeback. */
const COMEBACK_GAP = 30;

const fill = (line: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), line);

const headlines = {
  win: [
    '{name} walks off with ${pot}.',
    '{name} takes ${pot} and the bragging rights.',
    '{name} wins ${pot}. Everyone else wins a story.',
    '${pot} goes to {name}, who will bring it up next week.',
  ],
  split: [
    'No winner, just a very polite split.',
    'Nobody could finish it, so the pot was shared.',
    'A split pot. Diplomacy wins.',
  ],
};

const lines = {
  rejoinOutAgain: [
    '{name} bought back in and went out again. Brave. Expensive, but brave.',
    '{name} paid ${buyIn} for a second chance and used it to go out a second time.',
    '{name} came back from the dead, then went straight back. A short sequel.',
  ],
  rejoinWin: [
    '{name} was out, paid ${buyIn} to come back, and still took the pot. Cinema.',
    '{name} went out, bought in again and won. Some call it a plan.',
    'Written off and back in, {name} went on to win. Nobody saw it coming.',
  ],
  comeback: [
    '{name} was {gap} points behind at one stage and still won. Never write off a quiet player.',
    'From {gap} points adrift to the pot. {name} took the long way round.',
    '{name} trailed by {gap} and did not mention it once. Then won.',
  ],
  wire: [
    '{name} led from start to finish. Where was the drama?',
    '{name} was never behind from the first round. Tidy, and a bit annoying.',
  ],
  slamOnce: [
    '{name} hit {cap} once. Once was enough for the whole table to hear.',
    '{name} took a full count of {cap}. The cards were not kind.',
  ],
  slamMany: [
    '{name} took a full count of {cap}, {n} times. At this point it is a hobby.',
    '{cap} points, {n} times, from {name}. Collecting them, are we?',
  ],
  firstOut: [
    '{name} was the first to go, on round {round}. Somebody had to.',
    'Round {round} claimed {name} first. The snacks are free now.',
  ],
  close: [
    '{name} finished on {total}, just {left} from the edge. Heart rate: elevated.',
    '{name} ended {left} short of the limit. A near miss with a clean conscience.',
  ],
  dropper: [
    '{name} dropped {n} times. Strategy, or nerves?',
    '{name} folded {n} times. Cautious, to put it kindly.',
  ],
  penalty: [
    '{name} picked up a penalty for a wrong show. Lesson learned, hopefully.',
    'A penalty for {name}. The rules are not just a suggestion.',
  ],
  quick: [
    'Over in {rounds} rounds. Somebody had somewhere to be.',
    '{rounds} rounds and done. Barely time for tea.',
  ],
  long: [
    '{rounds} rounds. Snacks were consumed, friendships were tested.',
    'It took {rounds} rounds. Nobody wanted to go home first.',
  ],
  quiet: [
    'A clean, quiet game. Suspiciously well behaved.',
    'No drama at all. The calm before the next game.',
  ],
};

/**
 * Works out the story of a finished game: the winner, then up to three of the best things that
 * happened, such as a comeback, a full count or someone going out twice. The same game always tells
 * the same story, so everyone who sees it sees the same jokes. Null while the game is still on.
 */
export function buildRecap(state: GameState, names: Record<string, string>): Recap | null {
  const summary = summarize(state);
  if (!summary || state.rounds.length === 0) return null;

  const nameOf = (id: string) => names[id] ?? '?';
  const { limit, buyIn } = state.settings;
  const cap = state.settings.maxRoundPenalty ?? 80;
  const key = `${summary.rounds}:${summary.winnerIds.join(',')}:${summary.pot}`;
  const tell = (kind: keyof typeof lines, vars: Record<string, string | number>) =>
    fill(pick(lines[kind], `${key}:${kind}:${vars.name ?? ''}`), { cap, buyIn, ...vars });

  const winners = summary.winnerIds;
  const split = summary.outcome === 'split';
  const lead = winners.map(nameOf).join(' & ');
  const headline = split
    ? pick(headlines.split, key)
    : fill(pick(headlines.win, key), { name: lead, pot: summary.pot });

  const facts: Fact[] = [];
  const add = (rank: number, text: string) => facts.push({ rank, text });
  const ids = Object.keys(state.players);

  const outCount = (id: string) => state.rounds.filter((r) => r.eliminated.includes(id)).length;
  const slams = (id: string) =>
    state.rounds.filter((r) => cap > 0 && (r.points[id] ?? 0) >= cap).length;

  // Went out, came back, and went out again.
  const doubleOut = ids
    .filter((id) => state.players[id]!.rejoins > 0 && outCount(id) >= 2)
    .sort((a, b) => outCount(b) - outCount(a) || nameOf(a).localeCompare(nameOf(b)))[0];
  if (doubleOut) add(1, tell('rejoinOutAgain', { name: nameOf(doubleOut) }));

  const winner = split ? null : winners[0]!;
  if (winner && state.players[winner]!.rejoins > 0) {
    add(2, tell('rejoinWin', { name: nameOf(winner) }));
  }

  // How far behind the winner ever was, among the players still in at the time.
  if (winner && state.rounds.every((r) => r.totals)) {
    let behind = 0;
    let neverBehind = true;
    for (const r of state.rounds) {
      const rivals = ids.filter((id) => id !== winner && r.totals[id]! <= limit);
      if (rivals.length === 0) continue;
      const gap = r.totals[winner]! - Math.min(...rivals.map((id) => r.totals[id]!));
      behind = Math.max(behind, gap);
      if (gap > 0) neverBehind = false;
    }
    if (behind >= COMEBACK_GAP && state.players[winner]!.rejoins === 0) {
      add(3, tell('comeback', { name: nameOf(winner), gap: behind }));
    } else if (neverBehind && state.rounds.length >= 3) {
      add(9, tell('wire', { name: nameOf(winner) }));
    }
  }

  // The full counts.
  const slammer = ids
    .filter((id) => slams(id) > 0)
    .sort((a, b) => slams(b) - slams(a) || nameOf(a).localeCompare(nameOf(b)))[0];
  if (slammer) {
    const n = slams(slammer);
    add(
      4,
      n === 1
        ? tell('slamOnce', { name: nameOf(slammer) })
        : tell('slamMany', { name: nameOf(slammer), n }),
    );
  }

  const firstOut = state.rounds.find((r) => r.eliminated.length > 0);
  if (firstOut) {
    const id = firstOut.eliminated[0]!;
    if (id !== doubleOut) {
      add(5, tell('firstOut', { name: nameOf(id), round: firstOut.seq }));
    }
  }

  const near = ids
    .filter((id) => !winners.includes(id) && state.players[id]!.active)
    .map((id) => ({ id, left: limit - state.players[id]!.total }))
    .filter((c) => c.left <= 10)
    .sort((a, b) => a.left - b.left)[0];
  if (near) {
    const total = state.players[near.id]!.total;
    add(6, tell('close', { name: nameOf(near.id), total, left: near.left }));
  }

  const dropper = ids
    .filter((id) => state.players[id]!.dropsUsed >= 3)
    .sort((a, b) => state.players[b]!.dropsUsed - state.players[a]!.dropsUsed)[0];
  if (dropper) {
    add(7, tell('dropper', { name: nameOf(dropper), n: state.players[dropper]!.dropsUsed }));
  }

  const penalised = ids.find((id) => state.players[id]!.penalties > 0);
  if (penalised) add(8, tell('penalty', { name: nameOf(penalised) }));

  if (summary.rounds <= 3) add(10, tell('quick', { rounds: summary.rounds }));
  else if (summary.rounds >= 12) add(10, tell('long', { rounds: summary.rounds }));

  const told = facts
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_LINES)
    .map((f) => f.text);
  return { headline, lines: told.length > 0 ? told : [tell('quiet', {})] };
}
