// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PRESETS,
  type CustomDates,
  type Preset,
  type PlayerStats,
  type TrendPoint,
} from '../../lib/stats';
import { FilterBar } from './FilterBar';
import { Leaderboard } from './Leaderboard';
import { SERIES_COLORS, TrendChart } from './TrendChart';

afterEach(cleanup);

const names = { a: 'Asha', b: 'Bo', c: 'Cy' };

const player = (id: string, over: Partial<PlayerStats>): PlayerStats => ({
  id,
  games: 4,
  outrightWins: 1,
  sharedWins: 0,
  wins: 1,
  winRate: 0.25,
  avgPosition: 2.5,
  net: 0,
  roundsPlayed: 12,
  dropsTaken: 3,
  rejoins: 1,
  roundsWon: 4,
  roundsWithData: 12,
  roundWinRate: 1 / 3,
  penalties: 1,
  bestStreak: 1,
  currentStreak: 0,
  ...over,
});

const rows = [
  player('a', {
    net: 20,
    wins: 3,
    outrightWins: 2,
    sharedWins: 1,
    winRate: 0.75,
    avgPosition: 1.5,
    roundsPlayed: 10,
    roundsWon: 8,
    roundsWithData: 10,
    roundWinRate: 0.8,
    penalties: 0,
    bestStreak: 3,
    currentStreak: 2,
  }),
  player('b', { net: -10, wins: 1, winRate: 0.25, avgPosition: 2.5, roundsPlayed: 30 }),
  player('c', {
    net: -10,
    wins: 0,
    outrightWins: 0,
    winRate: 0,
    avgPosition: 3.2,
    roundsPlayed: 20,
    roundsWon: 0,
    roundWinRate: 0,
    penalties: 2,
    bestStreak: 0,
  }),
];

const bodyNames = () =>
  Array.from(screen.getAllByRole('table')[0]!.querySelectorAll('tbody th')).map(
    (th) => th.textContent,
  );

describe('FilterBar', () => {
  function Harness({ onChange = () => {} }: { onChange?: (p: Preset) => void }) {
    const [preset, setPreset] = useState<Preset>('all');
    const [custom, setCustom] = useState<CustomDates>({ from: '', to: '' });
    return (
      <FilterBar
        preset={preset}
        custom={custom}
        backwards={custom.from !== '' && custom.to !== '' && custom.from > custom.to}
        onPreset={(p) => {
          setPreset(p);
          onChange(p);
        }}
        onCustom={setCustom}
      />
    );
  }

  it('offers all time, this month, this year and a custom range', () => {
    render(<Harness />);
    expect(PRESETS.map((p) => p.label)).toEqual(['All time', 'This month', 'This year', 'Custom']);
    expect(screen.queryByRole('button', { name: 'Last 3 months' })).not.toBeInTheDocument();
  });

  it('starts with all time selected', () => {
    render(<Harness />);
    for (const p of PRESETS)
      expect(screen.getByRole('button', { name: p.label })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All time' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('switches range', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'This year' }));
    expect(onChange).toHaveBeenCalledWith('year');
    expect(screen.getByRole('button', { name: 'This year' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'All time' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows date boxes only for a custom range', async () => {
    render(<Harness />);
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });

  it('warns when the end date is before the start', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    await user.type(screen.getByLabelText('From'), '2026-10-05');
    await user.type(screen.getByLabelText('To'), '2026-10-01');
    expect(await screen.findByRole('alert')).toHaveTextContent('before the start');
  });
});

describe('Leaderboard', () => {
  it('lists the players best net first by default', () => {
    render(<Leaderboard rows={rows} names={names} />);
    expect(bodyNames()[0]).toBe('Asha');
  });

  it('shows net, games won with the shared ones, rounds won and the round win rate', () => {
    render(<Leaderboard rows={rows} names={names} />);
    const [leaderboard] = screen.getAllByRole('table');
    const asha = within(leaderboard!).getByRole('row', { name: /Asha/ });
    // Net first, so it stays on screen on a phone.
    expect(
      within(asha)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['+$20', '3 (1 shared)', '8', '80%']);
    expect(
      within(leaderboard!)
        .getAllByRole('columnheader')
        .map((h) => h.textContent?.replace(/[↑↓]/g, '').trim()),
    ).toEqual(['Player', 'Net', 'Games won', 'Rounds won', 'Round win %']);
    expect(
      within(within(leaderboard!).getByRole('row', { name: /Bo/ })).getByText('−$10'),
    ).toBeInTheDocument();
  });

  it('shows games won with no brackets when none were shared', () => {
    render(<Leaderboard rows={rows} names={names} />);
    const bo = within(screen.getAllByRole('table')[0]!).getByRole('row', { name: /Bo/ });
    expect(within(bo).getAllByRole('cell')[1]).toHaveTextContent(/^1$/);
  });

  it('shows a dash for round stats when the games have none yet', () => {
    const older = player('a', { roundsWon: 0, roundsWithData: 0, roundWinRate: 0 });
    render(<Leaderboard rows={[older]} names={names} />);
    const cells = within(screen.getAllByRole('table')[0]!)
      .getAllByRole('cell')
      .map((c) => c.textContent);
    expect(cells.slice(2)).toEqual(['–', '–']);
  });

  it('re-sorts when a heading is clicked, and best average finish is the lowest number', async () => {
    render(<Leaderboard rows={rows} names={names} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Avg finish/ }));
    expect(
      Array.from(screen.getAllByRole('table')[1]!.querySelectorAll('tbody th')).map(
        (th) => th.textContent,
      ),
    ).toEqual(['Asha', 'Bo', 'Cy']);
    await user.click(screen.getByRole('button', { name: /Round win %/ }));
    expect(bodyNames()).toEqual(['Asha', 'Bo', 'Cy']);
    expect(screen.getAllByRole('columnheader', { name: /Round win %/ })[0]).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(screen.getAllByRole('columnheader', { name: /Avg finish/ })[0]).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('breaks ties by name', () => {
    render(<Leaderboard rows={rows} names={names} />);
    // Bo and Cy are both on -$10.
    expect(bodyNames()).toEqual(['Asha', 'Bo', 'Cy']);
  });

  it('has a second table with games, average finish, best streak, penalties, drops and rejoins, shown straight away', () => {
    render(<Leaderboard rows={rows} names={names} />);
    const [, more] = screen.getAllByRole('table');
    expect(within(more!).getByText('More stats')).toBeInTheDocument();
    for (const label of [
      /Games$/,
      /Avg finish/,
      /Best streak/,
      /Penalties/,
      /Drops used/,
      /Rejoins/,
    ]) {
      expect(within(more!).getByRole('button', { name: label })).toBeInTheDocument();
    }
    const asha = within(more!).getByRole('row', { name: /Asha/ });
    expect(
      within(asha)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['4', '1.5', '3', '0', '3', '1']);
  });

  it('does not make anyone drill into a player: no links, no buttons on names, no details', () => {
    render(<Leaderboard rows={rows} names={names} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Asha/ })).not.toBeInTheDocument();
    expect(document.querySelector('details')).toBeNull();
  });

  it('shows every player once, even with no wins', () => {
    render(<Leaderboard rows={rows} names={names} />);
    expect(screen.getAllByRole('row', { name: /Cy/ })).toHaveLength(2);
  });
});

describe('streaks', () => {
  it('names the longest run and who is on a run now', () => {
    render(<Leaderboard rows={rows} names={names} />);
    const card = screen.getByRole('heading', { name: 'Streaks' }).closest('section')!;
    expect(card).toHaveTextContent('Longest: Asha, 3 games won in a row');
    expect(card).toHaveTextContent('On a streak now: Asha, 2 games won in a row');
  });

  it('shares a streak between players on the same run', () => {
    const tied = [
      player('a', { bestStreak: 3, currentStreak: 3 }),
      player('b', { bestStreak: 3, currentStreak: 3 }),
      player('c', { bestStreak: 1 }),
    ];
    render(<Leaderboard rows={tied} names={names} />);
    const card = screen.getByRole('heading', { name: 'Streaks' }).closest('section')!;
    expect(card).toHaveTextContent('Longest: Asha and Bo, 3 games won in a row each');
    expect(card).toHaveTextContent('On a streak now: Asha and Bo, 3 games won in a row each');
  });

  it('leaves out the current streak when nobody is on one', () => {
    render(<Leaderboard rows={[player('a', { bestStreak: 4, currentStreak: 0 })]} names={names} />);
    const card = screen.getByRole('heading', { name: 'Streaks' }).closest('section')!;
    expect(card).toHaveTextContent('Longest: Asha, 4 games won in a row');
    expect(card).not.toHaveTextContent('On a streak now');
  });

  it('is not shown when nobody has won two games in a row', () => {
    render(<Leaderboard rows={[player('a', { bestStreak: 1, currentStreak: 1 })]} names={names} />);
    expect(screen.queryByRole('heading', { name: 'Streaks' })).not.toBeInTheDocument();
  });
});

describe('TrendChart', () => {
  const points: TrendPoint[] = [
    {
      game: 1,
      gameId: 'g1',
      at: new Date(2026, 8, 3).getTime(),
      net: { a: 20, b: -10 },
      wins: { a: 1, b: 0 },
      roundWins: { a: 3, b: 1 },
    },
    {
      game: 2,
      gameId: 'g2',
      at: new Date(2026, 8, 10).getTime(),
      net: { a: 10, b: 0, c: 5 },
      wins: { a: 1, b: 1, c: 0 },
      roundWins: { a: 5, b: 4, c: 0 },
    },
  ];
  const series = [
    { id: 'a', name: 'Asha', slot: 0 },
    { id: 'b', name: 'Bo', slot: 1 },
    { id: 'c', name: 'Cy', slot: 2 },
  ];

  it('names the chart and says what it shows', () => {
    render(
      <TrendChart
        title="Net money over time"
        description="Running totals."
        metric="net"
        points={points}
        series={series}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Net money over time' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Net money over time/ })).toBeInTheDocument();
  });

  it('has a legend for more than one player, each with its own colour', () => {
    render(<TrendChart title="T" description="d" metric="net" points={points} series={series} />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Asha', 'Bo', 'Cy']);
    const swatches = legend.querySelectorAll('span[aria-hidden]');
    expect([...swatches].map((s) => (s as HTMLElement).style.backgroundColor)).toHaveLength(3);
  });

  it('has no legend for a single player', () => {
    render(
      <TrendChart title="T" description="d" metric="net" points={points} series={[series[0]!]} />,
    );
    expect(screen.queryByRole('list', { name: 'Legend' })).not.toBeInTheDocument();
  });

  it("offers the numbers as a table, with a dash before someone's first game", async () => {
    render(
      <TrendChart
        title="Net money over time"
        description="d"
        metric="net"
        points={points}
        series={series}
      />,
    );
    await userEvent.setup().click(screen.getByText('Show as a table'));
    const table = screen.getByRole('table', { name: 'Net money over time' });
    const body = table.querySelectorAll('tbody tr');
    expect(body).toHaveLength(2);
    expect(body[0]!.textContent).toContain('+$20');
    expect(body[0]!.textContent).toContain('–');
    expect(body[1]!.textContent).toContain('+$5');
  });

  it('formats wins as plain counts and net as money', async () => {
    const user = userEvent.setup();
    render(
      <TrendChart title="Wins" description="d" metric="wins" points={points} series={series} />,
    );
    await user.click(screen.getByText('Show as a table'));
    expect(screen.getByRole('table', { name: 'Wins' }).textContent).not.toContain('$');
  });

  it('shows rounds won as plain counts, in the table too', async () => {
    const user = userEvent.setup();
    render(
      <TrendChart
        title="Rounds"
        description="d"
        metric="roundWins"
        points={points}
        series={series}
      />,
    );
    await user.click(screen.getByText('Show as a table'));
    const table = screen.getByRole('table', { name: 'Rounds' });
    expect(table.textContent).not.toContain('$');
    const [first, second] = table.querySelectorAll('tbody tr');
    expect(first!.textContent).toContain('3');
    expect(second!.textContent).toContain('5');
  });

  it('keeps eight distinct colours in a fixed order', () => {
    expect(SERIES_COLORS).toHaveLength(8);
    expect(new Set(SERIES_COLORS).size).toBe(8);
  });
});
