import { EngineError, type Round, type ScrapInfo } from './types';

export type ScrapMeta = Omit<ScrapInfo, 'reason'> & { reason: string };

const bySeq = (a: Round, b: Round) => a.seq - b.seq;

/** Rounds that count toward the game, oldest first. */
export function liveRounds(rounds: Round[]): Round[] {
  return rounds.filter((r) => !r.scrapped).sort(bySeq);
}

/** Seq for a new round: scrapped rounds keep their seq, so it is one past the highest of all. */
export function nextSeq(rounds: Round[]): number {
  return rounds.reduce((max, r) => Math.max(max, r.seq), 0) + 1;
}

/** The only round that can be scrapped on its own: the latest one that still counts. */
export function latestScrappable(rounds: Round[]): Round | undefined {
  return liveRounds(rounds).at(-1);
}

function requireReason(meta: ScrapMeta): void {
  if (meta.reason.trim() === '') throw new EngineError('A reason is required to scrap a round');
}

function mark(round: Round, meta: ScrapMeta): Round {
  return { ...round, scrapped: { by: meta.by, at: meta.at, reason: meta.reason.trim() } };
}

/** Scraps the latest live round. Returns a new array. */
export function scrapLatest(rounds: Round[], meta: ScrapMeta): Round[] {
  requireReason(meta);
  const latest = latestScrappable(rounds);
  if (!latest) throw new EngineError('There is no round to scrap');
  return rounds.map((r) => (r === latest ? mark(r, meta) : r));
}

/** Seqs that scrapping back to `toSeq` would scrap, latest first. `toSeq` 0 means every round. */
export function seqsAfter(rounds: Round[], toSeq: number): number[] {
  const live = liveRounds(rounds);
  if (toSeq !== 0 && !live.some((r) => r.seq === toSeq)) {
    throw new EngineError(`Round ${toSeq} is not a live round`);
  }
  return live
    .filter((r) => r.seq > toSeq)
    .map((r) => r.seq)
    .reverse();
}

/** Scraps every live round after `toSeq` in one step, with one reason. */
export function rollbackTo(rounds: Round[], toSeq: number, meta: ScrapMeta): Round[] {
  requireReason(meta);
  const seqs = new Set(seqsAfter(rounds, toSeq));
  if (seqs.size === 0) throw new EngineError('There is nothing to roll back');
  return rounds.map((r) => (seqs.has(r.seq) ? mark(r, meta) : r));
}

/**
 * The round that can be restored next. Restoring goes in reverse order of scrapping, so it is the
 * earliest scrapped round, and only while no live round has been added after it.
 */
export function nextRestorable(rounds: Round[]): Round | undefined {
  const earliest = rounds.filter((r) => r.scrapped).sort(bySeq)[0];
  if (!earliest) return undefined;
  const live = liveRounds(rounds);
  const lastLive = live.at(-1);
  return lastLive && lastLive.seq > earliest.seq ? undefined : earliest;
}

export function restoreNext(rounds: Round[]): Round[] {
  const target = nextRestorable(rounds);
  if (!target) throw new EngineError('There is no round that can be restored');
  return rounds.map((r) => (r === target ? { ...r, scrapped: null } : r));
}
