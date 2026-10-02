import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage, joinLeague } from '../api';
import { useUser } from '../auth';
import { Button, Card, ErrorText, Field, Page } from '../ui';

/** Opened from an invite link: /join/ABCD2345. */
export function JoinScreen() {
  const { code = '' } = useParams();
  const user = useUser();
  const navigate = useNavigate();
  const [name, setName] = useState(user.displayName ?? '');
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

  return (
    <Page title="Join a league" back={{ to: '/', label: 'Your leagues' }}>
      <form onSubmit={join}>
        <Card className="space-y-3">
          <p className="text-slate-600">
            You've been invited with code <strong>{code.toUpperCase()}</strong>.
          </p>
          <Field
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
          />
          <Button type="submit" disabled={busy || !name.trim()}>
            Join league
          </Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      </form>
    </Page>
  );
}
