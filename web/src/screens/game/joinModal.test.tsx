// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS, replay, type GameState } from '@rummy/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JoinModal } from './Modals';
import { ScoreBoard } from './ScoreBoard';

afterEach(cleanup);

const names = { a: 'Asha', b: 'Bo', c: 'Cy', d: 'Dev', e: 'Eli' };
const pts = (points: number) => ({ kind: 'points' as const, points });
const settings = { ...DEFAULT_SETTINGS, limit: 101, maxRoundPenalty: null, buyIn: 10, maxDrops: 2 };

/** Line-up Asha, Bo, Cy: Cy deals round 1, so Asha deals round 2 and Bo gets the opening card. */
const state = (): GameState =>
  replay({
    settings,
    seatOrder: ['c', 'a', 'b'],
    rounds: [{ seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(30) } }],
  });

const candidates = [
  { id: 'd', name: 'Dev' },
  { id: 'e', name: 'Eli' },
];

function open(over: Partial<Parameters<typeof JoinModal>[0]> = {}) {
  const onConfirm = vi.fn().mockResolvedValue(null);
  const onAddGuest = vi.fn().mockResolvedValue(null);
  render(
    <JoinModal
      state={state()}
      names={names}
      candidates={candidates}
      entryScore={31}
      onConfirm={onConfirm}
      onAddGuest={onAddGuest}
      onClose={() => {}}
      {...over}
    />,
  );
  return { onConfirm, onAddGuest, user: userEvent.setup() };
}

describe('adding players mid-game', () => {
  it('says what it costs, where they sit and that the dealer and opening card do not change', () => {
    open();
    const text = screen.getByText(/buy-in/).textContent!;
    expect(text).toContain('$10');
    expect(text).toContain('31');
    expect(text).toMatch(/just before Asha/);
    expect(text).toMatch(/Asha still deals/);
    expect(text).toMatch(/Bo still gets the opening card/);
  });

  it('offers the players who are not in the game, and needs a pick before it can be saved', () => {
    open();
    expect(screen.getAllByRole('checkbox').map((c) => c.closest('li')!.textContent)).toEqual([
      'Dev',
      'Eli',
    ]);
    expect(screen.getByRole('button', { name: 'Pick who to add' })).toBeDisabled();
  });

  it('starts each pick with all the drops, and lets the drops be chosen per player', async () => {
    const { onConfirm, user } = open();
    await user.click(screen.getByRole('checkbox', { name: 'Dev' }));
    await user.click(screen.getByRole('checkbox', { name: 'Eli' }));
    const dev = screen.getByLabelText('Drops for Dev') as HTMLSelectElement;
    expect(dev.value).toBe('2');
    expect(
      within(dev)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['0', '1', '2']);
    await user.selectOptions(screen.getByLabelText('Drops for Eli'), '0');
    expect(screen.getByRole('button', { name: 'Add 2 for $20' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Add 2 for $20' }));
    expect(onConfirm).toHaveBeenCalledWith([
      { playerId: 'd', drops: 2 },
      { playerId: 'e', drops: 0 },
    ]);
  });

  it('lets a pick be taken back', async () => {
    const { user } = open();
    await user.click(screen.getByRole('checkbox', { name: 'Dev' }));
    expect(screen.getByRole('button', { name: 'Add 1 for $10' })).toBeEnabled();
    await user.click(screen.getByRole('checkbox', { name: 'Dev' }));
    expect(screen.getByRole('button', { name: 'Pick who to add' })).toBeDisabled();
    expect(screen.queryByLabelText('Drops for Dev')).toBeNull();
  });

  it('shows why when saving fails, and lets them try again', async () => {
    const onConfirm = vi.fn().mockResolvedValue('Joining is closed');
    const { user } = open({ onConfirm });
    await user.click(screen.getByRole('checkbox', { name: 'Dev' }));
    await user.click(screen.getByRole('button', { name: /Add 1/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Joining is closed');
    expect(screen.getByRole('button', { name: /Add 1/ })).toBeEnabled();
  });

  it('adds someone new to the league on the spot, and shows a refusal', async () => {
    const onAddGuest = vi
      .fn()
      .mockResolvedValueOnce('Dev is already in this league.')
      .mockResolvedValue(null);
    const { user } = open({ onAddGuest });
    const field = screen.getByLabelText('Someone new?');
    expect(screen.getByRole('button', { name: 'Add to league' })).toBeDisabled();
    await user.type(field, 'Dev');
    await user.click(screen.getByRole('button', { name: 'Add to league' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already in this league');
    await user.clear(field);
    await user.type(field, 'Fay');
    await user.click(screen.getByRole('button', { name: 'Add to league' }));
    expect(onAddGuest).toHaveBeenLastCalledWith('Fay');
    expect(screen.queryByRole('alert')).toBeNull();
    expect((field as HTMLInputElement).value).toBe('');
  });

  it('says so when everyone in the league is already playing', () => {
    open({ candidates: [] });
    expect(screen.getByText(/already in this game/)).toBeInTheDocument();
  });
});

describe('the score board after someone joined', () => {
  it('shows them in the race, marked with the round they joined after', () => {
    const joined = replay({
      settings,
      seatOrder: ['c', 'a', 'b'],
      rounds: [
        {
          seq: 1,
          winnerId: 'a',
          entries: { b: pts(10), c: pts(30) },
          rejoins: [{ playerId: 'd', seatIndex: -1, join: { drops: 1 } }],
        },
      ],
    });
    render(<ScoreBoard state={joined} names={names} />);
    const row = screen.getByText('Dev').closest('li')!;
    expect(within(row).getByText('Joined after round 1')).toBeInTheDocument();
    expect(within(row).getByText('31')).toBeInTheDocument();
    expect(within(row).getByText(/Drops 1 of 2 left/)).toBeInTheDocument();
    expect(screen.getByText(/Pot \$40/)).toBeInTheDocument();
    // Nobody else is marked.
    expect(screen.getAllByText(/Joined after/)).toHaveLength(1);
  });
});
