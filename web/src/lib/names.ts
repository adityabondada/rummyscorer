import { makeResolveId } from '@rummy/data';
import type { PlayerMap } from './game';

/** Display names by player id; a merged guest shows the name of the member they became. */
export function playerNames(players: PlayerMap): Record<string, string> {
  const resolve = makeResolveId(players);
  const names: Record<string, string> = {};
  for (const [id, player] of Object.entries(players)) {
    names[id] = players[resolve(id)]?.name ?? player.name;
  }
  return names;
}

/** Who can be picked for a new game: current profiles that aren't retired or merged away. */
export function pickablePlayers(players: PlayerMap): { id: string; name: string }[] {
  return Object.entries(players)
    .filter(([, p]) => !p.retired && p.mergedInto === null)
    .map(([id, p]) => ({ id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Guests nobody has claimed yet, for the "That's me" step when someone joins. */
export function unclaimedGuests(players: PlayerMap): { id: string; name: string }[] {
  return Object.entries(players)
    .filter(([, p]) => p.linkedUid === null && p.mergedInto === null && !p.retired)
    .map(([id, p]) => ({ id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Swaps ids in an engine error message for names, so it reads naturally. */
export function describeError(message: string, names: Record<string, string>): string {
  const ids = Object.keys(names).sort((a, b) => b.length - a.length);
  if (ids.length === 0) return message;
  // Whole ids only, in one pass, so an id can't match inside a word or inside a name just added.
  const escaped = ids.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return message.replace(new RegExp(`\\b(${escaped.join('|')})\\b`, 'g'), (id) => names[id] ?? id);
}
