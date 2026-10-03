import { collection, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { rejoinEligibility, type Round } from '@rummy/engine';
import { gamePath, roundPath, roundsPath, roundDocToEngine } from '@rummy/data';
import { deleteGame, errorMessage } from '../api';
import { db } from '../firebase';
import { useLiveGame } from '../hooks';
import {
  planEditRound,
  planNewRound,
  planRejoin,
  planRestore,
  planRollback,
  planScrapLatest,
  restorableRow,
  scrappableRow,
  type Plan,
  type RoundWrite,
} from '../lib/edits';
import {
  gameState,
  liveRows,
  stateBefore,
  storedIds,
  toResolvedRound,
  toStoredSplit,
  type RoundRow,
} from '../lib/game';
import { Badge, Button, Card, ErrorText, Loading, Page } from '../ui';
import { ConfirmModal, RejoinModal, ReasonModal, RollbackModal, SplitModal } from './game/Modals';
import { ResultCard } from './game/ResultCard';
import { RoundEntry } from './game/RoundEntry';
import { RoundList } from './game/RoundList';
import { ShareModal } from './game/ShareModal';
import { UNDO_MS, UndoBar } from './game/UndoBar';
import { ScoreBoard } from './game/ScoreBoard';
import { useLeagueContext } from './LeagueLayout';

type Dialog =
  | { kind: 'round' }
  | { kind: 'edit'; row: RoundRow }
  | { kind: 'scrap' }
  | { kind: 'rollback' }
  | { kind: 'rejoin'; playerId: string; entryScore: number }
  | { kind: 'split' }
  | { kind: 'delete' }
  | { kind: 'share' };

export function GameScreen() {
  const { gameId = '' } = useParams();
  const navigate = useNavigate();
  const { leagueId, league, uid, players, names } = useLeagueContext();
  const live = useLiveGame(leagueId, gameId, players);
  const { game, rows, state } = live;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState('');
  // The round just saved, which can be undone in one tap for a minute.
  const [undo, setUndo] = useState<{ seq: number; busy: boolean } | null>(null);
  const undoSeq = undo?.seq;
  useEffect(() => {
    if (undoSeq === undefined) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undoSeq]);

  const uidNames = useMemo(
    () =>
      Object.fromEntries(
        Object.values(players)
          .filter((p) => p.linkedUid)
          .map((p) => [p.linkedUid!, p.name]),
      ),
    [players],
  );

  // Eliminated players who could rejoin. Their entry score is worked out as it stood right after
  // the latest round, before any rejoins already attached to it.
  const rejoinOptions = useMemo(() => {
    const latest = liveRows(rows).at(-1);
    if (!game || !state || state.status === 'finished' || !latest) return [];
    const stripped = rows.map((r) =>
      r.id === latest.id ? { ...r, doc: { ...r.doc, rejoins: [] } } : r,
    );
    try {
      const base = gameState({ ...game, split: null }, stripped, players);
      return Object.keys(state.players)
        .filter((id) => !state.players[id]!.active)
        .map((id) => ({ id, check: rejoinEligibility(base, id) }));
    } catch {
      return [];
    }
  }, [game, rows, state, players]);

  if (live.loading) return <Loading />;
  if (!game) {
    return (
      <Page title="Game not found" back={{ to: `/l/${leagueId}`, label: 'Games' }}>
        <p className="text-slate-600">{live.error ?? "This game doesn't exist."}</p>
      </Page>
    );
  }

  const close = () => setDialog(null);
  const now = () => Date.now();

  const writeRounds = async (writes: RoundWrite[]) => {
    const batch = writeBatch(db);
    for (const w of writes) {
      const ref = w.id
        ? doc(db, roundPath(leagueId, gameId, w.id))
        : doc(collection(db, roundsPath(leagueId, gameId)));
      batch.set(ref, w.doc);
    }
    await batch.commit();
  };

  /** Runs a plan and saves it. Returns a message for the dialog if it can't be done. */
  const apply = async (plan: Plan<RoundWrite | RoundWrite[]>): Promise<string | null> => {
    if (!plan.ok) return plan.error;
    try {
      await writeRounds(Array.isArray(plan.value) ? plan.value : [plan.value]);
      close();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not save';
    }
  };

  const saveNew = async (round: Round) => {
    const plan = planNewRound(game, rows, players, round, uid, now());
    const problem = await apply(plan);
    if (!problem && plan.ok && !Array.isArray(plan.value)) {
      setUndo({ seq: plan.value.doc.seq, busy: false });
    }
    return problem;
  };

  const undoLast = async () => {
    setError('');
    setUndo((cur) => (cur ? { ...cur, busy: true } : cur));
    const problem = await apply(
      planScrapLatest(rows, 'Undone right after it was entered', uid, now()),
    );
    if (problem) setError(problem);
    setUndo(null);
  };

  const saveEdit = (row: RoundRow) => (round: Round) =>
    apply(planEditRound(game, rows, players, row, round, uid, now()));

  const saveSplit = async (shares: Record<string, number>) => {
    if (!state) return 'The game can not be replayed';
    try {
      const split = toStoredSplit({ afterSeq: state.lastSeq, shares }, storedIds(game, players));
      await updateDoc(doc(db, gamePath(leagueId, gameId)), { split });
      close();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not save';
    }
  };

  const cancelSplit = async () => {
    setError('');
    try {
      await updateDoc(doc(db, gamePath(leagueId, gameId)), { split: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reopen the game');
    }
  };

  const restore = async () => {
    setError('');
    const problem = await apply(planRestore(rows, uid, now()));
    if (problem) setError(problem);
  };

  const live_ = liveRows(rows);
  const canScrap = !!scrappableRow(rows);
  const canRestore = !!restorableRow(rows);
  const finished = state?.status === 'finished';
  const splitFinished = finished && state?.outcome === 'split';
  const problem = live.problem ?? game.summaryError;
  // Offered only while the round just saved is still the latest one, so nothing newer is undone.
  const justSaved = undo && live_.at(-1)?.doc.seq === undo.seq ? undo : null;

  return (
    <Page
      title={state ? `Round ${state.rounds.length + 1}` : 'Game'}
      back={{ to: `/l/${leagueId}`, label: 'Games' }}
      actions={
        <div className="flex items-center gap-2">
          {finished ? (
            <Badge tone="green">Finished</Badge>
          ) : (
            <Badge tone="amber">In progress</Badge>
          )}
          <Button variant="secondary" small onClick={() => setDialog({ kind: 'share' })}>
            Share
          </Button>
          <Button
            variant="danger"
            small
            aria-label="Delete this game"
            onClick={() => setDialog({ kind: 'delete' })}
          >
            Delete
          </Button>
        </div>
      }
    >
      {problem && (
        <Card className="space-y-2 bg-red-50 ring-red-300">
          <p className="font-medium text-red-900">The rounds don't add up to a legal game</p>
          <p className="text-sm text-red-800">{problem}</p>
          <p className="text-sm text-red-800">Scrap or roll back the latest rounds to fix it.</p>
        </Card>
      )}

      {justSaved && (
        <UndoBar
          round={justSaved.seq}
          busy={justSaved.busy}
          onUndo={() => void undoLast()}
          onDismiss={() => setUndo(null)}
        />
      )}

      {state && <ScoreBoard state={state} names={names} />}

      {state && !finished && (
        <>
          <Card className="space-y-3">
            <p className="text-sm text-slate-600">
              <strong>{names[state.dealerId!] ?? '?'}</strong> deals, and{' '}
              <strong>{names[state.firstPlayerId!] ?? '?'}</strong> plays first.
            </p>
            <Button className="w-full" onClick={() => setDialog({ kind: 'round' })}>
              Enter round {state.rounds.length + 1}
            </Button>
          </Card>

          {rejoinOptions.length > 0 && (
            <Card className="space-y-2">
              <h2 className="font-semibold">Out of the game</h2>
              <ul className="space-y-2">
                {rejoinOptions.map(({ id, check }) => (
                  <li key={id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{names[id] ?? '?'}</span>
                      <span className="block text-xs text-slate-500">
                        {check.ok
                          ? `Could rejoin on ${check.entryScore} for $${state.settings.buyIn}`
                          : check.reason}
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      small
                      disabled={!check.ok}
                      onClick={() =>
                        check.ok &&
                        setDialog({ kind: 'rejoin', playerId: id, entryScore: check.entryScore })
                      }
                    >
                      Rejoin
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500">
                Rejoining is only possible before the next round is entered.
              </p>
            </Card>
          )}

          {Object.values(state.players).filter((p) => p.active).length >= 2 && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setDialog({ kind: 'split' })}
            >
              End the game with a split
            </Button>
          )}
        </>
      )}

      {state && finished && (
        <>
          <ResultCard state={state} names={names} />
          {splitFinished ? (
            <Button variant="danger" onClick={() => void cancelSplit()}>
              Cancel the split and reopen the game
            </Button>
          ) : (
            <p className="text-sm text-slate-600">
              Made a mistake? Scrap the latest round to reopen the game.
            </p>
          )}
        </>
      )}

      <ErrorText>{error}</ErrorText>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          small
          disabled={!canScrap}
          onClick={() => setDialog({ kind: 'scrap' })}
        >
          Scrap latest round
        </Button>
        <Button
          variant="danger"
          small
          disabled={live_.length === 0}
          onClick={() => setDialog({ kind: 'rollback' })}
        >
          Roll back…
        </Button>
        <Button variant="secondary" small disabled={!canRestore} onClick={() => void restore()}>
          Restore a round
        </Button>
      </div>

      <h2 className="font-semibold">Rounds</h2>
      <RoundList
        rows={rows}
        state={state}
        names={names}
        uidNames={uidNames}
        onEdit={state ? (row) => setDialog({ kind: 'edit', row }) : null}
      />

      {dialog?.kind === 'round' && state && !finished && (
        <RoundEntry
          title={`Round ${state.rounds.length + 1}`}
          state={state}
          names={names}
          seq={state.lastSeq + 1}
          submitLabel="Save round"
          onSubmit={saveNew}
          onClose={close}
        />
      )}

      {dialog?.kind === 'edit' && (
        <RoundEntry
          title={`Edit round ${dialog.row.doc.seq}`}
          state={stateBefore(game, rows, players, dialog.row.doc.seq)}
          names={names}
          seq={dialog.row.doc.seq}
          initial={toResolvedRound(roundDocToEngine(dialog.row.doc), players)}
          submitLabel="Save changes"
          onSubmit={saveEdit(dialog.row)}
          onClose={close}
        />
      )}

      {dialog?.kind === 'scrap' && (
        <ReasonModal
          title="Scrap the latest round"
          description="It stays visible, struck through, with who scrapped it and why. If it ended the game, the game reopens."
          confirmLabel="Scrap round"
          onConfirm={(reason) => apply(planScrapLatest(rows, reason, uid, now()))}
          onClose={close}
        />
      )}

      {dialog?.kind === 'rollback' && (
        <RollbackModal
          liveSeqs={live_.map((r) => r.doc.seq)}
          onConfirm={(toSeq, reason) => apply(planRollback(rows, toSeq, reason, uid, now()))}
          onClose={close}
        />
      )}

      {dialog?.kind === 'rejoin' && state && !finished && (
        <RejoinModal
          state={state}
          playerId={dialog.playerId}
          names={names}
          entryScore={dialog.entryScore}
          onConfirm={(seat) =>
            apply(planRejoin(game, rows, players, dialog.playerId, seat, uid, now()))
          }
          onClose={close}
        />
      )}

      {dialog?.kind === 'delete' && (
        <ConfirmModal
          title="Delete this game?"
          description="The game, all its rounds and its results are removed for good, and it stops counting in stats and in who owes whom. The league log keeps a note that it was deleted. This can't be undone."
          confirmLabel="Delete game"
          onConfirm={async () => {
            try {
              await deleteGame({ leagueId, gameId });
              navigate(`/l/${leagueId}`, { replace: true });
              return null;
            } catch (e) {
              return errorMessage(e);
            }
          }}
          onClose={close}
        />
      )}

      {dialog?.kind === 'share' && state && (
        <ShareModal
          leagueId={leagueId}
          gameId={gameId}
          leagueName={league.name}
          state={state}
          names={names}
          startedAt={game.createdAt}
          shareCode={game.shareCode}
          onClose={close}
        />
      )}

      {dialog?.kind === 'split' && state && !finished && (
        <SplitModal state={state} names={names} onConfirm={saveSplit} onClose={close} />
      )}
    </Page>
  );
}
