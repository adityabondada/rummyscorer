import { useState } from 'react';
import { activeIds, type GameState, type Round } from '@rummy/engine';
import { describeError } from '../../lib/names';
import {
  buildRound,
  dropPoints,
  dropsLabel,
  emptyForm,
  formFromRound,
  type FormEntry,
  type RoundForm,
} from '../../lib/roundEntry';
import { Button, ErrorText, Modal, cx } from '../../ui';

interface Props {
  /** The game as it stands before this round, so the form only offers who is playing. */
  state: GameState;
  names: Record<string, string>;
  title: string;
  /** Pre-fills the form when editing. */
  initial?: Round;
  /** The seq to check the round against: the round's own when editing, the next one for a new round. */
  seq: number;
  submitLabel: string;
  /** Saves the round. Returns a message if it couldn't be saved. */
  onSubmit: (round: Round) => Promise<string | null>;
  onClose: () => void;
}

export function RoundEntry({
  state,
  names,
  title,
  initial,
  seq,
  submitLabel,
  onSubmit,
  onClose,
}: Props) {
  const [form, setForm] = useState<RoundForm>(initial ? formFromRound(initial) : emptyForm());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const players = activeIds(state);
  const nameOf = (id: string) => names[id] ?? '?';

  const setEntry = (id: string, entry: FormEntry | undefined) =>
    setForm((cur) => {
      const entries = { ...cur.entries };
      if (entry) entries[id] = entry;
      else delete entries[id];
      return { ...cur, entries };
    });

  const chooseWinner = (id: string) =>
    setForm((cur) => {
      const entries = { ...cur.entries };
      delete entries[id];
      return { winnerId: id, entries };
    });

  const submit = async () => {
    const built = buildRound(state, form, seq);
    if (!built.ok) {
      setError(describeError(built.error, names));
      return;
    }
    setBusy(true);
    setError('');
    const problem = await onSubmit(built.round);
    if (problem) {
      setError(describeError(problem, names));
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Tap who won, then enter everyone else's points, or tap Drop. Players are in seat order.
        </p>
        <ul className="space-y-2">
          {players.map((id) => {
            const player = state.players[id]!;
            const entry = form.entries[id];
            const isWinner = form.winnerId === id;
            const noDrops = player.dropsLeft <= 0;
            const dropButton = (kind: 'drop' | 'middleDrop', label: string) => (
              <Button
                variant={entry?.kind === kind ? 'primary' : 'secondary'}
                small
                disabled={isWinner || (noDrops && entry?.kind !== kind)}
                aria-pressed={entry?.kind === kind}
                onClick={() => setEntry(id, entry?.kind === kind ? undefined : { kind })}
              >
                {label} {dropPoints(state, kind)}
              </Button>
            );
            return (
              <li
                key={id}
                className={cx(
                  'rounded-lg p-2 ring-1',
                  isWinner ? 'bg-emerald-50 ring-emerald-600' : 'ring-slate-200',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="block truncate font-medium">{nameOf(id)}</span>
                    <span className="block text-xs text-slate-500">
                      {player.total} pts · drops {dropsLabel(state, id)}
                      {id === state.dealerId && ' · deals'}
                      {id === state.firstPlayerId && ' · plays first'}
                    </span>
                  </div>
                  <Button
                    variant={isWinner ? 'primary' : 'secondary'}
                    small
                    aria-pressed={isWinner}
                    onClick={() => chooseWinner(id)}
                  >
                    {isWinner ? 'Winner' : 'Won'}
                  </Button>
                </div>
                {!isWinner && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      aria-label={`${nameOf(id)} points`}
                      inputMode="numeric"
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 disabled:bg-slate-100"
                      placeholder="Pts"
                      disabled={entry !== undefined && entry.kind !== 'points'}
                      value={entry?.kind === 'points' ? entry.points : ''}
                      onChange={(e) =>
                        setEntry(
                          id,
                          e.target.value === ''
                            ? undefined
                            : { kind: 'points', points: e.target.value },
                        )
                      }
                    />
                    {dropButton('drop', 'Drop')}
                    {dropButton('middleDrop', 'Middle')}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <ErrorText>{error}</ErrorText>
        <Button className="w-full" disabled={busy} onClick={() => void submit()}>
          {submitLabel}
        </Button>
      </div>
    </Modal>
  );
}
