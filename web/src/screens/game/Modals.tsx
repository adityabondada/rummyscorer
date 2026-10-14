import { useState } from 'react';
import { displayOrder, suggestSplit, type GameState } from '@rummy/engine';
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

/**
 * Choose where a returning player sits; they re-enter at the highest active score plus one. Only
 * the players still in the game are listed, in the order the table was set up in, with a place to
 * sit between each pair and at the end. The deal goes down the list and back to the top.
 */
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
  const nameOf = (id: string) => names[id] ?? '?';
  const inGame = displayOrder(state).filter((id) => id !== playerId && state.players[id]!.active);
  // Places are numbered by the player they come before; the last one is after everyone, which is
  // the same gap as before the first player, because the deal wraps.
  // Whoever is due to deal next, and whoever is due the opening card, must still be, so nobody can
  // sit just before either of them.
  // With so few players left that every place would do that, any place is allowed.
  const isDue = (id: string | undefined) => id === state.dealerId || id === state.firstPlayerId;
  const everyPlaceBlocked = inGame.length > 0 && inGame.every(isDue);
  const blocked = (at: number) => !everyPlaceBlocked && isDue(inGame[at % inGame.length]);
  const first = [inGame.length, ...inGame.keys()].find((at) => !blocked(at)) ?? inGame.length;
  const [place, setPlace] = useState(first);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // The engine wants a seat among everyone, players who are out included. Sitting next to an
  // active player puts them in the same place in the deal, whoever is out in between.
  const everyone = state.seatOrder.filter((id) => id !== playerId);
  const seatIndex =
    inGame.length === 0
      ? everyone.length
      : place < inGame.length
        ? everyone.indexOf(inGame[place]!)
        : everyone.indexOf(inGame[inGame.length - 1]!) + 1;

  const spot = (at: number) => (
    <li key={`spot-${at}`}>
      <button
        type="button"
        aria-pressed={place === at}
        disabled={blocked(at)}
        aria-label={
          at < inGame.length
            ? `Sit before ${nameOf(inGame[at]!)}`
            : inGame.length > 0
              ? `Sit after ${nameOf(inGame[inGame.length - 1]!)}`
              : 'Sit here'
        }
        onClick={() => setPlace(at)}
        className={`flex w-full items-center rounded-lg px-3 text-left text-sm ring-1 ${
          place === at ? 'bg-slate-100 py-2.5 ring-slate-900' : 'py-1.5 ring-slate-200'
        } ${blocked(at) ? 'opacity-40' : ''}`}
      >
        {place === at ? (
          <strong>{nameOf(playerId)} sits here</strong>
        ) : (
          <span className="text-slate-400">{blocked(at) ? 'Not here' : 'Sit here'}</span>
        )}
      </button>
    </li>
  );

  return (
    <Modal title={`${nameOf(playerId)} rejoins`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Pays the ${state.settings.buyIn} buy-in, which goes in the pot, and re-enters on{' '}
          <strong>{entryScore}</strong> points.
        </p>
        <div>
          <p className="text-sm font-medium">Where do they sit?</p>
          <p className="text-xs text-slate-500">
            The deal goes down this list and back to the top. Tap the place they take. They can't
            sit where it would change who deals next or who gets the opening card.
          </p>
        </div>
        <ol className="space-y-1" aria-label="Seating order">
          {inGame.map((id, i) => [
            spot(i),
            <li key={id} className="px-3 py-1.5 text-sm">
              <span className="font-medium">{nameOf(id)}</span>
              {id === state.dealerId && (
                <span className="text-xs text-slate-500"> · deals next</span>
              )}
              {id === state.firstPlayerId && (
                <span className="text-xs text-slate-500"> · opening card</span>
              )}
            </li>,
          ])}
          {spot(inGame.length)}
        </ol>
        <ErrorText>{error}</ErrorText>
        <Button
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const problem = await onConfirm(seatIndex);
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

/**
 * Adds people who were not in the game when it started. Pick who, and how many drops each starts
 * with; they all pay the buy-in and enter on the same score, and sit just before whoever deals next.
 */
export function JoinModal({
  state,
  names,
  candidates,
  entryScore,
  onConfirm,
  onAddGuest,
  onClose,
}: {
  state: GameState;
  names: Record<string, string>;
  /** League players who are not in this game. */
  candidates: { id: string; name: string }[];
  entryScore: number;
  onConfirm: (joins: { playerId: string; drops: number }[]) => Promise<string | null>;
  /** Adds a new guest to the league; resolves to a message when it can't. */
  onAddGuest: (name: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const { maxDrops, buyIn } = state.settings;
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [guest, setGuest] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const nameOf = (id: string | null) => (id ? (names[id] ?? '?') : '?');
  const count = Object.keys(picked).length;
  const toggle = (id: string) =>
    setPicked((p) => {
      const { [id]: was, ...rest } = p;
      return was === undefined ? { ...p, [id]: maxDrops } : rest;
    });

  return (
    <Modal title="Add players" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Each pays the ${buyIn} buy-in, which goes in the pot, and comes in on{' '}
          <strong>{entryScore}</strong> points. They sit just before{' '}
          <strong>{nameOf(state.dealerId)}</strong>, so {nameOf(state.dealerId)} still deals and{' '}
          <strong>{nameOf(state.firstPlayerId)}</strong> still gets the opening card.
        </p>
        {candidates.length === 0 ? (
          <p className="text-sm text-slate-500">Everyone in the league is already in this game.</p>
        ) : (
          <ul className="space-y-1" aria-label="Players to add">
            {candidates.map((c) => {
              const on = picked[c.id] !== undefined;
              return (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 ring-1 ring-slate-200"
                >
                  <label className="flex min-w-0 items-center gap-2 text-sm">
                    <input type="checkbox" checked={on} onChange={() => toggle(c.id)} />
                    <span className="truncate font-medium">{c.name}</span>
                  </label>
                  {on && (
                    <label className="flex items-center gap-1 text-xs text-slate-600">
                      Drops
                      <select
                        aria-label={`Drops for ${c.name}`}
                        className="rounded border border-slate-300 bg-white px-1 py-0.5 text-sm"
                        value={picked[c.id]}
                        onChange={(e) => setPicked({ ...picked, [c.id]: Number(e.target.value) })}
                      >
                        {Array.from({ length: maxDrops + 1 }, (_, n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const problem = await onAddGuest(guest);
            if (problem) setError(problem);
            else {
              setError('');
              setGuest('');
            }
          }}
        >
          <div className="min-w-0 flex-1">
            <Field
              label="Someone new?"
              placeholder="Name"
              value={guest}
              maxLength={40}
              onChange={(e) => setGuest(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={!guest.trim()}>
            Add to league
          </Button>
        </form>
        <ErrorText>{error}</ErrorText>
        <Button
          className="w-full"
          disabled={busy || count === 0}
          onClick={async () => {
            setBusy(true);
            const problem = await onConfirm(
              Object.entries(picked).map(([playerId, drops]) => ({ playerId, drops })),
            );
            if (problem) {
              setError(problem);
              setBusy(false);
            }
          }}
        >
          {count === 0 ? 'Pick who to add' : `Add ${count} for $${count * buyIn}`}
        </Button>
      </div>
    </Modal>
  );
}
