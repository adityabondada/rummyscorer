import { useState } from 'react';
import { suggestSplit, type GameState } from '@rummy/engine';
import { Button, ErrorText, Field, Modal, money } from '../../ui';

/** Asks why, then runs the action. Used for scrapping and rolling back. */
export function ReasonModal({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const problem = await onConfirm(reason.trim());
          if (problem) {
            setError(problem);
            setBusy(false);
          }
        }}
      >
        <p className="text-sm text-slate-600">{description}</p>
        <Field
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          autoFocus
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="danger" className="w-full" disabled={busy || !reason.trim()}>
          {confirmLabel}
        </Button>
      </form>
    </Modal>
  );
}

/** A plain "are you sure" for something that can't be undone. */
export function ConfirmModal({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{description}</p>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const problem = await onConfirm();
              if (problem) {
                setError(problem);
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Pick which round to roll back to; everything after it is scrapped in one step. */
export function RollbackModal({
  liveSeqs,
  onConfirm,
  onClose,
}: {
  liveSeqs: number[];
  onConfirm: (toSeq: number, reason: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [toSeq, setToSeq] = useState(String(Math.max(0, liveSeqs.at(-2) ?? 0)));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const target = Number(toSeq);
  const scrapped = liveSeqs.filter((s) => s > target).length;

  return (
    <Modal title="Roll back" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const problem = await onConfirm(target, reason.trim());
          if (problem) {
            setError(problem);
            setBusy(false);
          }
        }}
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Roll back to the end of
          </span>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
            value={toSeq}
            onChange={(e) => setToSeq(e.target.value)}
          >
            <option value="0">Before round 1</option>
            {liveSeqs.slice(0, -1).map((s) => (
              <option key={s} value={s}>
                Round {s}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-slate-600">
          Scraps {scrapped} round{scrapped === 1 ? '' : 's'}. They stay visible, struck through, and
          can be restored.
        </p>
        <Field
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
        />
        <ErrorText>{error}</ErrorText>
        <Button
          type="submit"
          variant="danger"
          className="w-full"
          disabled={busy || !reason.trim() || scrapped === 0}
        >
          Roll back
        </Button>
      </form>
    </Modal>
  );
}

/** Choose where a returning player sits; they re-enter at the highest active score plus one. */
export function RejoinModal({
  state,
  playerId,
  names,
  entryScore,
  onConfirm,
  onClose,
}: {
  state: GameState;
  playerId: string;
  names: Record<string, string>;
  entryScore: number;
  onConfirm: (seatIndex: number) => Promise<string | null>;
  onClose: () => void;
}) {
  const others = state.seatOrder.filter((id) => id !== playerId);
  const [seat, setSeat] = useState(others.length);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={`${names[playerId] ?? '?'} rejoins`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Pays the ${state.settings.buyIn} buy-in, which goes in the pot, and re-enters on{' '}
          <strong>{entryScore}</strong> points.
        </p>
        <p className="text-sm font-medium">Where do they sit?</p>
        <ol className="space-y-1">
          {Array.from({ length: others.length + 1 }, (_, slot) => (
            <li key={slot}>
              <button
                type="button"
                aria-pressed={seat === slot}
                onClick={() => setSeat(slot)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ring-1 ${
                  seat === slot ? 'bg-slate-100 ring-slate-900' : 'ring-slate-200'
                }`}
              >
                {seat === slot ? (
                  <strong>{names[playerId] ?? '?'} sits here</strong>
                ) : (
                  <span className="text-slate-500">
                    {slot === 0 ? 'First seat' : `Seat ${slot + 1}`}
                  </span>
                )}
                {others[slot] && seat !== slot && (
                  <span className="ml-auto">{names[others[slot]!]}</span>
                )}
              </button>
            </li>
          ))}
        </ol>
        <ErrorText>{error}</ErrorText>
        <Button
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const problem = await onConfirm(seat);
            if (problem) {
              setError(problem);
              setBusy(false);
            }
          }}
        >
          Rejoin for ${state.settings.buyIn}
        </Button>
      </div>
    </Modal>
  );
}

/** Suggests a split from the engine, lets members change the amounts, and checks they add up. */
export function SplitModal({
  state,
  names,
  onConfirm,
  onClose,
}: {
  state: GameState;
  names: Record<string, string>;
  onConfirm: (shares: Record<string, number>) => Promise<string | null>;
  onClose: () => void;
}) {
  const suggestion = suggestSplit(state);
  const ids = Object.keys(suggestion.shares);
  const [shares, setShares] = useState<Record<string, string>>(
    Object.fromEntries(ids.map((id) => [id, String(suggestion.shares[id])])),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = ids.map((id) => (/^\d+$/.test(shares[id] ?? '') ? Number(shares[id]) : NaN));
  const total = parsed.reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);
  const valid = parsed.every((n) => !Number.isNaN(n)) && total === state.pot;

  return (
    <Modal title="End with a split" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          The pot is <strong>${state.pot}</strong>. This suggestion weighs how far each player is
          from the limit and how many drops they have left. Change any amount; the total has to
          match the pot.
        </p>
        <ul className="space-y-2">
          {ids.map((id) => (
            <li key={id} className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{names[id] ?? '?'}</span>
                <span className="block text-xs text-slate-500">
                  {state.players[id]!.total} pts · weight {suggestion.weights[id]}
                </span>
              </span>
              <span className="flex items-center gap-1">
                $
                <input
                  aria-label={`${names[id] ?? '?'} share`}
                  inputMode="numeric"
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-right"
                  value={shares[id]}
                  onChange={(e) => setShares({ ...shares, [id]: e.target.value })}
                />
              </span>
            </li>
          ))}
        </ul>
        <p className={valid ? 'text-sm text-emerald-700' : 'text-sm text-red-700'}>
          Total {money(total).replace('+', '')} of ${state.pot}
          {total !== state.pot &&
            ` (${total < state.pot ? '$' + (state.pot - total) + ' left' : '$' + (total - state.pot) + ' over'})`}
        </p>
        <ErrorText>{error}</ErrorText>
        <Button
          className="w-full"
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            const problem = await onConfirm(
              Object.fromEntries(ids.map((id, i) => [id, parsed[i]!])),
            );
            if (problem) {
              setError(problem);
              setBusy(false);
            }
          }}
        >
          End game with this split
        </Button>
      </div>
    </Modal>
  );
}
