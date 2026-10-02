import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { playerPath, playersPath, type PlayerDoc } from '@rummy/data';
import { errorMessage, mergePlayers, regenerateInvite, removeMember, unmergePlayers } from '../api';
import { db } from '../firebase';
import { Badge, Button, ErrorText, Field, Modal } from '../ui';
import { useLeagueContext } from './LeagueLayout';

/** The "…" button on a row and the short list of actions it opens. Closes on Escape or a tap away. */
function RowMenu({
  label,
  actions,
}: {
  label: string;
  actions: { label: string; danger?: boolean; onSelect: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <span ref={box} className="relative">
      <Button
        variant="ghost"
        small
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        …
      </Button>
      {open && (
        <ul
          role="menu"
          aria-label={label}
          className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg bg-white py-1 text-sm shadow-lg ring-1 ring-slate-200"
        >
          {actions.map((a) => (
            <li key={a.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={`block w-full px-3 py-2.5 text-left hover:bg-slate-50 ${
                  a.danger ? 'text-red-700' : 'text-slate-800'
                }`}
                onClick={() => {
                  setOpen(false);
                  a.onSelect();
                }}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

export function PlayersTab() {
  const { leagueId, league, uid, isAdmin, players } = useLeagueContext();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);
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
      setAdding(false);
    });
  };

  const inviteLink = `${window.location.origin}/join/${league.inviteCode}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed. Select the link and copy it by hand.');
    }
  };

  const current = Object.entries(players)
    .filter(([, p]) => p.mergedInto === null)
    .sort(([, a], [, b]) => a.name.localeCompare(b.name));
  const linkedGuestsOf = (memberId: string) =>
    Object.entries(players).filter(([, p]) => p.mergedInto === memberId);
  const isCurrentMember = (p: PlayerDoc) =>
    p.linkedUid !== null && league.memberUids.includes(p.linkedUid);
  // Only people still in the league can have a guest linked to them.
  const members = current.filter(([, p]) => isCurrentMember(p));

  return (
    <>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setAdding(true)}>
          Add player
        </Button>
        {isAdmin && (
          <Button variant="secondary" className="flex-1" onClick={() => setInviting(true)}>
            Invite
          </Button>
        )}
      </div>
      <ErrorText>{error}</ErrorText>

      <ul className="space-y-2" aria-label="Players">
        {current.map(([id, p]) => {
          const member = isCurrentMember(p);
          const former = p.linkedUid !== null && !member;
          const canRemove = isAdmin && member && p.linkedUid !== league.adminUid;
          const actions = [
            { label: 'Rename', onSelect: () => setRenaming({ id, name: p.name }) },
            {
              label: p.retired ? 'Bring back' : 'Retire',
              onSelect: () =>
                void run(() =>
                  updateDoc(doc(db, playerPath(leagueId, id)), { retired: !p.retired }),
                ),
            },
            ...(canRemove
              ? [
                  {
                    label: 'Remove from league',
                    danger: true,
                    onSelect: () => {
                      if (
                        window.confirm(
                          `Remove ${p.name} from the league? They lose access. Their games and stats stay.`,
                        )
                      ) {
                        void run(() => removeMember({ leagueId, memberUid: p.linkedUid! }));
                      }
                    },
                  },
                ]
              : []),
          ];
          return (
            <li key={id} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={p.retired ? 'text-slate-400 line-through' : 'font-medium'}>
                    {p.name}
                  </span>
                  {member && <Badge tone="green">Member</Badge>}
                  {former && <Badge>Former member</Badge>}
                  {!p.linkedUid && <Badge>Guest</Badge>}
                  {p.linkedUid === league.adminUid && member && <Badge tone="green">Admin</Badge>}
                  {p.linkedUid === uid && <Badge>You</Badge>}
                  {p.retired && <Badge tone="amber">Retired</Badge>}
                </span>
                <span className="flex items-center gap-1">
                  {!p.linkedUid && members.length > 0 && !p.retired && (
                    <Button variant="ghost" small onClick={() => setLinking(id)}>
                      Link to a member
                    </Button>
                  )}
                  <RowMenu label={`More actions for ${p.name}`} actions={actions} />
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
          );
        })}
      </ul>

      {adding && (
        <Modal title="Add a player" onClose={() => setAdding(false)}>
          <form className="space-y-3" onSubmit={addGuest}>
            <p className="text-sm text-slate-600">
              For someone without the app. They can play, score and settle like anyone else, and can
              link to their own account later.
            </p>
            <Field
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoFocus
            />
            <Button type="submit" disabled={!name.trim()}>
              Add player
            </Button>
          </form>
        </Modal>
      )}

      {inviting && (
        <Modal title="Invite people" onClose={() => setInviting(false)}>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Share this link or code. Opening it and signing in adds them to the league.
            </p>
            <p
              className="break-all rounded-lg bg-slate-50 px-3 py-2 text-sm"
              data-testid="invite-link"
            >
              {inviteLink}
            </p>
            <p className="text-sm">
              Code: <strong className="tracking-widest">{league.inviteCode}</strong>
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy link'}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm('Old links and codes will stop working. Continue?')) {
                    void run(() => regenerateInvite({ leagueId }));
                  }
                }}
              >
                New invite
              </Button>
            </div>
          </div>
        </Modal>
      )}

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
