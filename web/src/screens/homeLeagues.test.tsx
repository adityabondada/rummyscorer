// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { LeagueDoc } from '@rummy/data';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Snap = { docs: { data: () => unknown }[]; empty: boolean };
type Listener = { next: (snap: Snap) => void; error: (e: Error) => void };
const listeners = new Map<string, Listener>();
const stops = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  query: (c: { path: string }, ...parts: { kind: string }[]) => ({
    path: c.path,
    kind: parts.map((p) => p.kind).join('+'),
  }),
  orderBy: () => ({ kind: 'newest' }),
  where: () => ({ kind: 'live' }),
  limit: () => ({ kind: 'one' }),
  onSnapshot: (
    q: { path: string; kind?: string },
    next: (snap: Snap) => void,
    error: (e: Error) => void = () => {},
  ) => {
    const id = `${q.path}#${q.kind ?? 'all'}`;
    listeners.set(id, { next, error });
    return () => {
      stops(id);
      listeners.delete(id);
    };
  },
}));
vi.mock('../firebase', () => ({ db: {} }));

const createLeague = vi.fn();
const joinLeague = vi.fn();
let user: { uid: string; displayName: string | null };
vi.mock('../auth', () => ({ useUser: () => user }));
vi.mock('../api', () => ({
  createLeague: (...a: unknown[]) => createLeague(...a),
  joinLeague: (...a: unknown[]) => joinLeague(...a),
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.'),
}));

import * as hooks from '../hooks';
import { LeaguesScreen } from './LeaguesScreen';

const newest = (id: string) => listeners.get(`leagues/${id}/games#newest+one`)!;
const live = (id: string) => listeners.get(`leagues/${id}/games#live+one`)!;
const snap = (docs: unknown[]): Snap => ({
  docs: docs.map((d) => ({ data: () => d })),
  empty: docs.length === 0,
});

beforeEach(() => {
  listeners.clear();
  stops.mockReset();
  user = { uid: 'u1', displayName: 'Asha Rao' };
  createLeague.mockReset().mockResolvedValue({ leagueId: 'L9' });
  joinLeague.mockReset().mockResolvedValue({ leagueId: 'L9' });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('what each league is up to', () => {
  it('knows when the latest game began and whether one is on, once both have answered', () => {
    const { result } = renderHook(() => hooks.useLeagueActivity(['L1']));
    expect(result.current).toEqual({});
    act(() => newest('L1').next(snap([{ createdAt: 1234 }])));
    expect(result.current).toEqual({});
    act(() => live('L1').next(snap([{ status: 'inProgress' }])));
    expect(result.current).toEqual({ L1: { live: true, lastAt: 1234 } });
  });

  it('says a league with no games has none, and none on', () => {
    const { result } = renderHook(() => hooks.useLeagueActivity(['L1']));
    act(() => newest('L1').next(snap([])));
    act(() => live('L1').next(snap([])));
    expect(result.current).toEqual({ L1: { live: false, lastAt: null } });
  });

  it('follows a game being started and finished, live', () => {
    const { result } = renderHook(() => hooks.useLeagueActivity(['L1']));
    act(() => newest('L1').next(snap([{ createdAt: 100 }])));
    act(() => live('L1').next(snap([])));
    expect(result.current.L1).toEqual({ live: false, lastAt: 100 });
    act(() => newest('L1').next(snap([{ createdAt: 200 }])));
    act(() => live('L1').next(snap([{ status: 'inProgress' }])));
    expect(result.current.L1).toEqual({ live: true, lastAt: 200 });
  });

  it('keeps leagues apart, and drops one it can no longer read', () => {
    const { result } = renderHook(() => hooks.useLeagueActivity(['L1', 'L2']));
    for (const id of ['L1', 'L2']) {
      act(() => newest(id).next(snap([{ createdAt: id === 'L1' ? 1 : 2 }])));
      act(() => live(id).next(snap([])));
    }
    expect(Object.keys(result.current).sort()).toEqual(['L1', 'L2']);
    act(() => live('L1').error(new Error('permission-denied')));
    expect(Object.keys(result.current)).toEqual(['L2']);
  });

  it('only ever asks for the newest game and one game in progress, never the whole history', () => {
    renderHook(() => hooks.useLeagueActivity(['L1']));
    expect([...listeners.keys()].sort()).toEqual([
      'leagues/L1/games#live+one',
      'leagues/L1/games#newest+one',
    ]);
  });

  it('stops listening to a league that leaves the list, and when the screen goes away', () => {
    const { rerender, unmount } = renderHook(({ ids }) => hooks.useLeagueActivity(ids), {
      initialProps: { ids: ['L1', 'L2'] },
    });
    rerender({ ids: ['L2'] });
    expect(stops).toHaveBeenCalledWith('leagues/L1/games#newest+one');
    expect(stops).toHaveBeenCalledWith('leagues/L1/games#live+one');
    unmount();
    expect(stops).toHaveBeenCalledWith('leagues/L2/games#live+one');
  });
});

const doc = (name: string): LeagueDoc => ({
  name,
  adminUid: 'u1',
  inviteCode: 'ABCD2345',
  memberUids: ['u1'],
  createdAt: 1,
});

function renderHome(
  leagues: { id: string; name: string }[],
  counts: Record<string, number> = {},
  activity: Record<string, { live: boolean; lastAt: number | null }> = {},
) {
  vi.spyOn(hooks, 'useMyLeagues').mockReturnValue({
    loading: false,
    value: leagues.map((l) => ({ id: l.id, doc: doc(l.name) })),
    error: null,
  });
  vi.spyOn(hooks, 'usePlayerCounts').mockReturnValue(counts);
  vi.spyOn(hooks, 'useLeagueActivity').mockReturnValue(activity);
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<LeaguesScreen />} />
        <Route path="/l/:id" element={<p>A league page</p>} />
        <Route path="/l/:id/claim" element={<p>The claim page</p>} />
        <Route path="/profile" element={<p>Profile page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const card = (name: string) => screen.getByText(name).closest('a')!;

describe('the home screen', () => {
  const two = [
    { id: 'L1', name: 'Friday Rummy' },
    { id: 'L2', name: 'Office' },
  ];

  it('makes the leagues the point of the page: a title, a count, and a big card for each', () => {
    renderHome(two, { L1: 7, L2: 4 });
    expect(screen.getByRole('heading', { name: 'Your leagues' })).toBeInTheDocument();
    expect(screen.getByText('2 leagues, tap one to open it')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Your leagues' });
    expect(within(list).getAllByRole('link')).toHaveLength(2);
    expect(card('Friday Rummy')).toHaveAttribute('href', '/l/L1');
    expect(card('Friday Rummy')).toHaveTextContent('7 players');
  });

  it('greets by first name, with the profile icon beside it', () => {
    renderHome(two);
    expect(screen.getByText('Hi, Asha')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile');
  });

  it('leaves the greeting out when there is no name yet', () => {
    user = { uid: 'u1', displayName: null };
    renderHome(two);
    expect(screen.queryByText(/^Hi,/)).not.toBeInTheDocument();
  });

  it('says how many players and when it was last played', () => {
    const lastAt = Date.now() - 60_000;
    renderHome(
      two,
      { L1: 7, L2: 1 },
      {
        L1: { live: false, lastAt },
        L2: { live: false, lastAt: null },
      },
    );
    expect(card('Friday Rummy')).toHaveTextContent('7 players · last played today');
    expect(card('Office')).toHaveTextContent('1 player · no games yet');
  });

  it('marks a league with a game on, and outlines it', () => {
    renderHome(two, {}, { L1: { live: true, lastAt: 5 }, L2: { live: false, lastAt: 9 } });
    expect(within(card('Friday Rummy')).getByText('Game in progress')).toBeInTheDocument();
    expect(card('Friday Rummy').className).toContain('ring-2');
    expect(within(card('Office')).queryByText('Game in progress')).not.toBeInTheDocument();
    expect(card('Office').className).not.toContain('ring-2');
  });

  it('puts the league with a game on first, then the most recent', () => {
    const three = [...two, { id: 'L3', name: 'Chess club' }];
    renderHome(
      three,
      {},
      {
        L1: { live: false, lastAt: 100 },
        L2: { live: false, lastAt: 900 },
        L3: { live: true, lastAt: 50 },
      },
    );
    const names = within(screen.getByRole('list', { name: 'Your leagues' }))
      .getAllByRole('link')
      .map((a) => a.querySelector('span span')?.textContent);
    expect(names).toEqual(['Chess club', 'Office', 'Friday Rummy']);
  });

  it('opens a league when its card is tapped', async () => {
    const u = renderHome(two);
    await u.click(card('Office'));
    expect(await screen.findByText('A league page')).toBeInTheDocument();
  });

  it('has two buttons under the cards, not two forms', () => {
    renderHome(two);
    expect(screen.getByRole('button', { name: 'New league' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join with a code' })).toBeInTheDocument();
    expect(screen.queryByLabelText('League name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument();
  });

  it('starts a league from a popup, under the profile name', async () => {
    const u = renderHome(two);
    await u.click(screen.getByRole('button', { name: 'New league' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Start a league' }));
    expect(dialog.getByRole('button', { name: 'Create league' })).toBeDisabled();
    await u.type(dialog.getByLabelText('League name'), 'Poker night');
    await u.click(dialog.getByRole('button', { name: 'Create league' }));
    expect(createLeague).toHaveBeenCalledWith({ name: 'Poker night', displayName: 'Asha Rao' });
    expect(await screen.findByText('A league page')).toBeInTheDocument();
  });

  it('joins a league from a popup, then goes to the claim page', async () => {
    const u = renderHome(two);
    await u.click(screen.getByRole('button', { name: 'Join with a code' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Join a league' }));
    await u.type(dialog.getByLabelText('Invite code'), 'ABCD2345');
    await u.click(dialog.getByRole('button', { name: 'Join league' }));
    expect(joinLeague).toHaveBeenCalledWith({ code: 'ABCD2345', displayName: 'Asha Rao' });
    expect(await screen.findByText('The claim page')).toBeInTheDocument();
  });

  it('says why inside the popup when it fails, and clears that on the next open', async () => {
    joinLeague.mockRejectedValue(new Error('That invite code is not valid'));
    const u = renderHome(two);
    await u.click(screen.getByRole('button', { name: 'Join with a code' }));
    await u.type(screen.getByLabelText('Invite code'), 'WRONG');
    await u.click(screen.getByRole('button', { name: 'Join league' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not valid');
    await u.click(screen.getByRole('button', { name: 'Close' }));
    await u.click(screen.getByRole('button', { name: 'New league' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the invitation to start a first league, with the same two buttons, when there are none', async () => {
    const u = renderHome([]);
    expect(screen.getByRole('heading', { name: 'Start your first league' })).toBeInTheDocument();
    expect(screen.queryByText(/tap one to open it/)).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Your leagues' })).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'New league' }));
    expect(screen.getByRole('dialog', { name: 'Start a league' })).toBeInTheDocument();
  });

  it('shows the count for a single league in the singular', () => {
    renderHome([two[0]!]);
    expect(screen.getByText('1 league, tap it to open it')).toBeInTheDocument();
  });
});
