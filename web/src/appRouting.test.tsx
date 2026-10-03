// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

let auth: { user: { uid: string } | null; loading: boolean };
vi.mock('./auth', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => auth,
}));
vi.mock('./backdrop', () => ({ CardBackdrop: () => null }));
vi.mock('./screens/SignInScreen', () => ({
  SignInScreen: ({ invite }: { invite?: string }) => <p>Sign in {invite ?? 'plain'}</p>,
}));
vi.mock('./screens/LeaguesScreen', () => ({ LeaguesScreen: () => <p>Your leagues</p> }));
vi.mock('./screens/ProfileScreen', () => ({ ProfileScreen: () => <p>Profile page</p> }));
vi.mock('./screens/JoinScreen', () => ({ JoinScreen: () => <p>Join page</p> }));
vi.mock('./screens/ViewScreen', () => ({ ViewScreen: () => <p>Shared game</p> }));
vi.mock('./screens/ClaimScreen', () => ({ ClaimScreen: () => null }));
vi.mock('./screens/GameScreen', () => ({ GameScreen: () => null }));
vi.mock('./screens/GamesTab', () => ({ GamesTab: () => <p>Games tab</p> }));
vi.mock('./screens/LeagueLayout', async () => {
  const { Outlet } = await import('react-router-dom');
  return { LeagueLayout: () => <Outlet />, LeagueTabs: () => <Outlet /> };
});
vi.mock('./screens/NewGameScreen', () => ({ NewGameScreen: () => null }));
vi.mock('./screens/PlayersTab', () => ({ PlayersTab: () => null }));
vi.mock('./screens/StatsTab', () => ({ StatsTab: () => null }));

import { Routed } from './App';

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}
const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routed />
      <Where />
    </MemoryRouter>,
  );

afterEach(cleanup);

describe('where signing in lands', () => {
  it('starts at Your leagues when someone signs in from the first page', () => {
    auth = { user: { uid: 'u' }, loading: false };
    at('/');
    expect(screen.getByText('Your leagues')).toBeInTheDocument();
  });

  it('sends a signed-out visitor on the Profile page back to the first page, so signing in does not return there', () => {
    auth = { user: null, loading: false };
    at('/profile');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
    expect(screen.getByText('Sign in plain')).toBeInTheDocument();
  });

  it('does the same from a league page or any old address', () => {
    for (const path of ['/l/L1', '/l/L1/stats', '/anything/else']) {
      auth = { user: null, loading: false };
      at(path);
      expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
      cleanup();
    }
  });

  it('lands on Your leagues after signing in from there', () => {
    auth = { user: null, loading: false };
    const { rerender } = at('/profile');
    auth = { user: { uid: 'u' }, loading: false };
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <Routed />
      </MemoryRouter>,
    );
    expect(screen.getByText('Your leagues')).toBeInTheDocument();
    expect(screen.queryByText('Profile page')).not.toBeInTheDocument();
  });

  it('keeps an invite link s address, so the join page follows the sign-in', () => {
    auth = { user: null, loading: false };
    at('/join/ABCD2345');
    expect(screen.getByTestId('where')).toHaveTextContent('/join/ABCD2345');
    expect(screen.getByText('Sign in ABCD2345')).toBeInTheDocument();
  });

  it('shows a shared game link to anyone, signed in or not, without moving it', () => {
    auth = { user: null, loading: false };
    at('/view/abcdefghijklmnopqrstuv');
    expect(screen.getByText('Shared game')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/view/abcdefghijklmnopqrstuv');
  });

  it('waits while it finds out who is signed in, instead of redirecting a signed-in person', () => {
    auth = { user: null, loading: true };
    at('/profile');
    expect(screen.getByTestId('where')).toHaveTextContent('/profile');
  });

  it('still shows the Profile page to someone who is signed in', () => {
    auth = { user: { uid: 'u' }, loading: false };
    at('/profile');
    expect(screen.getByText('Profile page')).toBeInTheDocument();
  });
});
