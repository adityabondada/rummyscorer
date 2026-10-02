import { addDoc, collection } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_SETTINGS, validateSettings, EngineError, type GameSettings } from '@rummy/engine';
import { gamesPath, type GameDoc } from '@rummy/data';
import { db } from '../firebase';
import { pickablePlayers } from '../lib/names';
import { moreRulesSummary, moveInOrder, tableOrder, toggleAll, togglePlayer } from '../lib/newGame';
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

  // Who is playing, in the order cards are dealt: the first card goes to the top of the list and the
  // player at the bottom, with the lowest card, deals round 1.
  const [lineUp, setLineUp] = useState<string[]>([]);
  const [form, setForm] = useState<SettingsForm>(initialForm);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const settingsResult = useMemo(() => {
    try {
      return { settings: toSettings(form), error: '' };
    } catch (e) {
      return { settings: null, error: e instanceof EngineError ? e.message : 'Check the settings' };
    }
  }, [form]);

  const allIds = candidates.map((p) => p.id);
  const everyoneIn = allIds.length > 0 && allIds.every((id) => lineUp.includes(id));
  const notPlaying = candidates.filter((p) => !lineUp.includes(p.id));
  const dealer = tableOrder(lineUp)[0];
  const canStart = lineUp.length >= 2 && !!settingsResult.settings && !busy;

  const start = async () => {
    if (lineUp.length < 2 || !settingsResult.settings) return;
    setBusy(true);
    setError('');
    try {
      const game: GameDoc = {
        settings: settingsResult.settings,
        seatOrder: tableOrder(lineUp),
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
          <h2 className="font-semibold">1. Who's playing</h2>
          {candidates.length > 1 && (
            <Button
              variant="ghost"
              small
              onClick={() => setLineUp((cur) => toggleAll(cur, allIds))}
            >
              {everyoneIn ? 'Clear all' : 'Select all'}
            </Button>
          )}
        </div>

        {candidates.length < 2 && (
          <p className="text-sm text-slate-600">
            Add at least two players on the Players tab first.
          </p>
        )}

        {lineUp.length > 0 && (
          <>
            <p className="text-sm text-slate-600">
              Put them in the order the cards are dealt, highest card first. The player at the
              bottom, with the lowest card, deals round 1.
            </p>
            <ol className="space-y-2" aria-label="Playing, in dealing order">
              {lineUp.map((id, i) => (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 ring-1 ring-emerald-600"
                >
                  <span className="min-w-0 truncate">
                    {i + 1}. <span className="font-medium">{nameOf(id)}</span>{' '}
                    {i === lineUp.length - 1 && lineUp.length > 1 && (
                      <span className="text-xs text-slate-500">(deals first)</span>
                    )}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button
                      variant="secondary"
                      small
                      aria-label={`Move ${nameOf(id)} up`}
                      disabled={i === 0}
                      onClick={() => setLineUp(moveInOrder(lineUp, id, -1))}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="secondary"
                      small
                      aria-label={`Move ${nameOf(id)} down`}
                      disabled={i === lineUp.length - 1}
                      onClick={() => setLineUp(moveInOrder(lineUp, id, 1))}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      small
                      aria-label={`Remove ${nameOf(id)}`}
                      onClick={() => setLineUp(togglePlayer(lineUp, id))}
                    >
                      ×
                    </Button>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        {notPlaying.length > 0 && (
          <div>
            <p className="mb-2 text-sm text-slate-600">
              {lineUp.length === 0 ? 'Tap to add players.' : 'Not playing. Tap to add.'}
            </p>
            <ul className="flex flex-wrap gap-2">
              {notPlaying.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setLineUp(togglePlayer(lineUp, p.id))}
                    className={cx(
                      'rounded-full px-3 py-1.5 text-sm ring-1 ring-slate-300',
                      'hover:bg-emerald-50 hover:ring-emerald-600',
                    )}
                  >
                    + {p.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {lineUp.length === 1 && <p className="text-sm text-slate-600">Add at least one more.</p>}

        {lineUp.length >= 2 && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm" data-testid="seat-order">
            <strong>{nameOf(dealer!)}</strong> deals round 1 and{' '}
            <strong>{nameOf(lineUp[0]!)}</strong> gets the first card. After that the deal moves
            down the list: {lineUp.map(nameOf).join(' → ')}.
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">2. Rules</h2>
        <p className="text-sm text-slate-600">These lock once the first round is entered.</p>
        <div className="grid grid-cols-2 gap-3">
          {num('limit', 'Elimination limit', 'Out once past this')}
          {num('buyIn', 'Buy-in ($)', 'Also the cost to rejoin')}
        </div>

        <button
          type="button"
          aria-expanded={showMore}
          aria-controls="more-rules"
          onClick={() => setShowMore((open) => !open)}
          className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-emerald-800 ring-1 ring-slate-200 hover:bg-emerald-50"
        >
          <span>More rules</span>
          <span aria-hidden="true">{showMore ? '▴' : '▾'}</span>
        </button>

        {!showMore && settingsResult.settings && (
          <p className="text-xs text-slate-500" data-testid="more-rules-summary">
            {moreRulesSummary(settingsResult.settings)}
          </p>
        )}

        <div id="more-rules" hidden={!showMore} className="grid grid-cols-2 gap-3">
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

      <ErrorText>{error}</ErrorText>
      <Button className="w-full" disabled={!canStart} onClick={() => void start()}>
        Start game
      </Button>
    </Page>
  );
}
