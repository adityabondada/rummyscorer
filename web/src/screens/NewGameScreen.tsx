import { addDoc, collection } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_SETTINGS, validateSettings, EngineError, type GameSettings } from '@rummy/engine';
import { gamesPath, type GameDoc } from '@rummy/data';
import { db } from '../firebase';
import { pickablePlayers } from '../lib/names';
import { moveInOrder, seatOrderFor, tableOrder, toggleAll } from '../lib/newGame';
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
  rejoinDrops:
    DEFAULT_SETTINGS.dropsOnRejoin.mode === 'grant'
      ? String(DEFAULT_SETTINGS.dropsOnRejoin.count)
      : 'carryOver',
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

  const allIds = candidates.map((p) => p.id);
  const allPicked = allIds.length > 0 && allIds.every((id) => picked.includes(id));

  // The list on screen is the order cards are dealt in; the game's seat order starts at the dealer.
  const seatOrder = seatOrderFor(picked, manual);
  const dealer = tableOrder(seatOrder)[0];
  const canStart = picked.length >= 2 && !!settingsResult.settings && !busy;

  const start = async () => {
    if (picked.length < 2 || !settingsResult.settings) return;
    setBusy(true);
    setError('');
    try {
      const game: GameDoc = {
        settings: settingsResult.settings,
        seatOrder: tableOrder(seatOrder),
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">1. Who's playing?</h2>
          {candidates.length > 1 && (
            <Button
              variant="ghost"
              small
              onClick={() => setPicked((cur) => toggleAll(cur, allIds))}
            >
              {allPicked ? 'Clear all' : 'Select all'}
            </Button>
          )}
        </div>
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
        <h2 className="font-semibold">3. Seating order</h2>
        <p className="text-sm text-slate-600">
          Put players in the order cards are dealt, highest card first. The player at the bottom,
          with the lowest card, deals round 1.
        </p>

        {picked.length < 2 ? (
          <p className="text-sm text-slate-600">Pick at least two players first.</p>
        ) : (
          <ol className="space-y-2">
            {seatOrder.map((id, i) => (
              <li
                key={id}
                className="flex items-center justify-between rounded-lg px-3 py-2 ring-1 ring-slate-200"
              >
                <span>
                  {i + 1}. {nameOf(id)}{' '}
                  {i === seatOrder.length - 1 && seatOrder.length > 1 && (
                    <span className="text-xs text-slate-500">(deals first)</span>
                  )}
                </span>
                <span className="flex gap-1">
                  <Button
                    variant="secondary"
                    small
                    aria-label={`Move ${nameOf(id)} up`}
                    disabled={i === 0}
                    onClick={() => setManual(moveInOrder(seatOrder, id, -1))}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="secondary"
                    small
                    aria-label={`Move ${nameOf(id)} down`}
                    disabled={i === seatOrder.length - 1}
                    onClick={() => setManual(moveInOrder(seatOrder, id, 1))}
                  >
                    ↓
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        )}

        {picked.length >= 2 && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm" data-testid="seat-order">
            <strong>{nameOf(dealer!)}</strong> deals round 1 and{' '}
            <strong>{nameOf(seatOrder[0]!)}</strong> gets the first card. After that the deal moves
            down the list: {seatOrder.map(nameOf).join(' → ')}.
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
