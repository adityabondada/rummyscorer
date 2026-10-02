import type { ResolveId } from '@rummy/engine';

/**
 * Builds the id resolver the engine takes. A merged guest points at the profile it was merged
 * into, and that profile may itself have been merged later, so this follows the chain to the end.
 * A cycle can't be created through the functions, but if one ever existed this stops rather than
 * looping.
 */
export function makeResolveId(
  players: Record<string, { mergedInto: string | null } | undefined>,
): ResolveId {
  return (id) => {
    const seen = new Set<string>();
    let current = id;
    for (;;) {
      const next = players[current]?.mergedInto;
      if (!next || seen.has(current)) return current;
      seen.add(current);
      current = next;
    }
  };
}
