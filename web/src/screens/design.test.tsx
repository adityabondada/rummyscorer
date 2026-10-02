// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_SETTINGS, type GameState, type Round } from '@rummy/engine';
import type { GameDoc, PlayerDoc } from '@rummy/data';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameState } from '../lib/game';
import { SignInArt } from '../SignInArt';
import { EmptyState, SUITS, Suit, SuitRow, SuitSpinner, suitColor } from '../suits';
import { Loading } from '../ui';
import { ScoreBoard } from './game/ScoreBoard';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('suits', () => {
  it('has all four, each drawn once and hidden from screen readers', () => {
    const { container } = render(<SuitRow />);
    const glyphs = [...container.querySelectorAll('svg')];
    expect(glyphs.map((g) => g.getAttribute('data-suit'))).toEqual([
      'spade',
      'heart',
      'diamond',
      'club',
    ]);
    for (const g of glyphs) expect(g).toHaveAttribute('aria-hidden', 'true');
  });

  it('gives each suit its own shape', () => {
    const shapes = SUITS.map((kind) => {
      const { container, unmount } = render(<Suit kind={kind} />);
      const markup = container.querySelector('svg')!.innerHTML;
      unmount();
      return markup;
    });
    expect(new Set(shapes).size).toBe(4);
  });

  it('colours hearts and diamonds red and spades and clubs dark', () => {
    expect(suitColor('heart')).toBe(suitColor('diamond'));
    expect(suitColor('spade')).toBe(suitColor('club'));
    expect(suitColor('heart')).not.toBe(suitColor('spade'));
  });

  it('can be greyed out', () => {
    const { container } = render(<Suit kind="heart" muted />);
    expect(container.querySelector('path')!.getAttribute('fill')).not.toBe(suitColor('heart'));
  });

  it('loading shows the four suits and a status message', () => {
    render(<Loading label="Loading games…" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading games…');
    expect(status.querySelectorAll('svg')).toHaveLength(4);
  });

  it('spinner staggers its four suits so they light up in turn', () => {
    const { container } = render(<SuitSpinner />);
    const delays = [...container.querySelectorAll<HTMLElement>('.suit-spinner-step')].map(
      (s) => s.style.animationDelay,
    );
    expect(new Set(delays).size).toBe(4);
  });

  it('an empty state shows the suits, an inviting heading and one line of help', () => {
    const { container } = render(
      <EmptyState title="Deal the first game">Add your players.</EmptyState>,
    );
    expect(screen.getByRole('heading', { name: 'Deal the first game' })).toBeInTheDocument();
    expect(screen.getByText('Add your players.')).toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(4);
  });
});

describe('sign-in picture', () => {
  it('describes itself and shows one ace of each suit', () => {
    const { container } = render(<SignInArt />);
    expect(screen.getByRole('img', { name: /ace of each suit/i })).toBeInTheDocument();
    expect(container.querySelectorAll('.fan-card')).toHaveLength(4);
  });

  it('spreads the cards to four different places, which is also where they rest with motion off', () => {
    const { container } = render(<SignInArt />);
    const angles = [...container.querySelectorAll<SVGGElement>('.fan-card')].map((g) =>
      g.style.getPropertyValue('--fan'),
    );
    expect(new Set(angles).size).toBe(4);
    expect(angles).toEqual(['-11deg', '-4deg', '4deg', '11deg']);
  });
});

describe('race to the limit', () => {
  const person = (name: string): PlayerDoc => ({
    name,
    linkedUid: null,
    retired: false,
    mergedInto: null,
    createdBy: 'u',
    createdAt: 1,
  });
  const players = { a: person('Asha'), b: person('Bo'), c: person('Cy') };
  const names = { a: 'Asha', b: 'Bo', c: 'Cy' };
  const pts = (points: number) => ({ kind: 'points' as const, points });

  const game = (): GameDoc => ({
    settings: { ...DEFAULT_SETTINGS, limit: 100, maxRoundPenalty: null },
    seatOrder: ['a', 'b', 'c'],
    status: 'inProgress',
    createdBy: 'u',
    createdAt: 1,
    split: null,
    summary: null,
    summaryError: null,
  });

  const stateAfter = (rounds: Round[]): GameState =>
    gameState(
      game(),
      rounds.map((r, i) => ({
        id: `r${i}`,
        doc: {
          seq: r.seq,
          winnerId: r.winnerId,
          entries: r.entries,
          rejoins: [],
          scrapped: null,
          updatedBy: 'u',
          updatedAt: 1,
          history: [],
        },
      })),
      players,
    );

  // Bo on 30, Cy on 90: a safe bar, and one close to the limit.
  const midGame = () =>
    stateAfter([{ seq: 1, winnerId: 'a', entries: { b: pts(30), c: pts(90) } }]);
  // Then Cy takes 15 more and goes out on 105.
  const cyOut = () =>
    stateAfter([
      { seq: 1, winnerId: 'a', entries: { b: pts(30), c: pts(90) } },
      { seq: 2, winnerId: 'a', entries: { b: pts(5), c: pts(15) } },
    ]);

  const row = (name: string) =>
    screen.getByRole('progressbar', { name: `${name}'s score` }).closest('li')!;

  it('draws a bar for every player, with the score and the limit', () => {
    render(<ScoreBoard state={midGame()} names={names} />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    const bo = screen.getByRole('progressbar', { name: "Bo's score" });
    expect(bo).toHaveAttribute('aria-valuenow', '30');
    expect(bo).toHaveAttribute('aria-valuemax', '100');
    expect(bo).toHaveAttribute('aria-valuetext', '30 of 100');
    expect(screen.getByText('Race to the limit')).toBeInTheDocument();
    expect(screen.getByText('Out past 100')).toBeInTheDocument();
  });

  it('says how many points each player has left, and shows their drops', () => {
    render(<ScoreBoard state={midGame()} names={names} />);
    expect(within(row('Bo')).getByText('70 to go')).toBeInTheDocument();
    expect(within(row('Cy')).getByText('10 to go')).toBeInTheDocument();
    expect(within(row('Asha')).getByText('100 to go')).toBeInTheDocument();
    expect(within(row('Bo')).getByText(/Drops 2 of 2 left/)).toBeInTheDocument();
  });

  it('colours the bars by how close each player is, and pulses only the one in danger', () => {
    render(<ScoreBoard state={midGame()} names={names} />);
    expect(row('Asha')).toHaveAttribute('data-tone', 'safe');
    expect(row('Bo')).toHaveAttribute('data-tone', 'safe');
    expect(row('Cy')).toHaveAttribute('data-tone', 'danger');
    const fill = (name: string) =>
      screen.getByRole('progressbar', { name: `${name}'s score` }).firstElementChild!;
    expect(fill('Cy')).toHaveClass('danger-pulse');
    expect(fill('Bo')).not.toHaveClass('danger-pulse');
  });

  it('starts the bars empty and grows them to the right length', async () => {
    render(<ScoreBoard state={midGame()} names={names} />);
    const cy = screen.getByRole('progressbar', { name: "Cy's score" })
      .firstElementChild as HTMLElement;
    await waitFor(() => expect(cy.style.width).toBe('90%'));
    const bo = screen.getByRole('progressbar', { name: "Bo's score" })
      .firstElementChild as HTMLElement;
    expect(bo.style.width).toBe('30%');
  });

  it('shows a player who is out as greyed out, with where they went out', () => {
    render(<ScoreBoard state={cyOut()} names={names} />);
    expect(row('Cy')).toHaveAttribute('data-tone', 'out');
    expect(within(row('Cy')).getByText('Out')).toBeInTheDocument();
    expect(within(row('Cy')).getByText('Went out on 105')).toBeInTheDocument();
    expect(within(row('Cy')).getByText('Out of the game')).toBeInTheDocument();
    const fill = screen.getByRole('progressbar', { name: "Cy's score" }).firstElementChild!;
    expect(fill).not.toHaveClass('danger-pulse');
  });

  it('still marks who deals and who plays first, and the pot', () => {
    render(<ScoreBoard state={midGame()} names={names} />);
    expect(screen.getByText('Deals')).toBeInTheDocument();
    expect(screen.getByText('Plays first')).toBeInTheDocument();
    expect(screen.getByText(/Pot \$30/)).toBeInTheDocument();
  });

  it('shakes a row once when its player goes out, and not on a page that already shows them out', () => {
    vi.useFakeTimers();
    const { rerender } = render(<ScoreBoard state={midGame()} names={names} />);
    expect(row('Cy')).not.toHaveClass('shake-once');

    rerender(<ScoreBoard state={cyOut()} names={names} />);
    expect(row('Cy')).toHaveClass('shake-once');
    expect(row('Bo')).not.toHaveClass('shake-once');

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(row('Cy')).not.toHaveClass('shake-once');

    cleanup();
    render(<ScoreBoard state={cyOut()} names={names} />);
    expect(row('Cy')).not.toHaveClass('shake-once');
  });

  it('says "At the limit" for a player who is exactly on it', () => {
    const state = stateAfter([{ seq: 1, winnerId: 'a', entries: { b: pts(100), c: pts(1) } }]);
    render(<ScoreBoard state={state} names={names} />);
    expect(within(row('Bo')).getByText('At the limit')).toBeInTheDocument();
    expect(within(row('Bo')).queryByText('Out')).not.toBeInTheDocument();
  });
});
