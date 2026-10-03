import { BrowserRouter, Navigate, Route, Routes, useLocation, useMatch } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { CardBackdrop } from './backdrop';
import { ErrorBoundary } from './ErrorBoundary';
import { ClaimScreen } from './screens/ClaimScreen';
import { GameScreen } from './screens/GameScreen';
import { GamesTab } from './screens/GamesTab';
import { JoinScreen } from './screens/JoinScreen';
import { LeagueLayout, LeagueTabs } from './screens/LeagueLayout';
import { LeaguesScreen } from './screens/LeaguesScreen';
import { NewGameScreen } from './screens/NewGameScreen';
import { PlayersTab } from './screens/PlayersTab';
import { ProfileScreen } from './screens/ProfileScreen';
import { StatsTab } from './screens/StatsTab';
import { SignInScreen } from './screens/SignInScreen';
import { ViewScreen } from './screens/ViewScreen';
import { Loading } from './ui';

export function Routed() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const invite = useMatch('/join/:code')?.params.code;
  // A shared game link is for anyone, so it never waits on, or asks for, a sign-in.
  const view = useMatch('/view/:code')?.params.code;
  if (view) return <ViewScreen code={view} />;
  if (loading) return <Loading />;
  // Someone arriving from an invite link sees which league it is for before they sign in. The
  // address stays the same, so after signing in they land on the join page.
  // Signing in always starts at Your leagues: signing out from Profile, or an old address, must not
  // bring the next sign-in back to that page. Only an invite link keeps its address.
  if (!user) {
    if (!invite && pathname !== '/') return <Navigate to="/" replace />;
    return <SignInScreen invite={invite} />;
  }
  return (
    <>
      <CardBackdrop />
      <Routes>
        <Route path="/" element={<LeaguesScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/join/:code" element={<JoinScreen />} />
        <Route path="/l/:leagueId" element={<LeagueLayout />}>
          <Route element={<LeagueTabs />}>
            <Route index element={<GamesTab />} />
            <Route path="stats" element={<StatsTab />} />
            <Route path="players" element={<PlayersTab />} />
            {/* The Members tab was folded into Players; keep old links working. */}
            <Route path="members" element={<Navigate to="../players" replace />} />
          </Route>
          <Route path="claim" element={<ClaimScreen />} />
          <Route path="new-game" element={<NewGameScreen />} />
          <Route path="g/:gameId" element={<GameScreen />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <Routed />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
