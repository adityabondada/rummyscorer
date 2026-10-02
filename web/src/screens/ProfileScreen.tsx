import { useState, type FormEvent } from 'react';
import { errorMessage } from '../api';
import { useAuth, useUser } from '../auth';
import { Button, Card, ErrorText, Field, Page } from '../ui';

/** Reached from the top right of the home screen: your name, and signing out. */
export function ProfileScreen() {
  const user = useUser();
  const { updateName, signOut } = useAuth();
  const saved = user.displayName ?? '';
  const [name, setName] = useState(saved);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const trimmed = name.trim();
  const changed = trimmed !== saved.trim();

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || !changed) return;
    setBusy(true);
    setError('');
    setJustSaved(false);
    try {
      await updateName(trimmed);
      setName(trimmed);
      setJustSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Profile" back={{ to: '/', label: 'Your leagues' }}>
      <form onSubmit={save}>
        <Card className="space-y-3">
          <h2 className="font-semibold">Your name</h2>
          <Field
            label="Shown to your league"
            hint="Used when you create or join a league from now on. Leagues you're already in keep the name they have."
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setJustSaved(false);
            }}
            maxLength={40}
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy || !trimmed || !changed}>
              Save name
            </Button>
            {justSaved && (
              <span role="status" className="text-sm text-emerald-700">
                Saved
              </span>
            )}
          </div>
          <ErrorText>{error}</ErrorText>
        </Card>
      </form>

      <Card className="space-y-3">
        <h2 className="font-semibold">Account</h2>
        {user.email && (
          <p className="break-all text-sm text-slate-600">Signed in as {user.email}</p>
        )}
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </Card>
    </Page>
  );
}
