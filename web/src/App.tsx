import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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
import { Loading } from './ui';

function Routed() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <SignInScreen />;
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
