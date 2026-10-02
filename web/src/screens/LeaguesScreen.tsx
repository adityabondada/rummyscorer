import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createLeague, errorMessage, joinLeague } from '../api';
import { useUser } from '../auth';
import { useMyLeagues } from '../hooks';
import { InstallPrompt } from '../InstallPrompt';
import { EmptyState } from '../suits';
import { Button, Card, ErrorText, Field, Loading, Page } from '../ui';

export function LeaguesScreen() {
  const user = useUser();
  const leagues = useMyLeagues(user.uid);
  const navigate = useNavigate();
  // Set on the Profile screen.
  const yourName = user.displayName ?? '';
  const [leagueName, setLeagueName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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

  return (
    <Page
      title="Your leagues"
      actions={
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
      }
    >
      <InstallPrompt />

      {leagues.loading ? (
        <Loading />
      ) : leagues.value.length === 0 ? (
        <EmptyState title="Start your first league">
          Create a league for your group, or join one with an invite code.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {leagues.value.map((l) => (
            <li key={l.id}>
              <Link
                to={`/l/${l.id}`}
                className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <span className="font-medium">{l.doc.name}</span>
                <span className="ml-2 text-sm text-slate-500">
                  {l.doc.memberUids.length} members
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!yourName.trim() && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Add your name in your{' '}
          <Link to="/profile" className="font-medium underline">
            profile
          </Link>{' '}
          before you create or join a league.
        </p>
      )}

      <form onSubmit={create}>
        <Card className="space-y-3">
          <h2 className="font-semibold">Start a league</h2>
          <Field
            label="League name"
            value={leagueName}
            onChange={(e) => setLeagueName(e.target.value)}
            placeholder="Friday Rummy"
            maxLength={60}
          />
          <Button type="submit" disabled={busy || !leagueName.trim() || !yourName.trim()}>
            Create league
          </Button>
        </Card>
      </form>

      <form onSubmit={join}>
        <Card className="space-y-3">
          <h2 className="font-semibold">Join a league</h2>
          <Field
            label="Invite code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            placeholder="ABCD2345"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={busy || !code.trim() || !yourName.trim()}
          >
            Join league
          </Button>
        </Card>
      </form>
      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
