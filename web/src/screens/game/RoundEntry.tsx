import { useState } from 'react';
import { activeIds, type GameState, type PenaltyReason, type Round } from '@rummy/engine';
import { describeError } from '../../lib/names';
import {
  buildRound,
  dropPoints,
  dropsLabel,
  emptyForm,
  formFromRound,
  PENALTY_REASONS,
  type FormEntry,
  type RoundForm,
  type RoundMode,
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
  const maxPenalty = state.settings.maxRoundPenalty;
  const [form, setForm] = useState<RoundForm>(
    initial ? formFromRound(initial, maxPenalty) : emptyForm(maxPenalty),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const players = activeIds(state);
  const nameOf = (id: string) => names[id] ?? '?';
  const penaltyMode = form.mode === 'penalty';

  const setMode = (mode: RoundMode) => {
    setError('');
    setForm((cur) => ({ ...cur, mode }));
  };

  const setEntry = (id: string, entry: FormEntry | undefined) =>
    setForm((cur) => {
      const entries = { ...cur.entries };
      if (entry) entries[id] = entry;
      else delete entries[id];
      return { ...cur, entries };
    });

  const setDrop = (id: string, kind: 'drop' | 'middleDrop' | undefined) =>
    setForm((cur) => {
      const drops = { ...cur.drops };
      if (kind) drops[id] = { kind };
      else delete drops[id];
      return { ...cur, drops };
    });

  const chooseWinner = (id: string) =>
    setForm((cur) => {
      const entries = { ...cur.entries };
      delete entries[id];
      return { ...cur, winnerId: id, entries };
    });

  const choosePenalty = (id: string) =>
    setForm((cur) => {
      const drops = { ...cur.drops };
      delete drops[id];
      return { ...cur, penalty: { ...cur.penalty, playerId: id }, drops };
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

  const modeButton = (mode: RoundMode, label: string) => (
    <Button
      variant={form.mode === mode ? 'primary' : 'secondary'}
      small
      className="flex-1"
      role="radio"
      aria-checked={form.mode === mode}
      onClick={() => setMode(mode)}
    >
      {label}
    </Button>
  );

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <div role="radiogroup" aria-label="Kind of round" className="flex gap-2">
          {modeButton('win', 'Someone won')}
          {modeButton('penalty', 'Penalty')}
        </div>

        {penaltyMode ? (
          <>
            <p className="text-sm text-slate-600">
              Nobody won: one player made a mistake and takes the penalty. Everyone else scores 0,
              except players who dropped, who keep their drop points.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Reason</span>
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
                  value={form.penalty.reason}
                  onChange={(e) =>
                    setForm((cur) => ({
                      ...cur,
                      penalty: { ...cur.penalty, reason: e.target.value as PenaltyReason },
                    }))
                  }
                >
                  {PENALTY_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Penalty points
                </span>
                <input
                  inputMode="numeric"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
                  value={form.penalty.points}
                  onChange={(e) =>
                    setForm((cur) => ({
                      ...cur,
                      penalty: { ...cur.penalty, points: e.target.value },
                    }))
                  }
                />
                {maxPenalty !== null && (
                  <span className="mt-1 block text-xs text-slate-500">
                    The most is {maxPenalty}
                  </span>
                )}
              </label>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Tap who won, then enter everyone else's points, or tap Drop. Players are in seat order.
          </p>
        )}

        <ul className="space-y-2">
          {players.map((id) => {
            const player = state.players[id]!;
            const entry = penaltyMode
              ? (form.drops[id] as FormEntry | undefined)
              : form.entries[id];
            const isWinner = !penaltyMode && form.winnerId === id;
            const isCulprit = penaltyMode && form.penalty.playerId === id;
            const special = isWinner || isCulprit;
            const noDrops = player.dropsLeft <= 0;
            const dropButton = (kind: 'drop' | 'middleDrop', label: string) => (
              <Button
                variant={entry?.kind === kind ? 'primary' : 'secondary'}
                small
                disabled={special || (noDrops && entry?.kind !== kind)}
                aria-pressed={entry?.kind === kind}
                onClick={() => {
                  const next = entry?.kind === kind ? undefined : kind;
                  if (penaltyMode) setDrop(id, next);
                  else setEntry(id, next ? { kind } : undefined);
                }}
              >
                {label} {dropPoints(state, kind)}
              </Button>
            );
            return (
              <li
                key={id}
                className={cx(
                  'rounded-lg p-2 ring-1',
                  isWinner && 'bg-emerald-50 ring-emerald-600',
                  isCulprit && 'bg-red-50 ring-red-600',
                  !special && 'ring-slate-200',
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
                  {penaltyMode ? (
                    <Button
                      variant={isCulprit ? 'danger' : 'secondary'}
                      small
                      aria-pressed={isCulprit}
                      onClick={() => choosePenalty(id)}
                    >
                      {isCulprit ? 'Penalty' : 'Got penalty'}
                    </Button>
                  ) : (
                    <Button
                      variant={isWinner ? 'primary' : 'secondary'}
                      small
                      aria-pressed={isWinner}
                      onClick={() => chooseWinner(id)}
                    >
                      {isWinner ? 'Winner' : 'Won'}
                    </Button>
                  )}
                </div>
                {!special && (
                  <div className="mt-2 flex items-center gap-2">
                    {penaltyMode ? (
                      <span className="w-20 text-sm text-slate-600">{entry ? '' : '0 pts'}</span>
                    ) : (
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
                    )}
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
