// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { DEFAULT_SETTINGS, replay, type GameState, type Round } from '@rummy/engine';
import { settledKey, type PlayerDoc } from '@rummy/data';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shareGame = vi.fn();
const gameView = vi.fn();
let games: { loading: boolean; value: unknown[] };

vi.mock('../api', () => ({
  shareGame: (...args: unknown[]) => shareGame(...args),
  gameView: (...args: unknown[]) => gameView(...args),
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.'),
}));
vi.mock('../hooks', () => ({
  useGames: () => games,
  useSettled: () => ({ loading: false, value: {} }),
}));
vi.mock('firebase/firestore', () => ({ deleteDoc: vi.fn(), doc: vi.fn(), setDoc: vi.fn() }));
vi.mock('../firebase', () => ({ db: {} }));

import { GamesTab } from './GamesTab';
import type { LeagueContext } from './LeagueLayout';
import { SettlingUp } from './SettlingUp';
import { ViewScreen } from './ViewScreen';
import { ShareModal } from './game/ShareModal';

const names = { a: 'Asha', b: 'Bo', c: 'Cy' };
const pts = (points: number) => ({ kind: 'points' as const, points });
const settings = { ...DEFAULT_SETTINGS, limit: 50, maxRoundPenalty: null, buyIn: 10 };
const play = (rounds: Round[]): GameState =>
  replay({ settings, seatOrder: ['a', 'b', 'c'], rounds });

const open = () => play([{ seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(5) } }]);
const finished = () =>
  play([
    { seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(51) } },
    { seq: 2, winnerId: 'a', entries: { b: pts(45) } },
  ]);
const withPenalty = () =>
  play([
    { seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(5) } },
    {
      seq: 2,
      winnerId: null,
      penalty: { playerId: 'b', points: 40, reason: 'wrongShow' },
      entries: { a: pts(0), c: { kind: 'drop' } },
    },
  ]);

const clipboard = { writeText: vi.fn() };
const share = vi.fn();

/** user-event swaps in its own clipboard when set up, so put the test's back afterwards. */
function makeUser(options?: Parameters<typeof userEvent.setup>[0]) {
  const user = userEvent.setup(options);
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  return user;
}

beforeEach(() => {
  games = { loading: false, value: [] };
  shareGame.mockReset().mockResolvedValue({ shareCode: null });
  gameView.mockReset();
  clipboard.writeText.mockReset().mockResolvedValue(undefined);
  share.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the share window for a game', () => {
  function setup(state: GameState, shareCode: string | null | undefined = null) {
    const onClose = vi.fn();
    render(
      <ShareModal
        leagueId="L1"
        gameId="G1"
        leagueName="Friday Rummy"
        state={state}
        names={names}
        shareCode={shareCode}
        onClose={onClose}
      />,
    );
    return { user: makeUser(), onClose };
  }

  it('offers to send the scores, and to make a live view link', () => {
    setup(open());
    expect(screen.getByRole('button', { name: 'Share scores' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a live view link' })).toBeInTheDocument();
    expect(screen.queryByTestId('view-link')).not.toBeInTheDocument();
  });

  it('copies the scores where there is no share sheet, and says so', async () => {
    const { user } = setup(open());
    await user.click(screen.getByRole('button', { name: 'Share scores' }));
    expect(clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('Friday Rummy\nRound 2 in progress'),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Copied. Paste it into your chat.');
  });

  it('opens the phone share sheet when there is one', async () => {
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const { user } = setup(finished());
    await user.click(screen.getByRole('button', { name: 'Share scores' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Friday Rummy scores',
      text: expect.stringContaining('Asha won the $30 pot.'),
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Shared');
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('says what the message holds, depending on whether the game is over', () => {
    setup(finished());
    expect(screen.getByText(/Who won, the nets, and who pays whom/)).toBeInTheDocument();
    cleanup();
    setup(open());
    expect(screen.getByText(/The standings so far/)).toBeInTheDocument();
  });

  it('says so when it can neither share nor copy', async () => {
    clipboard.writeText.mockRejectedValue(new Error('blocked'));
    const { user } = setup(open());
    await user.click(screen.getByRole('button', { name: 'Share scores' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't share or copy");
  });

  it('makes the link on request and shows it straight away, with a way to copy it', async () => {
    shareGame.mockResolvedValue({ shareCode: 'abcdefghijklmnopqrstuv' });
    const { user } = setup(open());
    await user.click(screen.getByRole('button', { name: 'Create a live view link' }));
    expect(shareGame).toHaveBeenCalledWith({ leagueId: 'L1', gameId: 'G1', enable: true });
    expect(await screen.findByTestId('view-link')).toHaveTextContent(
      `${window.location.origin}/view/abcdefghijklmnopqrstuv`,
    );
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/view/abcdefghijklmnopqrstuv`,
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Link copied');
  });

  it('shows a link that is already on, and puts it in the message that is sent', async () => {
    const { user } = setup(open(), 'abcdefghijklmnopqrstuv');
    expect(screen.getByTestId('view-link')).toHaveTextContent('/view/abcdefghijklmnopqrstuv');
    expect(screen.queryByRole('button', { name: 'Create a live view link' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Share scores' }));
    expect(clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        'Watch live: ' + window.location.origin + '/view/abcdefghijklmnopqrstuv',
      ),
    );
  });

  it('turns the link off, and goes back to offering to make one', async () => {
    shareGame.mockResolvedValue({ shareCode: null });
    const { user } = setup(open(), 'abcdefghijklmnopqrstuv');
    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(shareGame).toHaveBeenCalledWith({ leagueId: 'L1', gameId: 'G1', enable: false });
    expect(
      await screen.findByRole('button', { name: 'Create a live view link' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('view-link')).not.toBeInTheDocument();
  });

  it('says why, and keeps what it had, when the link cannot be made', async () => {
    shareGame.mockRejectedValue(new Error('You are not a member of this league'));
    const { user } = setup(open());
    await user.click(screen.getByRole('button', { name: 'Create a live view link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not a member');
    expect(screen.getByRole('button', { name: 'Create a live view link' })).toBeEnabled();
  });

  it('explains that watchers cannot change anything and the link can be turned off', () => {
    setup(open());
    expect(screen.getByText(/without signing in/)).toBeInTheDocument();
    expect(screen.getByText(/can't change anything/)).toBeInTheDocument();
    expect(screen.getByText(/Turn it off whenever you like/)).toBeInTheDocument();
  });
});

describe('the page behind a shared link', () => {
  const view = (state: GameState) => ({
    leagueName: 'Friday Rummy',
    names,
    startedAt: 1,
    state,
  });
  const renderView = () =>
    render(
      <MemoryRouter>
        <ViewScreen code="abcdefghijklmnopqrstuv" />
      </MemoryRouter>,
    );
  const notFound = () => Object.assign(new Error('gone'), { code: 'functions/not-found' });

  it('shows the league, the round, the scoreboard and the rounds, with nobody signed in', async () => {
    gameView.mockResolvedValue(view(open()));
    renderView();
    expect(await screen.findByRole('heading', { name: 'Round 2' })).toBeInTheDocument();
    expect(gameView).toHaveBeenCalledWith({ code: 'abcdefghijklmnopqrstuv' });
    expect(screen.getByText('Friday Rummy')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText(/RACE TO THE LIMIT/i)).toBeInTheDocument();
    const rounds = screen.getByRole('region', { name: 'Rounds' });
    expect(within(rounds).getByText('Asha won')).toBeInTheDocument();
  });

  it('shows a penalty round with the reason, who took it, and the drop', async () => {
    gameView.mockResolvedValue(view(withPenalty()));
    renderView();
    const rounds = within(await screen.findByRole('region', { name: 'Rounds' }));
    expect(rounds.getByText('Wrong show: Bo took 40')).toBeInTheDocument();
    expect(rounds.getByText(/Cy 20/)).toHaveTextContent('(drop)');
  });

  it('shows the result and says final scores once the game is over', async () => {
    gameView.mockResolvedValue(view(finished()));
    renderView();
    expect(await screen.findByRole('heading', { name: 'Final scores' })).toBeInTheDocument();
    expect(screen.getByText('Finished')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Settling up' })).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.tagName === 'LI' && el.textContent === 'Bo pays Asha $10'),
    ).toBeInTheDocument();
  });

  it('is read-only: there is nothing to press except the link to the app', async () => {
    gameView.mockResolvedValue(view(open()));
    renderView();
    await screen.findByRole('heading', { name: 'Round 2' });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Keep score for your own games' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('looks again every few seconds while the game is on, and picks up new rounds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    gameView.mockResolvedValueOnce(view(open())).mockResolvedValue(view(withPenalty()));
    renderView();
    await screen.findByRole('heading', { name: 'Round 2' });
    await act(() => vi.advanceTimersByTimeAsync(6100));
    expect(await screen.findByRole('heading', { name: 'Round 3' })).toBeInTheDocument();
    expect(gameView).toHaveBeenCalledTimes(2);
  });

  it('slows right down once the game is over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    gameView.mockResolvedValue(view(finished()));
    renderView();
    await screen.findByRole('heading', { name: 'Final scores' });
    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(gameView).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(31000));
    expect(gameView).toHaveBeenCalledTimes(2);
  });

  it('says the link is no longer valid, and stops asking, once it has been turned off', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    gameView.mockRejectedValue(notFound());
    renderView();
    expect(
      await screen.findByRole('heading', { name: "This link isn't valid any more" }),
    ).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(gameView).toHaveBeenCalledTimes(1);
  });

  it('switches to that message when the link is turned off while someone is watching', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    gameView.mockResolvedValueOnce(view(open())).mockRejectedValue(notFound());
    renderView();
    await screen.findByRole('heading', { name: 'Round 2' });
    await act(() => vi.advanceTimersByTimeAsync(6100));
    expect(
      await screen.findByRole('heading', { name: "This link isn't valid any more" }),
    ).toBeInTheDocument();
  });

  it('keeps the last scores on screen, and says it is reconnecting, when the connection drops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    gameView.mockResolvedValueOnce(view(open())).mockRejectedValue(new Error('offline'));
    renderView();
    await screen.findByRole('heading', { name: 'Round 2' });
    await act(() => vi.advanceTimersByTimeAsync(6100));
    expect(await screen.findByRole('status')).toHaveTextContent('Reconnecting');
    expect(screen.getByRole('heading', { name: 'Round 2' })).toBeInTheDocument();
  });

  it('recovers by itself when the connection comes back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    gameView
      .mockResolvedValueOnce(view(open()))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(view(withPenalty()));
    renderView();
    await screen.findByRole('heading', { name: 'Round 2' });
    await act(() => vi.advanceTimersByTimeAsync(6100));
    await screen.findByRole('status');
    await act(() => vi.advanceTimersByTimeAsync(6100));
    expect(await screen.findByRole('heading', { name: 'Round 3' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('copying a payment amount', () => {
  const transfers = [
    { from: 'b', to: 'a', amount: 20 },
    { from: 'c', to: 'a', amount: 10 },
  ];
  const props = {
    day: '2026-10-02',
    transfers,
    names,
    settled: {},
    uidNames: {},
    inProgress: 0,
    onMarkPaid: vi.fn(),
    onUndo: vi.fn(),
  };

  it('has a Copy button on each payment still to make, copying just the number', async () => {
    const user = makeUser();
    render(<SettlingUp {...props} />);
    await user.click(screen.getByRole('button', { name: 'Copy 20 for Bo paying Asha' }));
    expect(clipboard.writeText).toHaveBeenCalledWith('20');
    await user.click(screen.getByRole('button', { name: 'Copy 10 for Cy paying Asha' }));
    expect(clipboard.writeText).toHaveBeenLastCalledWith('10');
  });

  it('says Copied on that payment for a moment, then goes back to Copy', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = makeUser({ advanceTimers: vi.advanceTimersByTime });
    render(<SettlingUp {...props} />);
    const button = screen.getByRole('button', { name: 'Copy 20 for Bo paying Asha' });
    await user.click(button);
    expect(button).toHaveTextContent('Copied');
    expect(screen.getByRole('button', { name: 'Copy 10 for Cy paying Asha' })).toHaveTextContent(
      /^Copy$/,
    );
    await act(() => vi.advanceTimersByTimeAsync(2100));
    expect(button).toHaveTextContent(/^Copy$/);
  });

  it('does not say Copied when the browser would not copy', async () => {
    clipboard.writeText.mockRejectedValue(new Error('blocked'));
    const user = makeUser();
    render(<SettlingUp {...props} />);
    await user.click(screen.getByRole('button', { name: 'Copy 20 for Bo paying Asha' }));
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });

  it('is not offered for a payment already marked as paid, and Mark paid is still there', () => {
    const key = settledKey('2026-10-02', 'b', 'a', 20);
    render(
      <SettlingUp
        {...props}
        settled={{ [key]: { day: '2026-10-02', from: 'b', to: 'a', amount: 20, by: 'u', at: 1 } }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Copy 20 for Bo paying Asha' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy 10 for Cy paying Asha' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark paid' })).toHaveLength(1);
  });
});

function renderGames() {
  const person = (name: string): PlayerDoc => ({
    name,
    linkedUid: null,
    retired: false,
    mergedInto: null,
    createdBy: 'u',
    createdAt: 1,
  });
  const players = { a: person('Asha'), b: person('Bo'), c: person('Cy') };
  const context = {
    leagueId: 'L1',
    league: { name: 'Friday Rummy' },
    uid: 'u1',
    players,
    names,
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
  return makeUser();
}

describe('sharing a night s results', () => {
  const night = (
    n: number,
    status: 'finished' | 'inProgress',
    summary: { winner: string; net: Record<string, number> } | null,
  ) => ({
    id: `g${n}`,
    doc: {
      settings,
      seatOrder: ['a', 'b', 'c'],
      status,
      createdBy: 'u',
      createdAt: new Date(2026, 9, 2, 19 + n).getTime(),
      split: null,
      summary: summary && {
        outcome: 'outright',
        winnerIds: [summary.winner],
        pot: 30,
        payouts: {},
        rounds: 4,
        computedAt: 1,
        players: Object.fromEntries(
          Object.entries(summary.net).map(([id, net]) => [
            id,
            {
              net,
              position: net > 0 ? 1 : 2,
              roundsPlayed: 4,
              dropsTaken: 0,
              rejoins: 0,
              buyIns: 1,
              roundsWon: 1,
              penalties: 0,
            },
          ]),
        ),
      },
      summaryError: null,
    },
  });

  it('has a Share button on a night with results, which sends the nets and who pays whom', async () => {
    games = {
      loading: false,
      value: [night(1, 'finished', { winner: 'a', net: { a: 20, b: -10, c: -10 } })],
    };
    const user = renderGames();
    await user.click(screen.getByRole('button', { name: /Share the results for/ }));
    const text = clipboard.writeText.mock.calls[0]![0] as string;
    expect(text).toContain('Friday Rummy · ');
    expect(text).toContain('1 game');
    expect(text).toContain('Net: Asha +$20, Bo −$10, Cy −$10');
    expect(text).toContain('Bo pays Asha $10');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('opens the phone share sheet when there is one, and says Shared', async () => {
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    games = {
      loading: false,
      value: [night(1, 'finished', { winner: 'a', net: { a: 20, b: -10, c: -10 } })],
    };
    const user = renderGames();
    await user.click(screen.getByRole('button', { name: /Share the results for/ }));
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('Friday Rummy') }),
    );
    expect(await screen.findByText('Shared')).toBeInTheDocument();
  });

  it('counts only finished games, and mentions one still being played', async () => {
    games = {
      loading: false,
      value: [
        night(1, 'finished', { winner: 'a', net: { a: 20, b: -10, c: -10 } }),
        night(2, 'inProgress', null),
      ],
    };
    const user = renderGames();
    await user.click(screen.getByRole('button', { name: /Share the results for/ }));
    const text = clipboard.writeText.mock.calls[0]![0] as string;
    expect(text).toContain('1 game\n');
    expect(text).toContain('(1 game still in progress, not counted)');
  });

  it('has no Share button for a night with nothing finished yet', () => {
    games = { loading: false, value: [night(1, 'inProgress', null)] };
    renderGames();
    expect(screen.queryByRole('button', { name: /Share the results for/ })).toBeNull();
  });

  it('says so when it can neither share nor copy', async () => {
    clipboard.writeText.mockRejectedValue(new Error('blocked'));
    games = {
      loading: false,
      value: [night(1, 'finished', { winner: 'a', net: { a: 20, b: -10, c: -10 } })],
    };
    const user = renderGames();
    await user.click(screen.getByRole('button', { name: /Share the results for/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't share or copy");
  });
});
