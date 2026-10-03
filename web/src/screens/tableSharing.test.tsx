// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { DEFAULT_SETTINGS, replay, type GameState, type Round } from '@rummy/engine';
import { settledKey, type PlayerDoc } from '@rummy/data';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shareGame = vi.fn();
const gameView = vi.fn();
const renderGameCard = vi.fn();
const shareImage = vi.fn();
let games: { loading: boolean; value: unknown[] };

vi.mock('../api', () => ({
  shareGame: (...args: unknown[]) => shareGame(...args),
  gameView: (...args: unknown[]) => gameView(...args),
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.'),
}));
vi.mock('../lib/shareImage', async (original) => ({
  ...(await original<typeof import('../lib/shareImage')>()),
  renderGameCard: (...args: unknown[]) => renderGameCard(...args),
  shareImage: (...args: unknown[]) => shareImage(...args),
}));
vi.mock('../hooks', () => ({
  useGames: () => games,
  useSettled: () => ({ loading: false, value: {} }),
}));
const batch = { set: vi.fn(), commit: vi.fn() };
vi.mock('firebase/firestore', () => ({
  deleteDoc: vi.fn(),
  doc: (_db: unknown, path: string) => ({ path }),
  setDoc: vi.fn(),
  writeBatch: () => batch,
}));
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
  renderGameCard.mockReset().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  shareImage.mockReset().mockResolvedValue('shared');
  URL.createObjectURL = vi.fn(() => 'blob:picture');
  URL.revokeObjectURL = vi.fn();
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

  it('offers to send the scores as a picture or as text, and to make a live view link', () => {
    setup(open());
    expect(screen.getByRole('button', { name: 'Share picture' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share as text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a live view link' })).toBeInTheDocument();
    expect(screen.queryByTestId('view-link')).not.toBeInTheDocument();
  });

  it('copies the scores where there is no share sheet, and says so', async () => {
    const { user } = setup(open());
    await user.click(screen.getByRole('button', { name: 'Share as text' }));
    expect(clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('Friday Rummy\nRound 2 in progress'),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Copied. Paste it into your chat.');
  });

  it('opens the phone share sheet when there is one', async () => {
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const { user } = setup(finished());
    await user.click(screen.getByRole('button', { name: 'Share as text' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Friday Rummy scores',
      text: expect.stringContaining('Asha won'),
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Shared');
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('says what the message holds, depending on whether the game is over', () => {
    setup(finished());
    expect(
      screen.getByText(/A picture of who won, the nets, and who pays whom/),
    ).toBeInTheDocument();
    cleanup();
    setup(open());
    expect(screen.getByText(/A picture of the standings so far/)).toBeInTheDocument();
  });

  it('says so when it can neither share nor copy', async () => {
    clipboard.writeText.mockRejectedValue(new Error('blocked'));
    const { user } = setup(open());
    await user.click(screen.getByRole('button', { name: 'Share as text' }));
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
    await user.click(screen.getByRole('button', { name: 'Share as text' }));
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

describe('sharing the scores as a picture', () => {
  function setup(state: GameState = finished()) {
    render(
      <ShareModal
        leagueId="L1"
        gameId="G1"
        leagueName="Friday Rummy"
        state={state}
        names={names}
        startedAt={new Date(2026, 9, 2, 20).getTime()}
        shareCode={null}
        onClose={() => {}}
      />,
    );
    return makeUser();
  }

  it('draws the picture as soon as the window opens and shows it before it is sent', async () => {
    setup();
    expect(
      await screen.findByRole('img', { name: /final scores, as it will be shared/ }),
    ).toHaveAttribute('src', 'blob:picture');
    expect(renderGameCard).toHaveBeenCalledTimes(1);
    const model = renderGameCard.mock.calls[0]![0];
    expect(model).toMatchObject({ kind: 'finished', league: 'Friday Rummy', headline: 'Asha won' });
    expect(model.dateLabel).not.toBe('');
  });

  it('draws the standings so far for a game still on', async () => {
    setup(open());
    expect(await screen.findByRole('img', { name: /current scores/ })).toBeInTheDocument();
    expect(renderGameCard.mock.calls[0]![0]).toMatchObject({ kind: 'live', headline: 'Round 2' });
  });

  it('waits for the picture before the button can be pressed', async () => {
    let finish!: (b: Blob) => void;
    renderGameCard.mockReturnValue(new Promise<Blob>((r) => (finish = r)));
    setup();
    expect(screen.getByRole('status')).toHaveTextContent('Making the picture');
    expect(screen.getByRole('button', { name: 'Share picture' })).toBeDisabled();
    await act(async () => finish(new Blob(['x'])));
    expect(await screen.findByRole('button', { name: 'Share picture' })).toBeEnabled();
  });

  it('sends the picture through the share sheet, named after the league', async () => {
    const user = setup();
    await screen.findByRole('img');
    await user.click(screen.getByRole('button', { name: 'Share picture' }));
    expect(shareImage).toHaveBeenCalledWith(
      expect.any(Blob),
      'friday-rummy-scores.png',
      'Friday Rummy scores',
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Shared');
  });

  it('says it was saved, and what to do with it, where the picture cannot be sent directly', async () => {
    shareImage.mockResolvedValue('saved');
    const user = setup();
    await screen.findByRole('img');
    await user.click(screen.getByRole('button', { name: 'Share picture' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved to your device. Attach it to your chat.',
    );
  });

  it('says nothing when the share sheet is closed', async () => {
    shareImage.mockResolvedValue('cancelled');
    const user = setup();
    await screen.findByRole('img');
    await user.click(screen.getByRole('button', { name: 'Share picture' }));
    expect(screen.queryByText('Shared')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so when sending fails, and lets them try again', async () => {
    shareImage.mockRejectedValueOnce(new Error('boom')).mockResolvedValue('shared');
    const user = setup();
    await screen.findByRole('img');
    await user.click(screen.getByRole('button', { name: 'Share picture' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't share the picture");
    await user.click(screen.getByRole('button', { name: 'Share picture' }));
    expect(await screen.findByText('Shared')).toBeInTheDocument();
  });

  it('falls back to text, as the main button, where the browser cannot draw the picture', async () => {
    renderGameCard.mockRejectedValue(new Error('no canvas'));
    setup();
    expect(await screen.findByText(/can't make the picture/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share picture' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share as text' })).toBeInTheDocument();
  });

  it('still offers the text version beside the picture', async () => {
    const user = setup();
    await screen.findByRole('img');
    await user.click(screen.getByRole('button', { name: 'Share as text' }));
    expect(clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Asha won\nScores:'));
  });

  it('lets go of the picture when the window closes', async () => {
    const { unmount } = render(
      <ShareModal
        leagueId="L1"
        gameId="G1"
        leagueName="Friday Rummy"
        state={finished()}
        names={names}
        shareCode={null}
        onClose={() => {}}
      />,
    );
    await screen.findByRole('img');
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:picture');
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

describe('marking every payment as paid', () => {
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
    onMarkAllPaid: vi.fn(),
    onUndo: vi.fn(),
  };

  beforeEach(() => {
    props.onMarkPaid.mockReset();
    props.onMarkAllPaid.mockReset();
  });

  it('has no Copy button on a payment: a payment is marked paid, nothing more', () => {
    render(<SettlingUp {...props} />);
    expect(screen.queryByRole('button', { name: /Copy/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark paid' })).toHaveLength(2);
  });

  it('offers one button to mark them all, saying how many', async () => {
    const user = makeUser();
    render(<SettlingUp {...props} />);
    await user.click(screen.getByRole('button', { name: 'Mark all paid (2)' }));
    expect(props.onMarkAllPaid).toHaveBeenCalledTimes(1);
    expect(props.onMarkAllPaid).toHaveBeenCalledWith(transfers);
    expect(props.onMarkPaid).not.toHaveBeenCalled();
  });

  it('marks only the payments still to make when some are already paid', async () => {
    const key = settledKey('2026-10-02', 'b', 'a', 20);
    const three = [...transfers, { from: 'c', to: 'b', amount: 5 }];
    const user = makeUser();
    render(
      <SettlingUp
        {...props}
        transfers={three}
        settled={{ [key]: { day: '2026-10-02', from: 'b', to: 'a', amount: 20, by: 'u', at: 1 } }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Mark all paid (2)' }));
    expect(props.onMarkAllPaid).toHaveBeenCalledWith([three[1], three[2]]);
  });

  it('is left out when there is only one payment to make, as Mark paid already does it', () => {
    const key = settledKey('2026-10-02', 'b', 'a', 20);
    render(
      <SettlingUp
        {...props}
        settled={{ [key]: { day: '2026-10-02', from: 'b', to: 'a', amount: 20, by: 'u', at: 1 } }}
      />,
    );
    expect(screen.queryByRole('button', { name: /Mark all paid/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark paid' })).toHaveLength(1);
  });

  it('is left out once everything is settled, and when there is nothing to pay', () => {
    const settled = Object.fromEntries(
      transfers.map((t) => [
        settledKey('2026-10-02', t.from, t.to, t.amount),
        { day: '2026-10-02', ...t, by: 'u', at: 1 },
      ]),
    );
    render(<SettlingUp {...props} settled={settled} />);
    expect(screen.queryByRole('button', { name: /Mark all paid/ })).not.toBeInTheDocument();
    expect(screen.getByText('All settled')).toBeInTheDocument();
    cleanup();
    render(<SettlingUp {...props} transfers={[]} />);
    expect(screen.queryByRole('button', { name: /Mark all paid/ })).not.toBeInTheDocument();
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

describe('marking a whole night paid from the Games tab', () => {
  const finishedNight = {
    id: 'g1',
    doc: {
      settings,
      seatOrder: ['a', 'b', 'c'],
      status: 'finished',
      createdBy: 'u',
      createdAt: new Date(2026, 9, 2, 20).getTime(),
      split: null,
      summaryError: null,
      summary: {
        outcome: 'outright',
        winnerIds: ['a'],
        pot: 30,
        payouts: {},
        rounds: 4,
        computedAt: 1,
        players: {
          a: { net: 20, position: 1, roundsPlayed: 4, dropsTaken: 0, rejoins: 0, buyIns: 1 },
          b: { net: -10, position: 2, roundsPlayed: 4, dropsTaken: 0, rejoins: 0, buyIns: 1 },
          c: { net: -10, position: 2, roundsPlayed: 4, dropsTaken: 0, rejoins: 0, buyIns: 1 },
        },
      },
    },
  };

  beforeEach(() => {
    batch.set.mockReset();
    batch.commit.mockReset().mockResolvedValue(undefined);
    games = { loading: false, value: [finishedNight] };
  });

  it('writes a paid record for every payment in one batch, as the signed-in member', async () => {
    const user = renderGames();
    await user.click(screen.getByRole('button', { name: 'Mark all paid (2)' }));
    expect(batch.set).toHaveBeenCalledTimes(2);
    const written = batch.set.mock.calls.map(([ref, record]) => [ref.path, record]);
    expect(written.map(([path]) => path).sort()).toEqual([
      'leagues/L1/settled/2026-10-02_b_a_10',
      'leagues/L1/settled/2026-10-02_c_a_10',
    ]);
    for (const [, record] of written) {
      expect(record).toMatchObject({ day: '2026-10-02', amount: 10, by: 'u1', to: 'a' });
    }
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it('says why when the batch cannot be saved', async () => {
    batch.commit.mockRejectedValue(new Error('Missing or insufficient permissions'));
    const user = renderGames();
    await user.click(screen.getByRole('button', { name: 'Mark all paid (2)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Missing or insufficient');
  });
});
