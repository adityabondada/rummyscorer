import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage, mergePlayers } from '../api';
import { unclaimedGuests } from '../lib/names';
import { Button, Card, ErrorText, Page } from '../ui';
import { useLeagueContext } from './LeagueLayout';

/** Shown right after joining: lets the new member claim a guest profile the group already had for them. */
export function ClaimScreen() {
  const { leagueId, players, myPlayerId } = useLeagueContext();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const guests = unclaimedGuests(players);

  const claim = async (guestId: string) => {
    if (!myPlayerId) return;
    setBusy(true);
    setError('');
    try {
      await mergePlayers({ leagueId, guestId, targetId: myPlayerId });
      navigate(`/l/${leagueId}`, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const leave = () => navigate(`/l/${leagueId}`, { replace: true });

  // With nobody to claim there is nothing to ask, so go straight to the league.
  const nothingToClaim = guests.length === 0;
  useEffect(() => {
    if (nothingToClaim) navigate(`/l/${leagueId}`, { replace: true });
  }, [nothingToClaim, leagueId, navigate]);
  if (nothingToClaim) return null;

  return (
    <Page title="Are you one of these players?">
      <Card className="space-y-3">
        <p className="text-slate-600">
          Your league already has guest players. If one of them is you, claim them and their games
          and results become yours.
        </p>
        <ul className="space-y-2">
          {guests.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between rounded-lg px-3 py-2 ring-1 ring-slate-200"
            >
              <span className="font-medium">{g.name}</span>
              <Button small disabled={busy || !myPlayerId} onClick={() => void claim(g.id)}>
                That's me
              </Button>
            </li>
          ))}
        </ul>
        <ErrorText>{error}</ErrorText>
        <Button variant="secondary" onClick={leave}>
          None of these are me
        </Button>
      </Card>
    </Page>
  );
}
