import { Button } from '../../ui';

/** How long a saved round can be undone in one tap. */
export const UNDO_MS = 60_000;

/** Shown just after a round is saved, so a slip can be taken back without typing a reason. */
export function UndoBar({
  round,
  busy,
  onUndo,
  onDismiss,
}: {
  round: number;
  busy: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white"
    >
      <span>Round {round} saved</span>
      <span className="flex items-center gap-1">
        <Button
          small
          variant="secondary"
          disabled={busy}
          aria-label={`Undo round ${round}`}
          onClick={onUndo}
        >
          Undo
        </Button>
        <button
          type="button"
          aria-label="Dismiss"
          className="px-2 text-xl leading-none text-slate-300 hover:text-white"
          onClick={onDismiss}
        >
          ×
        </button>
      </span>
    </div>
  );
}
