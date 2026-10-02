// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS } from '@rummy/engine';
import type { GameDoc, GameSummaryDoc } from '@rummy/data';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameRow } from '../../lib/night';

const recomputeLeague = vi.fn();
let games: { loading: boolean; value: GameRow[] };

vi.mock('../../api', () => ({ recomputeLeague: (...args: unknown[]) => recomputeLeague(...args) }));
vi.mock('../../hooks', () => ({ useGames: () => games }));
vi.mock('../LeagueLayout', () => ({
  useLeagueContext: () => ({ leagueId: 'L1', names: { a: 'Asha', b: 'Bo' } }),
}));

import { StatsTab } from '../StatsTab';

function game(n: number, winner: string, withRounds: boolean): GameRow {
  const player = (id: string) => ({
    net: id === winner ? 10 : -10,
    position: id === winner ? 1 : 2,
    roundsPlayed: 5,
    dropsTaken: 0,
    rejoins: 0,
    buyIns: 1,
    ...(withRounds ? { roundsWon: id === winner ? 3 : 2, penalties: 0 } : {}),
  });
  const summary: GameSummaryDoc = {
    outcome: 'outright',
    winnerIds: [winner],
    pot: 20,
    payouts: {},
    rounds: 5,
    players: { a: player('a'), b: player('b') },
    computedAt: 1,
  };
  return {
    id: `g${n}`,
    doc: {
      settings: DEFAULT_SETTINGS,
      seatOrder: ['a', 'b'],
      status: 'finished',
      createdBy: 'u',
      createdAt: Date.now() - (10 - n) * 1000,
      split: null,
      summary,
      summaryError: null,
    } as GameDoc,
  };
}

beforeEach(() => {
  recomputeLeague.mockReset().mockResolvedValue({ games: 1, updated: 1 });
  games = { loading: false, value: [game(1, 'a', true), game(2, 'a', true), game(3, 'b', true)] };
});
afterEach(cleanup);

describe('the stats tab', () => {
  it('shows the leaderboard, the streaks and the other stats straight away, with no player to open', () => {
    render(<StatsTab />);
    expect(screen.getByRole('table', { name: 'Leaderboard' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'More stats' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Streaks' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows rounds won and the round win rate for each player', () => {
    render(<StatsTab />);
    const asha = within(screen.getAllByRole('table')[0]!).getByRole('row', { name: /Asha/ });
    // Asha won 3 + 3 + 2 of 15 rounds.
    expect(
      within(asha)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['+$10', '2', '8', '53%']);
  });

  it('has the time ranges All time, This month, This year and Custom', () => {
    render(<StatsTab />);
    const group = screen.getByRole('group', { name: 'Time range' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['All time', 'This month', 'This year', 'Custom']);
  });

  it('has one chart, with a switch between net money, games won and rounds won', async () => {
    const user = userEvent.setup();
    render(<StatsTab />);
    expect(screen.getAllByRole('heading', { name: /over time/ })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Net money over time' })).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Chart' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Net money', 'Games won', 'Rounds won']);
    expect(within(group).getByRole('button', { name: 'Net money' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(group).getByRole('button', { name: 'Rounds won' }));
    expect(screen.getByRole('heading', { name: 'Rounds won over time' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: /over time/ })).toHaveLength(1);
    expect(within(group).getByRole('button', { name: 'Rounds won' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(group).getByRole('button', { name: 'Games won' }));
    expect(screen.getByRole('heading', { name: 'Games won over time' })).toBeInTheDocument();
  });

  it('does not ask for anything to be recalculated when every game has round stats', async () => {
    render(<StatsTab />);
    await new Promise((r) => setTimeout(r, 20));
    expect(recomputeLeague).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('asks once for older games to be recalculated, and says so while it works', async () => {
    games = { loading: false, value: [game(1, 'a', false), game(2, 'b', true)] };
    let finish!: () => void;
    recomputeLeague.mockReturnValue(new Promise<void>((r) => (finish = r)));
    render(<StatsTab />);
    await waitFor(() => expect(recomputeLeague).toHaveBeenCalledWith({ leagueId: 'L1' }));
    expect(screen.getByRole('status')).toHaveTextContent('Working out round stats for older games');
    finish();
    await waitFor(() => expect(recomputeLeague).toHaveBeenCalledTimes(1));
  });

  it('shows a dash for round stats of a game that has none, instead of a made-up zero', () => {
    games = { loading: false, value: [game(1, 'a', false)] };
    recomputeLeague.mockReturnValue(new Promise(() => {}));
    render(<StatsTab />);
    const asha = within(screen.getAllByRole('table')[0]!).getByRole('row', { name: /Asha/ });
    expect(
      within(asha)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['+$10', '1', '–', '–']);
  });

  it('says so when the older games could not be worked out, and does not keep retrying', async () => {
    games = { loading: false, value: [game(1, 'a', false)] };
    recomputeLeague.mockRejectedValue(new Error('offline'));
    render(<StatsTab />);
    expect(await screen.findByRole('status')).toHaveTextContent("couldn't be worked out");
    await new Promise((r) => setTimeout(r, 30));
    expect(recomputeLeague).toHaveBeenCalledTimes(1);
  });

  it('waits for the games to load before asking', () => {
    games = { loading: true, value: [] };
    render(<StatsTab />);
    expect(recomputeLeague).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the empty state before the first finished game', () => {
    games = { loading: false, value: [] };
    render(<StatsTab />);
    expect(screen.getByText('Stats start with the first finished game')).toBeInTheDocument();
    expect(recomputeLeague).not.toHaveBeenCalled();
  });
});
