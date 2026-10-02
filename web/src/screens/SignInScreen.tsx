import { useState } from 'react';
import { useAuth } from '../auth';
import { Button, Card, ErrorText, Field } from '../ui';

export function SignInScreen() {
  const { signInWithGoogle, signInAsTester } = useAuth();
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-slate-900">Rummy Score Tracker</h1>
        <p className="mt-2 text-slate-600">
          Scores, drops, rejoins and settling up for your weekend games.
        </p>
      </div>
      <Card className="space-y-3">
        <Button className="w-full" disabled={busy} onClick={() => run(signInWithGoogle)}>
          Sign in with Google
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
