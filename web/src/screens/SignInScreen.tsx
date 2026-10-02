import { useState } from 'react';
import { useAuth } from '../auth';
import { peopleLabel, useInvite } from '../lib/invite';
import { SignInArt } from '../SignInArt';
import { Button, Card, ErrorText, Field } from '../ui';

/** `invite` is the code from an invite link, when someone arrives from one. */
export function SignInScreen({ invite }: { invite?: string }) {
  const { signInWithGoogle, signInAsTester } = useAuth();
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const league = useInvite(invite ?? '');

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-8">
      <SignInArt />
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-slate-900">Rummy Score Tracker</h1>
        {invite && league.status === 'ok' ? (
          <p className="mt-2 text-slate-700" data-testid="invite-banner">
            You're invited to join <strong className="font-semibold">{league.leagueName}</strong>
            <span className="text-slate-500"> · {peopleLabel(league.members)}</span>
          </p>
        ) : invite && league.status === 'invalid' ? (
          <p role="alert" className="mt-2 text-red-700">
            This invite link isn't valid any more. Ask whoever sent it for a new one.
          </p>
        ) : (
          <p className="mt-2 text-slate-600">
            Scores, drops, rejoins and settling up for your weekend games.
          </p>
        )}
      </div>
      <Card className="space-y-3">
        <Button className="w-full" disabled={busy} onClick={() => run(signInWithGoogle)}>
          {invite && league.status === 'ok' ? 'Sign in with Google to join' : 'Sign in with Google'}
        </Button>
        <ErrorText>{error}</ErrorText>
      </Card>
      {signInAsTester && (
        <Card className="space-y-3">
          <p className="text-sm text-slate-600">
            Local emulator only: sign in as a made-up person, no Google account needed.
          </p>
          <Field
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Asha"
          />
          <Button
            variant="secondary"
            className="w-full"
            disabled={busy || name.trim() === ''}
            onClick={() => run(() => signInAsTester(name))}
          >
            Sign in as {name.trim() || 'tester'}
          </Button>
        </Card>
      )}
    </main>
  );
}
