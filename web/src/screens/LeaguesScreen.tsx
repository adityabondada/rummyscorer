import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createLeague, errorMessage, joinLeague } from '../api';
import { useAuth, useUser } from '../auth';
import { useMyLeagues } from '../hooks';
import { EmptyState } from '../suits';
import { Button, Card, ErrorText, Field, Loading, Page } from '../ui';

export function LeaguesScreen() {
  const user = useUser();
  const { signOut } = useAuth();
  const leagues = useMyLeagues(user.uid);
  const navigate = useNavigate();
  const [yourName, setYourName] = useState(user.displayName ?? '');
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
        <Button variant="ghost" small onClick={() => void signOut()}>
          Sign out
        </Button>
      }
    >
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

      <Card className="space-y-3">
        <h2 className="font-semibold">Your name</h2>
        <Field
          label="Shown to your league"
          value={yourName}
          onChange={(e) => setYourName(e.target.value)}
          maxLength={40}
        />
      </Card>

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
