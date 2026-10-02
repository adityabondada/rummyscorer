// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import type { PlayerDoc } from '@rummy/data';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const inviteInfo = vi.fn();
const joinLeague = vi.fn();
const mergePlayers = vi.fn();
let user: { uid: string; displayName: string | null };

vi.mock('../api', () => ({
  inviteInfo: (...args: unknown[]) => inviteInfo(...args),
  joinLeague: (...args: unknown[]) => joinLeague(...args),
  mergePlayers: (...args: unknown[]) => mergePlayers(...args),
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.'),
}));
vi.mock('../auth', () => ({
  useUser: () => user,
  useAuth: () => ({ signInWithGoogle: vi.fn(), signInAsTester: null }),
}));
vi.mock('../hooks', () => ({
  useGames: () => games,
  useSettled: () => ({ loading: false, value: {} }),
}));
vi.mock('firebase/firestore', () => ({ deleteDoc: vi.fn(), doc: vi.fn(), setDoc: vi.fn() }));
vi.mock('../firebase', () => ({ db: {} }));

import { ClaimScreen } from './ClaimScreen';
import { GamesTab } from './GamesTab';
import { JoinScreen } from './JoinScreen';
import type { LeagueContext } from './LeagueLayout';
import { SignInScreen } from './SignInScreen';

let games: { loading: boolean; value: unknown[] };

const person = (name: string, over: Partial<PlayerDoc> = {}): PlayerDoc => ({
  name,
  linkedUid: null,
  retired: false,
  mergedInto: null,
  createdBy: 'u',
  createdAt: 1,
  ...over,
});

const notFound = () => Object.assign(new Error('not found'), { code: 'functions/not-found' });

beforeEach(() => {
  user = { uid: 'u1', displayName: 'Asha' };
  games = { loading: false, value: [] };
  inviteInfo.mockReset().mockResolvedValue({ leagueName: 'Friday Rummy', members: 5 });
  joinLeague.mockReset().mockResolvedValue({ leagueId: 'L1', playerId: 'p1' });
  mergePlayers.mockReset().mockResolvedValue({});
});
afterEach(cleanup);

describe('the sign-in screen, reached from an invite', () => {
  it('says which league the invite is for, and how many people are in it, before signing in', async () => {
    render(<SignInScreen invite="ABCD2345" />);
    expect(await screen.findByTestId('invite-banner')).toHaveTextContent(
      "You're invited to join Friday Rummy · 5 people",
    );
    expect(screen.getByRole('button', { name: 'Sign in with Google to join' })).toBeInTheDocument();
    expect(inviteInfo).toHaveBeenCalledWith({ code: 'ABCD2345' });
  });

  it('says "1 person" for a league with one member', async () => {
    inviteInfo.mockResolvedValue({ leagueName: 'Solo', members: 1 });
    render(<SignInScreen invite="ABCD2345" />);
    expect(await screen.findByTestId('invite-banner')).toHaveTextContent('Solo · 1 person');
  });

  it('keeps the usual line while it checks, and for a screen with no invite', () => {
    render(<SignInScreen invite="ABCD2345" />);
    expect(screen.getByText(/Scores, drops, rejoins and settling up/)).toBeInTheDocument();
  });

  it('does not look anything up when nobody came from an invite', async () => {
    render(<SignInScreen />);
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 10));
    expect(inviteInfo).not.toHaveBeenCalled();
  });

  it('says so when the invite link is not valid any more', async () => {
    inviteInfo.mockRejectedValue(notFound());
    render(<SignInScreen invite="OLDCODE1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent("isn't valid any more");
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });

  it('carries on with the plain screen when the check itself fails, such as with no signal', async () => {
    inviteInfo.mockRejectedValue(new Error('offline'));
    render(<SignInScreen invite="ABCD2345" />);
    await waitFor(() => expect(inviteInfo).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

function renderJoin(code = 'ABCD2345') {
  render(
    <MemoryRouter initialEntries={[`/join/${code}`]}>
      <Routes>
        <Route path="/join/:code" element={<JoinScreen />} />
        <Route path="/l/:id/claim" element={<p>The claim page</p>} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('the join page', () => {
  it('names the league and joins as the name already on the profile, without asking again', async () => {
    const u = renderJoin();
    expect(await screen.findByText(/You've been invited to join/)).toHaveTextContent(
      'Friday Rummy · 5 people',
    );
    expect(screen.getByText(/You'll join as/)).toHaveTextContent('Asha');
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Join Friday Rummy' }));
    expect(joinLeague).toHaveBeenCalledWith({ code: 'ABCD2345', displayName: 'Asha' });
    expect(await screen.findByText('The claim page')).toBeInTheDocument();
  });

  it('asks for a name only when the profile has none, and waits for one', async () => {
    user = { uid: 'u1', displayName: null };
    const u = renderJoin();
    const button = await screen.findByRole('button', { name: 'Join Friday Rummy' });
    expect(button).toBeDisabled();
    await u.type(screen.getByLabelText('Your name'), '  Ravi ');
    expect(button).toBeEnabled();
    await u.click(button);
    expect(joinLeague).toHaveBeenCalledWith({ code: 'ABCD2345', displayName: 'Ravi' });
  });

  it('treats a blank profile name as none', async () => {
    user = { uid: 'u1', displayName: '   ' };
    renderJoin();
    expect(await screen.findByLabelText('Your name')).toBeInTheDocument();
  });

  it('tells someone with a dead link, and gives no join button', async () => {
    inviteInfo.mockRejectedValue(notFound());
    renderJoin('OLDCODE1');
    expect(await screen.findByRole('alert')).toHaveTextContent("isn't valid any more");
    expect(screen.queryByRole('button', { name: /^Join/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your leagues' })).toHaveAttribute('href', '/');
  });

  it('still lets them join by code when the league could not be looked up', async () => {
    inviteInfo.mockRejectedValue(new Error('offline'));
    const u = renderJoin();
    expect(await screen.findByText(/invited with code/)).toHaveTextContent('ABCD2345');
    await u.click(screen.getByRole('button', { name: 'Join league' }));
    expect(joinLeague).toHaveBeenCalledWith({ code: 'ABCD2345', displayName: 'Asha' });
  });

  it('shows why joining failed and lets them try again', async () => {
    joinLeague.mockRejectedValueOnce(new Error('That invite code is not valid'));
    const u = renderJoin();
    await u.click(await screen.findByRole('button', { name: 'Join Friday Rummy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not valid');
    expect(screen.getByRole('button', { name: 'Join Friday Rummy' })).toBeEnabled();
  });
});

function renderClaim(players: Record<string, PlayerDoc>, myPlayerId: string | null = 'me') {
  const context = { leagueId: 'L1', players, myPlayerId } as unknown as LeagueContext;
  render(
    <MemoryRouter initialEntries={['/claim']}>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="/claim" element={<ClaimScreen />} />
          <Route path="/l/:id" element={<p>The league</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('the claim page', () => {
  const me = { me: person('Asha', { linkedUid: 'u1' }) };

  it('goes straight to the league when there is nobody to claim', async () => {
    renderClaim(me);
    expect(await screen.findByText('The league')).toBeInTheDocument();
    expect(screen.queryByText(/no guest players/)).not.toBeInTheDocument();
  });

  it('ignores guests who are retired or already linked to someone', async () => {
    renderClaim({
      ...me,
      a: person('Old', { retired: true }),
      b: person('Linked', { mergedInto: 'me' }),
    });
    expect(await screen.findByText('The league')).toBeInTheDocument();
  });

  it('asks which guest is them when there are guests to claim', async () => {
    const u = renderClaim({ ...me, g1: person('Ravi'), g2: person('Bo') });
    expect(
      screen.getByRole('heading', { name: 'Are you one of these players?' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('The league')).not.toBeInTheDocument();
    await u.click(screen.getAllByRole('button', { name: "That's me" })[0]!);
    expect(mergePlayers).toHaveBeenCalledWith({
      leagueId: 'L1',
      guestId: expect.stringMatching(/^g[12]$/),
      targetId: 'me',
    });
    expect(await screen.findByText('The league')).toBeInTheDocument();
  });

  it('lets them say none of the guests is them', async () => {
    const u = renderClaim({ ...me, g1: person('Ravi') });
    await u.click(screen.getByRole('button', { name: 'None of these are me' }));
    expect(mergePlayers).not.toHaveBeenCalled();
    expect(await screen.findByText('The league')).toBeInTheDocument();
  });
});

function renderGames(players: Record<string, PlayerDoc>) {
  const context = {
    leagueId: 'L1',
    uid: 'u1',
    players,
    names: Object.fromEntries(Object.entries(players).map(([id, p]) => [id, p.name])),
  } as unknown as LeagueContext;
  render(
    <MemoryRouter initialEntries={['/l/L1']}>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="/l/:id" element={<GamesTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('a league with no games yet', () => {
  it('points at the first game when there are enough players, instead of a bare list', () => {
    renderGames({ a: person('Asha'), b: person('Bo') });
    expect(screen.getByRole('heading', { name: 'Deal the first game' })).toBeInTheDocument();
    const start = screen.getByRole('link', { name: 'Start your first game' });
    expect(start).toHaveAttribute('href', '/l/L1/new-game');
    // One clear button, not two that do the same thing.
    expect(screen.queryByRole('link', { name: 'New game' })).not.toBeInTheDocument();
  });

  it('points at adding players when there are fewer than two', () => {
    renderGames({ a: person('Asha') });
    expect(screen.getByRole('heading', { name: 'Add your players first' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add players' })).toHaveAttribute(
      'href',
      '/l/L1/players',
    );
    expect(screen.queryByRole('link', { name: 'Start your first game' })).not.toBeInTheDocument();
  });

  it('does not count retired players or merged guests as people to play with', () => {
    renderGames({
      a: person('Asha'),
      b: person('Bo', { retired: true }),
      c: person('Cy', { mergedInto: 'a' }),
    });
    expect(screen.getByRole('heading', { name: 'Add your players first' })).toBeInTheDocument();
  });

  it('waits for the games to load before saying there are none', () => {
    games = { loading: true, value: [] };
    renderGames({ a: person('Asha'), b: person('Bo') });
    expect(screen.queryByRole('heading', { name: 'Deal the first game' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
