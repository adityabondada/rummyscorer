import { addDoc, collection } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_SETTINGS,
  RANKS,
  validateSettings,
  EngineError,
  type GameSettings,
} from '@rummy/engine';
import { gamesPath, type GameDoc } from '@rummy/data';
import { db } from '../firebase';
import { pickablePlayers } from '../lib/names';
import { drawForm } from '../lib/seatingForm';
import { Button, Card, ErrorText, Field, Page, cx } from '../ui';
import { useLeagueContext } from './LeagueLayout';

/** The settings as text, so a field can be empty while someone is typing. */
interface SettingsForm {
  limit: string;
  buyIn: string;
  dropPoints: string;
  middleDropPoints: string;
  maxDrops: string;
  rejoinDrops: 'carryOver' | string;
  maxRoundPenalty: string;
  rejoinCutoff: string;
}

const initialForm: SettingsForm = {
  limit: String(DEFAULT_SETTINGS.limit),
  buyIn: String(DEFAULT_SETTINGS.buyIn),
  dropPoints: String(DEFAULT_SETTINGS.dropPoints),
  middleDropPoints: String(DEFAULT_SETTINGS.middleDropPoints),
  maxDrops: String(DEFAULT_SETTINGS.maxDrops),
  rejoinDrops: 'carryOver',
  maxRoundPenalty: String(DEFAULT_SETTINGS.maxRoundPenalty),
  rejoinCutoff: '',
};

const whole = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : NaN);
const optional = (text: string) => (text.trim() === '' ? null : whole(text));

function toSettings(f: SettingsForm): GameSettings {
  const settings: GameSettings = {
    limit: whole(f.limit),
    buyIn: whole(f.buyIn),
    dropPoints: whole(f.dropPoints),
    middleDropPoints: whole(f.middleDropPoints),
    maxDrops: whole(f.maxDrops),
    dropsOnRejoin:
      f.rejoinDrops === 'carryOver'
        ? { mode: 'carryOver' }
        : { mode: 'grant', count: whole(f.rejoinDrops) },
    maxRoundPenalty: optional(f.maxRoundPenalty),
    rejoinCutoff: optional(f.rejoinCutoff),
  };
  validateSettings(settings);
  return settings;
}

export function NewGameScreen() {
  const { leagueId, uid, players } = useLeagueContext();
  const navigate = useNavigate();
  const candidates = pickablePlayers(players);
  const nameOf = (id: string) => players[id]?.name ?? '?';

  const [picked, setPicked] = useState<string[]>([]);
  const [form, setForm] = useState<SettingsForm>(initialForm);
  const [mode, setMode] = useState<'cards' | 'manual'>('cards');
  const [draws, setDraws] = useState<Record<string, string[]>>({});
  const [manual, setManual] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const settingsResult = useMemo(() => {
    try {
      return { settings: toSettings(form), error: '' };
    } catch (e) {
      return { settings: null, error: e instanceof EngineError ? e.message : 'Check the settings' };
    }
  }, [form]);

  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id]));

  // Card draws for the people picked. Someone in a tie gets another box to enter their redraw.
  const { result: seating, view: drawView } = drawForm(picked, draws);
  const setDraw = (id: string, index: number, value: string) =>
    setDraws((cur) => {
      const slots = [...(cur[id] ?? [''])];
      while (slots.length <= index) slots.push('');
      slots[index] = value;
      return { ...cur, [id]: slots };
    });

  const manualOrder = [
    ...manual.filter((id) => picked.includes(id)),
    ...picked.filter((id) => !manual.includes(id)),
  ];
  const move = (id: string, delta: number) => {
    const next = [...manualOrder];
    const from = next.indexOf(id);
    const to = from + delta;
    if (to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to]!, next[from]!];
    setManual(next);
  };

  const seatOrder = mode === 'manual' ? manualOrder : seating?.resolved ? seating.seatOrder : null;
  const canStart = picked.length >= 2 && !!seatOrder && !!settingsResult.settings && !busy;

  const start = async () => {
    if (!seatOrder || !settingsResult.settings) return;
    setBusy(true);
    setError('');
    try {
      const game: GameDoc = {
        settings: settingsResult.settings,
        seatOrder,
        status: 'inProgress',
        createdBy: uid,
        createdAt: Date.now(),
        split: null,
        summary: null,
        summaryError: null,
      };
      const ref = await addDoc(collection(db, gamesPath(leagueId)), game);
      navigate(`/l/${leagueId}/g/${ref.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the game');
      setBusy(false);
    }
  };

  const num = (key: keyof SettingsForm, label: string, hint?: string) => (
    <Field
      label={label}
      hint={hint}
      inputMode="numeric"
      value={form[key]}
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
    />
  );

  return (
    <Page title="New game" back={{ to: `/l/${leagueId}`, label: 'Games' }}>
      <Card className="space-y-3">
        <h2 className="font-semibold">1. Who's playing?</h2>
        {candidates.length < 2 && (
          <p className="text-sm text-slate-600">
            Add at least two players on the Players tab first.
          </p>
        )}
        <ul className="grid grid-cols-2 gap-2">
          {candidates.map((p) => (
            <li key={p.id}>
              <label
                className={cx(
                  'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 ring-1',
                  picked.includes(p.id) ? 'bg-emerald-50 ring-emerald-600' : 'ring-slate-300',
                )}
              >
                <input
                  type="checkbox"
                  checked={picked.includes(p.id)}
                  onChange={() => toggle(p.id)}
                />
                {p.name}
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">2. Rules</h2>
        <p className="text-sm text-slate-600">These lock once the first round is entered.</p>
        <div className="grid grid-cols-2 gap-3">
          {num('limit', 'Elimination limit', 'Out once past this')}
          {num('buyIn', 'Buy-in ($)', 'Also the cost to rejoin')}
          {num('dropPoints', 'Drop points')}
          {num('middleDropPoints', 'Middle drop points')}
          {num('maxDrops', 'Max drops per player')}
          {num('maxRoundPenalty', 'Max penalty per round', 'Blank for no cap')}
          {num('rejoinCutoff', 'Rejoin cutoff', 'Blank to always allow')}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Drops on rejoin</span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
              value={form.rejoinDrops}
              onChange={(e) => setForm({ ...form, rejoinDrops: e.target.value })}
            >
              <option value="carryOver">Carry over what was left</option>
              {Array.from({ length: (whole(form.maxDrops) || 0) + 1 }, (_, n) => (
                <option key={n} value={String(n)}>
                  Grant {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ErrorText>{settingsResult.error}</ErrorText>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">3. Seating</h2>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(['cards', 'manual'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={cx(
                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium',
                mode === m ? 'bg-white shadow-sm' : 'text-slate-600',
              )}
              onClick={() => setMode(m)}
            >
              {m === 'cards' ? 'Draw cards' : 'Set the order'}
            </button>
          ))}
        </div>

        {picked.length < 2 ? (
          <p className="text-sm text-slate-600">Pick at least two players first.</p>
        ) : mode === 'cards' ? (
          <>
            <p className="text-sm text-slate-600">
              Each player draws a card. The lowest deals first, and the highest is dealt first.
            </p>
            <ul className="space-y-2">
              {picked.map((id) => (
                <li key={id} className="flex flex-wrap items-center gap-2">
                  <span className="w-28 truncate font-medium">{nameOf(id)}</span>
                  {(drawView[id]?.slots ?? ['']).map((slot, i) => (
                    <select
                      key={i}
                      aria-label={`${nameOf(id)} ${i === 0 ? 'card' : `redraw ${i}`}`}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-2"
                      value={slot}
                      onChange={(e) => setDraw(id, i, e.target.value)}
                    >
                      <option value="">{i === 0 ? 'Card' : 'Redraw'}</option>
                      {RANKS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ))}
                  {drawView[id]?.status === 'redraw' && (
                    <span className="text-xs text-amber-700">Tied: draw again</span>
                  )}
                  {drawView[id]?.status === 'waiting' && (
                    <span className="text-xs text-slate-500">Waiting for the others to redraw</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <ol className="space-y-2">
            {manualOrder.map((id, i) => (
              <li
                key={id}
                className="flex items-center justify-between rounded-lg px-3 py-2 ring-1 ring-slate-200"
              >
                <span>
                  {i + 1}. {nameOf(id)}{' '}
                  {i === 0 && <span className="text-xs text-slate-500">(deals first)</span>}
                </span>
                <span className="flex gap-1">
                  <Button
                    variant="secondary"
                    small
                    aria-label={`Move ${nameOf(id)} up`}
                    disabled={i === 0}
                    onClick={() => move(id, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="secondary"
                    small
                    aria-label={`Move ${nameOf(id)} down`}
                    disabled={i === manualOrder.length - 1}
                    onClick={() => move(id, 1)}
                  >
                    ↓
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        )}

        {seatOrder && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm" data-testid="seat-order">
            Table order: {seatOrder.map(nameOf).join(' → ')}.{' '}
            <strong>{nameOf(seatOrder[0]!)}</strong> deals round 1.
          </p>
        )}
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button className="w-full" disabled={!canStart} onClick={() => void start()}>
        Start game
      </Button>
    </Page>
  );
}
