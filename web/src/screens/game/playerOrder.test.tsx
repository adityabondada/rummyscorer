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
  // Line-up Asha, Bo, Cy, Dev, Eli. Eli dealt round 1, so Asha deals next and Bo is due the
  // opening card. Cy and Eli are out, and Cy is about to rejoin.
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
  const spot = (name: string) => screen.getByRole('button', { name });

  it('lists only the players still in the game, in the order the table was set up in', () => {
    open();
    const players = list()
      .getAllByRole('listitem')
      .filter((li) => !li.querySelector('button'))
      .map((li) => li.querySelector('.font-medium')?.textContent);
    expect(players).toEqual(['Asha', 'Bo', 'Dev']);
    expect(screen.queryByText('Eli')).not.toBeInTheDocument();
  });

  it('says who deals next and who gets the opening card', () => {
    open();
    expect(list().getByText(/deals next/)).toBeInTheDocument();
    expect(list().getByText(/opening card/)).toBeInTheDocument();
    expect(
      screen.getByText(/The deal goes down this list and back to the top/),
    ).toBeInTheDocument();
  });

  it('does not allow a place that would change who deals next or who gets the opening card', () => {
    open();
    // Before Asha (the dealer) and before Bo (the opening card), and the wrap after Dev.
    expect(spot('Sit before Asha')).toBeDisabled();
    expect(spot('Sit before Bo')).toBeDisabled();
    expect(spot('Sit after Dev')).toBeDisabled();
    expect(spot('Sit before Dev')).toBeEnabled();
  });

  it('starts at the first place that is allowed, and says so', () => {
    open();
    expect(spot('Sit before Dev')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Cy sits here')).toBeInTheDocument();
  });

  it('puts them in the place chosen without changing who deals or opens', async () => {
    const onConfirm = vi.fn().mockResolvedValue(null);
    const { user } = open(onConfirm);
    await user.click(screen.getByRole('button', { name: 'Rejoin for $10' }));
    const seat = onConfirm.mock.calls[0]![0] as number;

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
    expect(next.dealerId).toBe('a');
    expect(next.firstPlayerId).toBe('b');
    // Cy sits just before Dev, and Dev is still before Asha, round the table.
    const circle = displayOrder(next).filter((id) => next.players[id]!.active);
    expect(circle).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the deal the same wherever they sit, among the allowed places', async () => {
    // Only one place is open here, so check the rule through the engine for every place.
    const results = [0, 1, 2, 3, 4].map((seatIndex) =>
      replay({
        settings: { ...DEFAULT_SETTINGS, limit: 50, maxRoundPenalty: null },
        seatOrder: seatsFor(['a', 'b', 'c', 'd', 'e']),
        rounds: [
          {
            seq: 1,
            winnerId: 'a',
            entries: { b: pts(10), c: pts(60), d: pts(10), e: pts(60) },
            rejoins: [{ playerId: 'c', seatIndex }],
          },
        ],
      }),
    );
    const keeps = results.map((s) => s.dealerId === 'a' && s.firstPlayerId === 'b');
    // Seats are among [e, a, b, d]. Seat 1 puts Cy before Asha and seat 2 between Asha and Bo,
    // so both change the deal. Seats 0, 3 and 4 are all between Dev and Asha, or before Dev.
    expect(keeps).toEqual([true, false, false, true, true]);
  });

  it('lets them sit anywhere when so few are left that every place changes the deal', async () => {
    const only = replay({
      settings: { ...DEFAULT_SETTINGS, limit: 50, maxRoundPenalty: null },
      seatOrder: seatsFor(['a', 'b', 'c']),
      rounds: [{ seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(60) } }],
    });
    render(
      <RejoinModal
        state={only}
        playerId="c"
        names={names}
        entryScore={11}
        onConfirm={vi.fn().mockResolvedValue(null)}
        onClose={() => {}}
      />,
    );
    expect(spot('Sit before Asha')).toBeEnabled();
    expect(spot('Sit after Bo')).toBeEnabled();
  });
});
