import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage, joinLeague } from '../api';
import { useUser } from '../auth';
import { peopleLabel, useInvite } from '../lib/invite';
import { Button, Card, ErrorText, Field, Loading, Page } from '../ui';

/** Opened from an invite link: /join/ABCD2345. */
export function JoinScreen() {
  const { code = '' } = useParams();
  const user = useUser();
  const navigate = useNavigate();
  const league = useInvite(code);
  // The name comes from the profile. It is only asked for when there isn't one yet.
  const known = (user.displayName ?? '').trim();
  const [typed, setTyped] = useState('');
  const name = known || typed.trim();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { leagueId } = await joinLeague({ code, displayName: name });
      navigate(`/l/${leagueId}/claim`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (league.status === 'loading') return <Loading />;

  if (league.status === 'invalid') {
    return (
      <Page title="Join a league" back={{ to: '/', label: 'Your leagues' }}>
        <Card className="space-y-3">
          <p role="alert" className="text-red-700">
            This invite link isn't valid any more. Ask whoever sent it for a new one.
          </p>
          <Link to="/" className="inline-block text-sm text-slate-700 underline">
            Back to your leagues
          </Link>
        </Card>
      </Page>
    );
  }

  const leagueName = league.status === 'ok' ? league.leagueName : null;

  return (
    <Page title="Join a league" back={{ to: '/', label: 'Your leagues' }}>
      <form onSubmit={join}>
        <Card className="space-y-3">
          {leagueName ? (
            <p className="text-slate-700">
              You've been invited to join <strong className="font-semibold">{leagueName}</strong>
              {league.status === 'ok' && (
                <span className="text-slate-500"> · {peopleLabel(league.members)}</span>
              )}
            </p>
          ) : (
            <p className="text-slate-600">
              You've been invited with code <strong>{code.toUpperCase()}</strong>.
            </p>
          )}
          {known ? (
            <p className="text-sm text-slate-600">
              You'll join as <strong className="font-medium">{known}</strong>.
            </p>
          ) : (
            <Field
              label="Your name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              maxLength={40}
              autoFocus
            />
          )}
          <Button type="submit" className="w-full" disabled={busy || !name}>
            {busy ? 'Joining…' : leagueName ? `Join ${leagueName}` : 'Join league'}
          </Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      </form>
    </Page>
  );
}
