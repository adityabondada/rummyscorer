import type { GameState, RoundEntry, RoundRecord } from '@rummy/engine';
import type { RoundSnapshot } from '@rummy/data';
import { bySeq, type RoundRow } from '../../lib/game';
import { reasonLabel } from '../../lib/roundEntry';
import { EmptyState } from '../../suits';
import { Badge, Button, cx } from '../../ui';

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const entryText = (e: RoundEntry) =>
  e.kind === 'points' ? String(e.points) : e.kind === 'drop' ? 'Drop' : 'Middle drop';

/** "Asha won; Bo 25, Cy Drop" for a stored round, using the names at hand. */
function snapshotText(snap: RoundSnapshot, nameOf: (id: string) => string) {
  const others = Object.entries(snap.entries).map(([id, e]) => `${nameOf(id)} ${entryText(e)}`);
  if (snap.penalty) {
    const { playerId, points, reason } = snap.penalty;
    return `${reasonLabel(reason)}, ${nameOf(playerId)} took ${points}; ${others.join(', ')}`;
  }
  return `${snap.winnerId ? nameOf(snap.winnerId) : '?'} won; ${others.join(', ')}`;
}

interface Props {
  rows: RoundRow[];
  state: GameState | null;
  names: Record<string, string>;
  /** Who edited, by sign-in uid. */
  uidNames: Record<string, string>;
  /** Stored game ids to the names shown for them (merged guests show as the member). */
  onEdit: ((row: RoundRow) => void) | null;
}

export function RoundList({ rows, state, names, uidNames, onEdit }: Props) {
  const nameOf = (id: string) => names[id] ?? '?';
  const byName = (uid: string) => uidNames[uid] ?? 'someone';
  const records = new Map<number, RoundRecord>((state?.rounds ?? []).map((r) => [r.seq, r]));
  const ordered = bySeq(rows).reverse();

  if (ordered.length === 0) {
    return (
      <EmptyState title="No rounds yet">Enter the first round once the cards are dealt.</EmptyState>
    );
  }

  return (
    <ul className="space-y-2">
      {ordered.map((row) => {
        const { doc } = row;
        if (doc.scrapped) {
          return (
            <li
              key={row.id}
              className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 ring-1 ring-slate-200"
            >
              <p className="font-medium line-through">Round {doc.seq}</p>
              <p>
                Scrapped by {byName(doc.scrapped.by)} · {when(doc.scrapped.at)}: “
                {doc.scrapped.reason}”
              </p>
            </li>
          );
        }
        const record = records.get(doc.seq);
        return (
          <li key={row.id} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  Round {doc.seq}
                  {record && (
                    <span className="font-normal text-slate-500">
                      {' '}
                      · dealt by {nameOf(record.dealerId)}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-600">
                  {!record
                    ? '?'
                    : record.penalty
                      ? `${reasonLabel(record.penalty.reason)}: ${nameOf(record.penalty.playerId)} took ${record.penalty.points}`
                      : `${record.winnerId ? nameOf(record.winnerId) : '?'} won`}
                </p>
              </div>
              {onEdit && (
                <Button variant="ghost" small onClick={() => onEdit(row)}>
                  Edit
                </Button>
              )}
            </div>
            {record && (
              <ul className="mt-2 flex flex-wrap gap-1.5 text-sm">
                {Object.entries(record.points).map(([id, points]) => {
                  const entry = record.entries[id];
                  const out = record.eliminated.includes(id);
                  return (
                    <li
                      key={id}
                      className={cx(
                        'rounded-full px-2.5 py-1',
                        id === record.winnerId ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100',
                        id === record.penalty?.playerId && 'bg-amber-100 text-amber-900',
                        out && 'bg-red-100 text-red-900',
                      )}
                    >
                      {nameOf(id)} {points}
                      {entry && entry.kind !== 'points' && (
                        <span className="ml-1 text-xs">
                          ({entry.kind === 'drop' ? 'drop' : 'middle drop'})
                        </span>
                      )}
                      {out && <span className="ml-1 text-xs">out</span>}
                    </li>
                  );
                })}
                {record.rejoined.map((id) => (
                  <li key={`r-${id}`}>
                    <Badge tone="amber">{nameOf(id)} rejoined</Badge>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-500">
              {doc.history.length > 0 ? 'Last edited' : 'Entered'} by {byName(doc.updatedBy)} ·{' '}
              {when(doc.updatedAt)}
            </p>
            {doc.history.length > 0 && (
              <details className="mt-1 text-xs text-slate-500">
                <summary className="cursor-pointer">
                  Earlier versions ({doc.history.length})
                </summary>
                <ul className="mt-1 space-y-1">
                  {[...doc.history].reverse().map((h, i) => (
                    <li key={i}>
                      Before {byName(h.by)}'s change at {when(h.at)}: {snapshotText(h.prev, nameOf)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
