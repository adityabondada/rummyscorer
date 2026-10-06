// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS, displayOrder, replay, type GameState, type Round } from '@rummy/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RejoinModal } from './Modals';
import { ResultCard } from './ResultCard';
import { RoundEntry } from './RoundEntry';
import { ScoreBoard } from './ScoreBoard';

afterEach(cleanup);

const names = { a: 'Asha', b: 'Bo', c: 'Cy', d: 'Dev', e: 'Eli' };
const pts = (points: number) => ({ kind: 'points' as const, points });

/** The seat order for a line-up set up as people do: first card at the top, dealer at the bottom. */
const seatsFor = (lineUp: string[]) => [lineUp.at(-1)!, ...lineUp.slice(0, -1)];
const play = (lineUp: string[], rounds: Round[] = [], limit = 50): GameState =>
  replay({
    settings: { ...DEFAULT_SETTINGS, limit, maxRoundPenalty: null },
    seatOrder: seatsFor(lineUp),
    rounds,
  });

/** The names of the players shown, top to bottom, among the named ones. */
const shown = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('li'))
    .map((li) => Object.values(names).find((n) => li.textContent?.startsWith(n)))
    .filter(Boolean);

describe('the order players are listed in on the game screen', () => {
  it('shows the scoreboard in the order the table was set up in, not the dealer first', () => {
    const state = play(['a', 'b', 'c', 'd']);
    const { container } = render(<ScoreBoard state={state} names={names} />);
    // Dev deals round 1 but is last in the list that was set up.
    expect(state.dealerId).toBe('d');
    expect(shown(container)).toEqual(['Asha', 'Bo', 'Cy', 'Dev']);
  });

  it('keeps that order as the deal moves on', () => {
    const state = play(
      ['a', 'b', 'c', 'd'],
      [
        { seq: 1, winnerId: 'a', entries: { b: pts(5), c: pts(5), d: pts(5) } },
        { seq: 2, winnerId: 'b', entries: { a: pts(5), c: pts(5), d: pts(5) } },
      ],
    );
    expect(state.dealerId).toBe('b');
    const { container } = render(<ScoreBoard state={state} names={names} />);
    expect(shown(container)).toEqual(['Asha', 'Bo', 'Cy', 'Dev']);
  });

  it('lists the players in the round entry in that order too', () => {
    const state = play(['a', 'b', 'c', 'd']);
    const { container } = render(
      <RoundEntry
        state={state}
        names={names}
        title="Round 1"
        seq={1}
        submitLabel="Save round"
        onSubmit={vi.fn()}
        onClose={() => {}}
      />,
    );
    expect(shown(container.ownerDocument.body)).toEqual(['Asha', 'Bo', 'Cy', 'Dev']);
    expect(screen.getByText(/Players are in the order you set/)).toBeInTheDocument();
  });

  it('leaves players who are out out of the round entry, in the same order for the rest', () => {
    const state = play(
      ['a', 'b', 'c', 'd'],
      [{ seq: 1, winnerId: 'a', entries: { b: pts(5), c: pts(60), d: pts(5) } }],
    );
    const { container } = render(
      <RoundEntry
        state={state}
        names={names}
        title="Round 2"
        seq={2}
        submitLabel="Save round"
        onSubmit={vi.fn()}
        onClose={() => {}}
      />,
    );
    expect(shown(container.ownerDocument.body)).toEqual(['Asha', 'Bo', 'Dev']);
  });

  it('breaks a tie on the result card by that order', () => {
    const state = play(
      ['a', 'b', 'c'],
      [{ seq: 1, winnerId: 'a', entries: { b: pts(60), c: pts(60) } }],
    );
    const { container } = render(<ResultCard state={state} names={names} />);
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
      tr.textContent?.slice(0, 2),
    );
    expect(rows[0]).toBe('As');
  });
});

describe('choosing where someone sits when they rejoin', () => {
  // Line-up Asha, Bo, Cy, Dev, Eli. Cy and Eli are out, and Cy is about to rejoin.
  const out = () =>
    play(
      ['a', 'b', 'c', 'd', 'e'],
      [{ seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(60), d: pts(10), e: pts(60) } }],
    );

  function open(onConfirm = vi.fn().mockResolvedValue(null)) {
    render(
      <RejoinModal
        state={out()}
        playerId="c"
        names={names}
        entryScore={11}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    return { onConfirm, user: userEvent.setup() };
  }
  const list = () => within(screen.getByRole('list', { name: 'Seating order' }));

  it('lists only the players still in the game, not the ones who are out', () => {
    open();
    const players = list()
      .getAllByRole('listitem')
      .map((li) => li.textContent)
      .filter((t) => t && !/Sit |sits/.test(t));
    expect(players.map((t) => t!.replace(/ · deals next/, ''))).toEqual(['Asha', 'Bo', 'Dev']);
    expect(screen.queryByText('Eli')).not.toBeInTheDocument();
  });

  it('lists them in the order the table was set up in, with a place between each and at the end', () => {
    open();
    const items = list()
      .getAllByRole('listitem')
      .map((li) => li.textContent!.replace(/ · deals next/, ''));
    expect(items).toEqual([
      'Sit here',
      'Asha',
      'Sit here',
      'Bo',
      'Sit here',
      'Dev',
      'Cy sits here',
    ]);
  });

  it('starts with them sitting last, and says so', () => {
    open();
    expect(screen.getByRole('button', { name: 'Sit after Dev' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Cy sits here')).toBeInTheDocument();
  });

  it('says who deals next, and how the deal goes', () => {
    open();
    expect(screen.getByText(/deals next/)).toBeInTheDocument();
    expect(
      screen.getByText(/The deal goes down this list and back to the top/),
    ).toBeInTheDocument();
  });

  it('moves the marker to the place tapped', async () => {
    const { user } = open();
    await user.click(screen.getByRole('button', { name: 'Sit before Bo' }));
    expect(screen.getByRole('button', { name: 'Sit before Bo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Sit after Dev' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getAllByText('Cy sits here')).toHaveLength(1);
  });

  it.each([
    ['Sit before Asha', 'a'],
    ['Sit before Bo', 'b'],
    ['Sit before Dev', 'd'],
    ['Sit after Dev', 'a'],
  ])('puts them where the tapped place says: %s (deals before %s)', async (label, expected) => {
    const onConfirm = vi.fn().mockResolvedValue(null);
    const { user } = open(onConfirm);
    await user.click(screen.getByRole('button', { name: label }));
    await user.click(screen.getByRole('button', { name: 'Rejoin for $10' }));
    const seat = onConfirm.mock.calls[0]![0] as number;

    // Run it through the engine, and see the table shown in that place.
    const next = replay({
      settings: { ...DEFAULT_SETTINGS, limit: 50, maxRoundPenalty: null },
      seatOrder: seatsFor(['a', 'b', 'c', 'd', 'e']),
      rounds: [
        {
          seq: 1,
          winnerId: 'a',
          entries: { b: pts(10), c: pts(60), d: pts(10), e: pts(60) },
          rejoins: [{ playerId: 'c', seatIndex: seat }],
        },
      ],
    });
    // The deal wraps, so what matters is who sits after whom, round the table.
    const circle = displayOrder(next).filter((id) => next.players[id]!.active);
    const after = (id: string) => circle[(circle.indexOf(id) + 1) % circle.length];
    expect(circle).toHaveLength(4);
    expect(after('c')).toBe(expected);
  });

  it('shows a lone place to sit when nobody else is in the game yet', () => {
    const only = replay({
      settings: { ...DEFAULT_SETTINGS, limit: 50, maxRoundPenalty: null },
      seatOrder: seatsFor(['a', 'b']),
      rounds: [{ seq: 1, winnerId: 'a', entries: { b: pts(60) } }],
    });
    // The game ended, but the modal must still not break with a single player left.
    render(
      <RejoinModal
        state={only}
        playerId="b"
        names={names}
        entryScore={1}
        onConfirm={vi.fn()}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Sit after Asha' })).toBeInTheDocument();
  });
});
