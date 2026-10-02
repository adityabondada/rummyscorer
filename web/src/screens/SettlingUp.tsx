import { settledKey, type SettledDoc } from '@rummy/data';
import type { Transfer } from '@rummy/engine';
import { Badge, Button } from '../ui';

interface Props {
  /** The night these payments belong to, as "YYYY-MM-DD". */
  day: string;
  transfers: Transfer[];
  names: Record<string, string>;
  /** Paid records by id. A record only counts if its id matches the payment exactly. */
  settled: Record<string, SettledDoc>;
  /** Names for the uids that marked payments, to say who did. */
  uidNames: Record<string, string>;
  /** Games still being played that night, which are not in these payments yet. */
  inProgress: number;
  onMarkPaid: (transfer: Transfer) => void;
  /** Marks every payment in the list as paid in one go. */
  onMarkAllPaid: (transfers: Transfer[]) => void;
  onUndo: (key: string) => void;
}

/** Who pays whom for a night, with a way to tick each payment off once it has been made. */
export function SettlingUp({
  day,
  transfers,
  names,
  settled,
  uidNames,
  inProgress,
  onMarkPaid,
  onMarkAllPaid,
  onUndo,
}: Props) {
  if (transfers.length === 0) return null;
  const nameOf = (id: string) => names[id] ?? '?';
  const keyOf = (t: Transfer) => settledKey(day, t.from, t.to, t.amount);
  const paidCount = transfers.filter((t) => settled[keyOf(t)]).length;
  const allPaid = paidCount === transfers.length;
  const unpaid = transfers.filter((t) => !settled[keyOf(t)]);

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Settling up</h3>
        {allPaid && inProgress === 0 ? (
          <Badge tone="green">All settled</Badge>
        ) : (
          <span className="text-xs text-slate-500">
            {paidCount} of {transfers.length} paid
          </span>
        )}
      </div>
      <ul className="space-y-1.5 text-sm">
        {transfers.map((t) => {
          const key = keyOf(t);
          const record = settled[key];
          return (
            <li key={key} className="flex items-center justify-between gap-2">
              <span className={record ? 'text-slate-400 line-through' : undefined}>
                <strong>{nameOf(t.from)}</strong> pays <strong>{nameOf(t.to)}</strong> ${t.amount}
              </span>
              {record ? (
                <span className="flex shrink-0 items-center gap-1">
                  <Badge tone="green">Paid</Badge>
                  <span className="sr-only">marked by {uidNames[record.by] ?? 'someone'}</span>
                  <Button variant="ghost" small onClick={() => onUndo(key)}>
                    Undo
                  </Button>
                </span>
              ) : (
                <Button variant="secondary" small onClick={() => onMarkPaid(t)}>
                  Mark paid
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {unpaid.length > 1 && (
        <Button
          variant="secondary"
          small
          className="mt-2 w-full"
          onClick={() => onMarkAllPaid(unpaid)}
        >
          Mark all paid ({unpaid.length})
        </Button>
      )}
      {inProgress > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          Not counting {inProgress} game{inProgress > 1 ? 's' : ''} still in progress.
        </p>
      )}
    </div>
  );
}
