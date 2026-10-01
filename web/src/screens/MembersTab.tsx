import { useState } from 'react';
import { errorMessage, regenerateInvite, removeMember } from '../api';
import { Badge, Button, Card, ErrorText } from '../ui';
import { useLeagueContext } from './LeagueLayout';

export function MembersTab() {
  const { leagueId, league, isAdmin, players, uid } = useLeagueContext();
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const inviteLink = `${window.location.origin}/join/${league.inviteCode}`;
  const profileName = (memberUid: string) =>
    Object.values(players).find((p) => p.linkedUid === memberUid)?.name ?? 'Member';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed. Select the link and copy it by hand.');
    }
  };

  return (
    <>
      {isAdmin && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Invite people</h2>
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
        </Card>
      )}

      <ErrorText>{error}</ErrorText>

      <Card className="space-y-2">
        <h2 className="font-semibold">Members</h2>
        <ul className="divide-y divide-slate-100">
          {league.memberUids.map((memberUid) => (
            <li key={memberUid} className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2">
                {profileName(memberUid)}
                {memberUid === league.adminUid && <Badge tone="green">Admin</Badge>}
                {memberUid === uid && <Badge>You</Badge>}
              </span>
              {isAdmin && memberUid !== league.adminUid && (
                <Button
                  variant="danger"
                  small
                  onClick={() => {
                    if (window.confirm(`Remove ${profileName(memberUid)} from the league?`)) {
                      void run(() => removeMember({ leagueId, memberUid }));
                    }
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
