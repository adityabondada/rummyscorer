// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS, replay, type GameState, type Round } from '@rummy/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScoreBoard } from './ScoreBoard';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const names = { a: 'Asha', b: 'Bo', c: 'Cy' };
const pts = (points: number) => ({ kind: 'points' as const, points });
const play = (rounds: Round[], settings = {}): GameState =>
  replay({
    settings: { ...DEFAULT_SETTINGS, limit: 101, maxRoundPenalty: 80, ...settings },
    seatOrder: ['c', 'a', 'b'],
    rounds,
  });

const r1: Round = { seq: 1, winnerId: 'a', entries: { b: pts(20), c: pts(80) } };
const r2: Round = { seq: 2, winnerId: 'a', entries: { b: pts(10), c: pts(30) } };
const rejoin: Round = { ...r2, rejoins: [{ playerId: 'c', seatIndex: 1 }] };
const row = (name: string) => screen.getByText(name).closest('li')!;

describe('moments on the score board', () => {
  it('does not replay old news when a game is opened', () => {
    render(<ScoreBoard state={play([r1, r2])} names={names} />);
    expect(document.querySelector('[data-moment]')).toBeNull();
  });

  it('slams a full count when a round is saved, to that player only, then settles', () => {
    const { rerender } = render(<ScoreBoard state={play([])} names={names} />);
    rerender(<ScoreBoard state={play([r1])} names={names} />);
    expect(row('Cy')).toHaveAttribute('data-moment', 'slam');
    expect(row('Cy').querySelector('.slam-number')).toHaveTextContent('80');
    expect(row('Bo')).not.toHaveAttribute('data-moment');
    expect(row('Asha')).not.toHaveAttribute('data-moment');

    act(() => void vi.advanceTimersByTime(2400));
    expect(document.querySelector('[data-moment]')).toBeNull();
  });

  it('does not slam anything short of a full count', () => {
    const { rerender } = render(<ScoreBoard state={play([])} names={names} />);
    rerender(
      <ScoreBoard
        state={play([{ seq: 1, winnerId: 'a', entries: { b: pts(79), c: pts(20) } }])}
        names={names}
      />,
    );
    expect(document.querySelector('[data-moment]')).toBeNull();
  });

  it('counts the game cap as the full count when it is lower than 80', () => {
    const { rerender } = render(
      <ScoreBoard state={play([], { maxRoundPenalty: 40 })} names={names} />,
    );
    rerender(
      <ScoreBoard
        state={play([{ seq: 1, winnerId: 'a', entries: { b: pts(40), c: pts(20) } }], {
          maxRoundPenalty: 40,
        })}
        names={names}
      />,
    );
    expect(row('Bo')).toHaveAttribute('data-moment', 'slam');
  });

  it('counts 80 as a full count when the game has no cap', () => {
    const { rerender } = render(
      <ScoreBoard state={play([], { maxRoundPenalty: null })} names={names} />,
    );
    rerender(<ScoreBoard state={play([r1], { maxRoundPenalty: null })} names={names} />);
    expect(row('Cy')).toHaveAttribute('data-moment', 'slam');
  });

  it('stamps a player who has just gone out', () => {
    const { rerender } = render(<ScoreBoard state={play([r1])} names={names} />);
    act(() => void vi.advanceTimersByTime(2400));
    rerender(<ScoreBoard state={play([r1, r2])} names={names} />);
    expect(row('Cy')).toHaveAttribute('data-moment', 'out');
    expect(row('Cy').querySelector('.fx-stamp')).toHaveTextContent('Out');
    expect(row('Bo')).not.toHaveAttribute('data-moment');

    act(() => void vi.advanceTimersByTime(2400));
    expect(row('Cy')).not.toHaveAttribute('data-moment');
    expect(row('Cy').querySelector('.fx-stamp')).toBeNull();
  });

  it('shows both when the round that puts someone out is also a full count', () => {
    const { rerender } = render(<ScoreBoard state={play([r1])} names={names} />);
    act(() => void vi.advanceTimersByTime(2400));
    rerender(
      <ScoreBoard
        state={play([r1, { seq: 2, winnerId: 'a', entries: { b: pts(5), c: pts(80) } }])}
        names={names}
      />,
    );
    expect(row('Cy').getAttribute('data-moment')!.split(' ').sort()).toEqual(['out', 'slam']);
  });

  it('welcomes back a player who rejoins', () => {
    const { rerender } = render(<ScoreBoard state={play([r1, { ...r2 }])} names={names} />);
    act(() => void vi.advanceTimersByTime(2400));
    rerender(<ScoreBoard state={play([r1, rejoin])} names={names} />);
    expect(row('Cy')).toHaveAttribute('data-moment', 'back');
    expect(row('Bo')).not.toHaveAttribute('data-moment');

    act(() => void vi.advanceTimersByTime(2400));
    // The badge that stays is the plain one.
    expect(screen.getByText('Rejoined')).toBeInTheDocument();
  });

  it('does nothing for a round that is scrapped away', () => {
    const { rerender } = render(<ScoreBoard state={play([r1])} names={names} />);
    act(() => void vi.advanceTimersByTime(2400));
    rerender(<ScoreBoard state={play([])} names={names} />);
    expect(document.querySelector('[data-moment]')).toBeNull();
  });
});
