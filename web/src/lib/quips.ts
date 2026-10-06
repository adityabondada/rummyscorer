export type QuipKind = 'slam' | 'out' | 'back';

const lines: Record<QuipKind, string[]> = {
  slam: [
    '{cap}! {name} is collecting every point on the table.',
    '{name} went all in. On the wrong thing.',
    'Full count! {name} held nothing back.',
    '{name} is building quite the points collection.',
    'Ouch. {name} never saw that coming.',
    '{cap}! {name} does love a bit of drama.',
    '{name} took the scenic route to {cap}.',
    'That hand fought back, {name}.',
  ],
  out: [
    '{name} has left the building.',
    'Gone but not forgotten, {name}.',
    '{name} is out. Time for snacks.',
    'Moment of silence for {name}’s hopes.',
    'The cards win this one, {name}.',
    '{name} exits, stage left.',
    '{name} has been promoted to spectator.',
  ],
  back: [
    '{name} is back. Did someone say sequel?',
    '{name} paid ${buyIn} for a second chance.',
    'Plot twist: {name} returns!',
    '{name} just can’t stay away.',
    'Back from the dead, {name}!',
    '{name} bought their way back in.',
    'Never count {name} out. Oh wait, you did.',
  ],
};

/** A small, stable number from a string, so every screen picks the same line for the same moment. */
function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * A light-hearted line for a moment in the game. The same `key` always gives the same line, so
 * everyone watching the same game sees the same joke; different rounds and players vary.
 */
export function quip(
  kind: QuipKind,
  key: string,
  vars: { name: string; cap?: number; buyIn?: number },
): string {
  const pool = lines[kind];
  const line = pool[hash(`${kind}:${key}`) % pool.length]!;
  return line
    .replaceAll('{name}', vars.name)
    .replaceAll('{cap}', String(vars.cap ?? 80))
    .replaceAll('{buyIn}', String(vars.buyIn ?? 0));
}

export const quipCount = (kind: QuipKind): number => lines[kind].length;
