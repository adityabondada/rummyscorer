import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createLeague, errorMessage, joinLeague } from '../api';
import { useUser } from '../auth';
import { useLeagueActivity, useMyLeagues, usePlayerCounts } from '../hooks';
import { InstallPrompt } from '../InstallPrompt';
import { firstName, lastPlayedLabel, leagueCountLine, orderLeagues } from '../lib/leagues';
import { EmptyState } from '../suits';
import { Badge, Button, ErrorText, Field, Loading, Modal, Page, cx } from '../ui';

type Dialog = 'create' | 'join' | null;

export function LeaguesScreen() {
  const user = useUser();
  const leagues = useMyLeagues(user.uid);
  const ids = leagues.value.map((l) => l.id);
  const playerCounts = usePlayerCounts(ids);
  const activity = useLeagueActivity(ids);
  const navigate = useNavigate();
  // Set on the Profile screen.
  const yourName = user.displayName ?? '';
  const [dialog, setDialog] = useState<Dialog>(null);
  const [leagueName, setLeagueName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (which: Exclude<Dialog, null>) => {
    setError('');
    setDialog(which);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { leagueId } = await createLeague({ name: leagueName, displayName: yourName });
      navigate(`/l/${leagueId}`);
    });
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { leagueId } = await joinLeague({ code, displayName: yourName });
      navigate(`/l/${leagueId}/claim`);
    });
  };

  const hello = firstName(user.displayName);
  const ordered = orderLeagues(leagues.value, activity);
  const actions = (
    <div className="flex gap-2">
      <Button className="flex-1" onClick={() => open('create')}>
        New league
      </Button>
      <Button variant="secondary" className="flex-1" onClick={() => open('join')}>
        Join with a code
      </Button>
    </div>
  );

  return (
    <Page
      title="Your leagues"
      actions={
        <span className="flex items-center gap-2">
          {hello && <span className="text-sm text-slate-500">Hi, {hello}</span>}
          <Link
            to="/profile"
            aria-label="Profile"
            title="Profile"
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <circle cx="12" cy="8" r="4.2" />
              <path d="M3.5 21c0-4.6 3.8-7.5 8.5-7.5s8.5 2.9 8.5 7.5z" />
            </svg>
          </Link>
        </span>
      }
    >
      <InstallPrompt />

      {!yourName.trim() && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Add your name in your{' '}
          <Link to="/profile" className="font-medium underline">
            profile
          </Link>{' '}
          before you create or join a league.
        </p>
      )}

      {leagues.loading ? (
        <Loading />
      ) : ordered.length === 0 ? (
        <EmptyState title="Start your first league" action={actions}>
          Create a league for your group, or join one with an invite code.
        </EmptyState>
      ) : (
        <>
          <p className="-mt-2 text-sm text-slate-500">{leagueCountLine(ordered.length)}</p>
          <ul className="space-y-3" aria-label="Your leagues">
            {ordered.map((l) => {
              const players = playerCounts[l.id];
              const seen = activity[l.id];
              const parts = [
                players === undefined ? null : `${players} ${players === 1 ? 'player' : 'players'}`,
                seen === undefined
                  ? null
                  : seen.lastAt === null
                    ? 'no games yet'
                    : `last played ${lastPlayedLabel(seen.lastAt)}`,
              ].filter(Boolean);
              return (
                <li key={l.id}>
                  <Link
                    to={`/l/${l.id}`}
                    className={cx(
                      'flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm hover:bg-slate-50',
                      seen?.live ? 'ring-2 ring-slate-900' : 'ring-1 ring-slate-200',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-lg font-medium">{l.doc.name}</span>
                      {parts.length > 0 && (
                        <span className="block text-sm text-slate-500">{parts.join(' · ')}</span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {seen?.live && <Badge tone="amber">Game in progress</Badge>}
                      <span aria-hidden="true" className="text-2xl leading-none text-slate-400">
                        ›
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {actions}
        </>
      )}

      {dialog === 'create' && (
        <Modal title="Start a league" onClose={() => setDialog(null)}>
          <form className="space-y-3" onSubmit={create}>
            <Field
              label="League name"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              placeholder="Friday Rummy"
              maxLength={60}
              autoFocus
            />
            <ErrorText>{error}</ErrorText>
            <Button
              type="submit"
              className="w-full"
              disabled={busy || !leagueName.trim() || !yourName.trim()}
            >
              Create league
            </Button>
          </form>
        </Modal>
      )}

      {dialog === 'join' && (
        <Modal title="Join a league" onClose={() => setDialog(null)}>
          <form className="space-y-3" onSubmit={join}>
            <Field
              label="Invite code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              placeholder="ABCD2345"
              autoFocus
            />
            <ErrorText>{error}</ErrorText>
            <Button
              type="submit"
              className="w-full"
              disabled={busy || !code.trim() || !yourName.trim()}
            >
              Join league
            </Button>
          </form>
        </Modal>
      )}
    </Page>
  );
}
