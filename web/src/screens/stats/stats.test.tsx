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
  }),
  player('b', { net: -10, wins: 1, winRate: 0.25, avgPosition: 2.5, roundsPlayed: 30 }),
  player('c', {
    net: -10,
    wins: 0,
    outrightWins: 0,
    winRate: 0,
    avgPosition: 3.2,
    roundsPlayed: 20,
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

  it('offers every time range, with all time selected to begin with', () => {
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
    await userEvent.setup().click(screen.getByRole('button', { name: 'Last 3 months' }));
    expect(onChange).toHaveBeenCalledWith('3months');
    expect(screen.getByRole('button', { name: 'Last 3 months' })).toHaveAttribute(
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

  it('shows games, wins with shared wins, win rate, average finish and net', () => {
    render(<Leaderboard rows={rows} names={names} />);
    const [leaderboard] = screen.getAllByRole('table');
    const asha = within(leaderboard!).getByRole('row', { name: /Asha/ });
    // Net first, so it stays on screen on a phone; then games, wins, shared wins, rate, finish.
    expect(
      within(asha)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['+$20', '4', '2', '1', '75%', '1.5']);
    expect(screen.getAllByRole('columnheader')[1]).toHaveTextContent('Net');
    expect(
      within(within(leaderboard!).getByRole('row', { name: /Bo/ })).getByText('−$10'),
    ).toBeInTheDocument();
  });

  it('re-sorts when a heading is clicked, and best average finish is the lowest number', async () => {
    render(<Leaderboard rows={rows} names={names} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Avg finish/ }));
    expect(bodyNames()).toEqual(['Asha', 'Bo', 'Cy']);
    await user.click(screen.getByRole('button', { name: /Win rate/ }));
    expect(bodyNames()).toEqual(['Asha', 'Bo', 'Cy']);
    expect(screen.getAllByRole('columnheader', { name: /Win rate/ })[0]).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(screen.getAllByRole('columnheader', { name: /Avg finish/ })[0]).toHaveAttribute(
      'aria-sort',
      'none',
    );
  });

  it('breaks ties by name', () => {
    render(<Leaderboard rows={rows} names={names} />);
    // Bo and Cy are both on -$10.
    expect(bodyNames()).toEqual(['Asha', 'Bo', 'Cy']);
  });

  it('has a separate table for rounds survived, drops used and rejoins', async () => {
    render(<Leaderboard rows={rows} names={names} />);
    const [, gameStats] = screen.getAllByRole('table');
    expect(within(gameStats!).getByRole('button', { name: /Rounds survived/ })).toBeInTheDocument();
    expect(within(gameStats!).getByRole('button', { name: /Drops used/ })).toBeInTheDocument();
    expect(within(gameStats!).getByRole('button', { name: /Rejoins/ })).toBeInTheDocument();
    // Starts sorted by rounds survived, most first: Bo 30, Cy 20, Asha 10.
    expect(gameStats!.querySelectorAll('tbody th')[0]!.textContent).toBe('Bo');
  });

  it('shows every player once, even with no wins', () => {
    render(<Leaderboard rows={rows} names={names} />);
    expect(screen.getAllByRole('row', { name: /Cy/ })).toHaveLength(2);
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
    },
    {
      game: 2,
      gameId: 'g2',
      at: new Date(2026, 8, 10).getTime(),
      net: { a: 10, b: 0, c: 5 },
      wins: { a: 1, b: 1, c: 0 },
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

  it('keeps eight distinct colours in a fixed order', () => {
    expect(SERIES_COLORS).toHaveLength(8);
    expect(new Set(SERIES_COLORS).size).toBe(8);
  });
});
