import { useInstallPrompt } from './lib/install';
import { Button, Card } from './ui';

/**
 * A one-time nudge to put the app on the home screen, so it opens like an app at the table. It
 * shows only where installing is possible, never once installed, and goes away for good once
 * someone has answered it.
 */
export function InstallPrompt() {
  const { kind, install, dismiss } = useInstallPrompt();
  if (!kind) return null;
  return (
    <Card className="space-y-2" aria-label="Add to home screen">
      <p className="font-medium">Keep Rummy on your home screen</p>
      {kind === 'ios' ? (
        <>
          <p className="text-sm text-slate-600">
            Tap the Share button, then “Add to Home Screen”, to open it like an app.
          </p>
          <Button small variant="secondary" onClick={dismiss}>
            Got it
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">Add it to open the scoreboard in one tap.</p>
          <div className="flex gap-2">
            <Button small onClick={() => void install()}>
              Add to home screen
            </Button>
            <Button small variant="ghost" onClick={dismiss}>
              Not now
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
