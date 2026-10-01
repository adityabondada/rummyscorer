import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { useState, type FormEvent } from 'react';
import { playerPath, playersPath, type PlayerDoc } from '@rummy/data';
import { errorMessage, mergePlayers, unmergePlayers } from '../api';
import { db } from '../firebase';
import { Badge, Button, Card, ErrorText, Field, Modal } from '../ui';
import { useLeagueContext } from './LeagueLayout';

export function PlayersTab() {
  const { leagueId, uid, players } = useLeagueContext();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState('');

  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const addGuest = (e: FormEvent) => {
    e.preventDefault();
    const guest: PlayerDoc = {
      name: name.trim(),
      linkedUid: null,
      retired: false,
      mergedInto: null,
      createdBy: uid,
      createdAt: Date.now(),
    };
    void run(async () => {
      await addDoc(collection(db, playersPath(leagueId)), guest);
      setName('');
    });
  };

  const current = Object.entries(players)
    .filter(([, p]) => p.mergedInto === null)
    .sort(([, a], [, b]) => a.name.localeCompare(b.name));
  const linkedGuestsOf = (memberId: string) =>
    Object.entries(players).filter(([, p]) => p.mergedInto === memberId);
  const members = current.filter(([, p]) => p.linkedUid !== null);

  return (
    <>
      <form onSubmit={addGuest}>
        <Card className="space-y-3">
          <h2 className="font-semibold">Add a guest player</h2>
          <p className="text-sm text-slate-600">
            For someone without the app. They can play, score and settle like anyone else, and can
            link to their own account later.
          </p>
          <Field
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
          />
          <Button type="submit" disabled={!name.trim()}>
            Add guest
          </Button>
        </Card>
      </form>
      <ErrorText>{error}</ErrorText>

      <ul className="space-y-2">
        {current.map(([id, p]) => (
          <li key={id} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className={p.retired ? 'text-slate-400 line-through' : 'font-medium'}>
                  {p.name}
                </span>
                {p.linkedUid ? <Badge tone="green">Member</Badge> : <Badge>Guest</Badge>}
                {p.retired && <Badge tone="amber">Retired</Badge>}
              </span>
              <span className="flex gap-1">
                <Button variant="ghost" small onClick={() => setRenaming({ id, name: p.name })}>
                  Rename
                </Button>
                {!p.linkedUid && members.length > 0 && !p.retired && (
                  <Button variant="ghost" small onClick={() => setLinking(id)}>
                    Link to a member
                  </Button>
                )}
                <Button
                  variant="ghost"
                  small
                  onClick={() =>
                    void run(() =>
                      updateDoc(doc(db, playerPath(leagueId, id)), { retired: !p.retired }),
                    )
                  }
                >
                  {p.retired ? 'Bring back' : 'Retire'}
                </Button>
              </span>
            </div>
            {linkedGuestsOf(id).map(([gid, g]) => (
              <p
                key={gid}
                className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm"
              >
                <span>
                  Includes games played as guest <strong>{g.name}</strong>
                </span>
                <Button
                  variant="danger"
                  small
                  onClick={() => void run(() => unmergePlayers({ leagueId, guestId: gid }))}
                >
                  Unlink
                </Button>
              </p>
            ))}
          </li>
        ))}
      </ul>

      {renaming && (
        <Modal title="Rename player" onClose={() => setRenaming(null)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await updateDoc(doc(db, playerPath(leagueId, renaming.id)), {
                  name: renaming.name.trim(),
                });
                setRenaming(null);
              });
            }}
          >
            <Field
              label="Name"
              value={renaming.name}
              onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
              maxLength={40}
              autoFocus
            />
            <Button type="submit" disabled={!renaming.name.trim()}>
              Save
            </Button>
          </form>
        </Modal>
      )}

      {linking && (
        <Modal
          title={`Link ${players[linking]?.name ?? 'guest'} to a member`}
          onClose={() => setLinking(null)}
        >
          <p className="mb-3 text-sm text-slate-600">
            Their games and results move to the member's profile. You can undo this later.
          </p>
          <ul className="space-y-2">
            {members.map(([id, p]) => (
              <li key={id}>
                <Button
                  variant="secondary"
                  className="w-full text-left"
                  onClick={() =>
                    void run(async () => {
                      await mergePlayers({ leagueId, guestId: linking, targetId: id });
                      setLinking(null);
                    })
                  }
                >
                  {p.name}
                </Button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
