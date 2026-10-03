// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LeagueDoc, PlayerDoc } from '@rummy/data';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Snap = { docs: { id: string; data: () => unknown }[] };
const listeners = new Map<string, { next: (snap: Snap) => void; error: (e: Error) => void }>();
const stops = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  query: (q: unknown) => q,
  where: () => ({}),
  onSnapshot: (
    q: { path: string },
    next: (snap: Snap) => void,
    error: (e: Error) => void = () => {},
  ) => {
    listeners.set(q.path, { next, error });
    return () => {
      stops(q.path);
      listeners.delete(q.path);
    };
  },
}));
vi.mock('../firebase', () => ({ db: {} }));

let leagues: { id: string; doc: LeagueDoc }[] = [];
let counts: Record<string, number> = {};

vi.mock('../auth', () => ({ useUser: () => ({ uid: 'u1', displayName: 'Asha' }) }));
vi.mock('../api', () => ({
  createLeague: vi.fn(),
  joinLeague: vi.fn(),
  errorMessage: (e: unknown) => String(e),
}));

import * as hooks from '../hooks';
import { LeaguesScreen } from './LeaguesScreen';

const player = (name: string, over: Partial<PlayerDoc> = {}): PlayerDoc => ({
  name,
  linkedUid: null,
  retired: false,
  mergedInto: null,
  createdBy: 'u',
  createdAt: 1,
  ...over,
});
const doc = (name: string, members: number): LeagueDoc => ({
  name,
  adminUid: 'u1',
  inviteCode: 'ABCD2345',
  memberUids: Array.from({ length: members }, (_, i) => `u${i}`),
  createdAt: 1,
});
const snap = (players: Record<string, PlayerDoc>): Snap => ({
  docs: Object.entries(players).map(([id, p]) => ({ id, data: () => p })),
});
const emit = (leagueId: string, players: Record<string, PlayerDoc>) =>
  act(() => listeners.get(`leagues/${leagueId}/players`)!.next(snap(players)));

beforeEach(() => {
  listeners.clear();
  stops.mockReset();
  leagues = [];
  counts = {};
});
afterEach(cleanup);

describe('the number of players on a league', () => {
  it('counts people who could be picked for a game: not retired, and guests merged into a member once', () => {
    const { result } = renderHook(() => hooks.usePlayerCounts(['L1']));
    expect(result.current).toEqual({});
    emit('L1', {
      a: player('Asha', { linkedUid: 'u1' }),
      b: player('Bo'),
      c: player('Cy', { retired: true }),
      d: player('Old Bo', { mergedInto: 'a' }),
    });
    expect(result.current).toEqual({ L1: 2 });
  });

  it('keeps each league on its own, and updates live as players come and go', () => {
    const { result } = renderHook(() => hooks.usePlayerCounts(['L1', 'L2']));
    emit('L1', { a: player('Asha'), b: player('Bo') });
    emit('L2', { a: player('Asha') });
    expect(result.current).toEqual({ L1: 2, L2: 1 });
    emit('L1', { a: player('Asha'), b: player('Bo'), c: player('Cy') });
    expect(result.current).toEqual({ L1: 3, L2: 1 });
  });

  it('skips a player document that is malformed instead of failing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => hooks.usePlayerCounts(['L1']));
    act(() =>
      listeners.get('leagues/L1/players')!.next({
        docs: [
          { id: 'a', data: () => player('Asha') },
          { id: 'broken', data: () => ({ nope: true }) },
        ],
      }),
    );
    expect(result.current).toEqual({ L1: 1 });
  });

  it('shows nothing for a league it cannot read, and drops it if it stops being readable', () => {
    const { result } = renderHook(() => hooks.usePlayerCounts(['L1']));
    emit('L1', { a: player('Asha') });
    expect(result.current).toEqual({ L1: 1 });
    act(() => listeners.get('leagues/L1/players')!.error(new Error('permission-denied')));
    expect(result.current).toEqual({});
  });

  it('stops listening to a league that leaves the list, and when the screen goes away', () => {
    const { result, rerender, unmount } = renderHook(({ ids }) => hooks.usePlayerCounts(ids), {
      initialProps: { ids: ['L1', 'L2'] },
    });
    emit('L1', { a: player('Asha') });
    emit('L2', { a: player('Asha'), b: player('Bo') });
    rerender({ ids: ['L2'] });
    expect(result.current).toEqual({ L2: 2 });
    expect(stops).toHaveBeenCalledWith('leagues/L1/players');
    unmount();
    expect(stops).toHaveBeenCalledWith('leagues/L2/players');
  });

  it('does not start over when the same leagues come back in another order', () => {
    const { rerender } = renderHook(({ ids }) => hooks.usePlayerCounts(ids), {
      initialProps: { ids: ['L1', 'L2'] },
    });
    rerender({ ids: ['L2', 'L1'] });
    expect(stops).not.toHaveBeenCalled();
  });

  it('has nothing to listen to with no leagues', () => {
    const { result } = renderHook(() => hooks.usePlayerCounts([]));
    expect(result.current).toEqual({});
    expect(listeners.size).toBe(0);
  });
});

describe('the list of leagues on the home screen', () => {
  function renderHome() {
    vi.spyOn(hooks, 'useMyLeagues').mockReturnValue({
      loading: false,
      value: leagues,
      error: null,
    });
    vi.spyOn(hooks, 'usePlayerCounts').mockReturnValue(counts);
    vi.spyOn(hooks, 'useLeagueActivity').mockReturnValue({});
    render(
      <MemoryRouter>
        <LeaguesScreen />
      </MemoryRouter>,
    );
  }
  const row = (name: string) => screen.getByText(name).closest('a')!;

  it('says how many players each league has, not how many members', () => {
    leagues = [
      { id: 'L1', doc: doc('Friday Rummy', 2) },
      { id: 'L2', doc: doc('Office', 1) },
    ];
    counts = { L1: 7, L2: 1 };
    renderHome();
    expect(within(row('Friday Rummy')).getByText('7 players')).toBeInTheDocument();
    expect(within(row('Office')).getByText('1 player')).toBeInTheDocument();
    expect(screen.queryByText(/member/)).not.toBeInTheDocument();
  });

  it('shows a league with no players yet as 0 players', () => {
    leagues = [{ id: 'L1', doc: doc('New one', 1) }];
    counts = { L1: 0 };
    renderHome();
    expect(within(row('New one')).getByText('0 players')).toBeInTheDocument();
  });

  it('shows just the name until the count has loaded, instead of a wrong number', () => {
    leagues = [{ id: 'L1', doc: doc('Friday Rummy', 4) }];
    counts = {};
    renderHome();
    expect(row('Friday Rummy')).toHaveTextContent(/^Friday Rummy›$/);
    expect(screen.queryByText(/\d+ (player|member)/)).not.toBeInTheDocument();
  });
});
