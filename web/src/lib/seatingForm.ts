import { resolveSeating, type PlayerId, type Rank, type SeatingResult } from '@rummy/engine';

/** What the card form shows for one player. */
export interface DrawView {
  /** One entry per card box; '' is a box still to fill. */
  slots: string[];
  /** 'redraw': enter another card. 'waiting': tied, but others still have to redraw first. */
  status: 'idle' | 'redraw' | 'waiting';
}

export interface DrawForm {
  result: SeatingResult | null;
  view: Record<PlayerId, DrawView>;
}

/**
 * Works out the card boxes for the players picked. Everyone starts with one box. When players tie,
 * only they get another box, and only once the whole tied group has caught up: if Asha has redrawn
 * and Bo hasn't, Asha waits for Bo rather than being asked for a third card.
 */
export function drawForm(picked: PlayerId[], draws: Record<PlayerId, string[]>): DrawForm {
  const filled: Record<PlayerId, Rank[]> = Object.fromEntries(
    picked.map((id) => [id, (draws[id] ?? ['']).filter(Boolean) as Rank[]]),
  );
  const result = picked.length >= 2 ? resolveSeating(filled) : null;
  const groups = result && !result.resolved ? result.redraw : [];
  const len = (id: PlayerId) => filled[id]?.length ?? 0;

  const view: Record<PlayerId, DrawView> = {};
  for (const id of picked) {
    const slots = draws[id] ?? [''];
    const group = groups.find((g) => g.includes(id));
    // Nobody is "tied" until they have a card; blank boxes just need filling in.
    if (!group || len(id) === 0) {
      view[id] = { slots, status: 'idle' };
      continue;
    }
    if (!slots.every(Boolean)) {
      view[id] = { slots, status: 'redraw' };
      continue;
    }
    const most = Math.max(...group.map(len));
    const needsAnother = len(id) < most || group.every((member) => len(member) === most);
    view[id] = needsAnother
      ? { slots: [...slots, ''], status: 'redraw' }
      : { slots, status: 'waiting' };
  }
  return { result, view };
}
