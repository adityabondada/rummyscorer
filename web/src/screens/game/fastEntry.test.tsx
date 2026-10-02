// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS, replay, type GameState, type Round } from '@rummy/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoundEntry } from './RoundEntry';
import { UndoBar } from './UndoBar';

afterEach(cleanup);

const names = { a: 'Asha', b: 'Bo', c: 'Cy' };
const pts = (points: number) => ({ kind: 'points' as const, points });
const play = (rounds: Round[] = [], over = {}): GameState =>
  replay({
    settings: { ...DEFAULT_SETTINGS, limit: 100, maxRoundPenalty: 80, ...over },
    seatOrder: ['a', 'b', 'c'],
    rounds,
  });

function setup(state = play(), onSubmit = vi.fn().mockResolvedValue(null)) {
  render(
    <RoundEntry
      state={state}
      names={names}
      title="Round 1"
      seq={state.lastSeq + 1}
      submitLabel="Save round"
      onSubmit={onSubmit}
      onClose={() => {}}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
}

const row = (name: string) => screen.getByText(name).closest('li')!;
const box = (name: string) => screen.getByLabelText(`${name} points`);

describe('entering points without reaching for each box', () => {
  it('opens the number keypad with a Next key on every points box', () => {
    setup();
    for (const name of ['Asha', 'Bo', 'Cy']) {
      expect(box(name)).toHaveAttribute('inputmode', 'numeric');
      expect(box(name)).toHaveAttribute('enterkeyhint', 'next');
    }
  });

  it('puts the cursor in the first box that needs points as soon as the winner is picked', async () => {
    const { user } = setup();
    await user.click(within(row('Asha')).getByRole('button', { name: 'Won' }));
    expect(box('Bo')).toHaveFocus();
    await user.click(within(row('Bo')).getByRole('button', { name: 'Won' }));
    expect(box('Asha')).toHaveFocus();
  });

  it('skips a player who has already dropped when choosing where to start', async () => {
    const { user } = setup();
    await user.click(within(row('Bo')).getByRole('button', { name: /Drop 20/ }));
    await user.click(within(row('Asha')).getByRole('button', { name: 'Won' }));
    expect(box('Cy')).toHaveFocus();
  });

  it('moves to the next player on Enter, and to Save after the last', async () => {
    const { user, onSubmit } = setup();
    await user.click(within(row('Asha')).getByRole('button', { name: 'Won' }));
    await user.keyboard('25{Enter}');
    expect(box('Bo')).toHaveValue('25');
    expect(box('Cy')).toHaveFocus();
    await user.keyboard('40{Enter}');
    expect(screen.getByRole('button', { name: 'Save round' })).toHaveFocus();
    // Enter only moves along: nothing is saved until Save is pressed.
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith({
      seq: 1,
      winnerId: 'a',
      entries: { b: pts(25), c: pts(40) },
    });
  });

  it('skips a dropped player on the way along', async () => {
    const { user } = setup();
    await user.click(within(row('Asha')).getByRole('button', { name: 'Won' }));
    await user.click(within(row('Cy')).getByRole('button', { name: /Drop 20/ }));
    await user.click(box('Bo'));
    await user.keyboard('10{Enter}');
    expect(screen.getByRole('button', { name: 'Save round' })).toHaveFocus();
  });
});

describe('the one-tap amounts', () => {
  it('has Drop, Middle and Max on each player who can score, with the game s own numbers', () => {
    setup(play([], { maxRoundPenalty: 60, dropPoints: 25, middleDropPoints: 45 }));
    const bo = within(row('Bo'));
    expect(bo.getByRole('button', { name: 'Drop 25' })).toBeInTheDocument();
    expect(bo.getByRole('button', { name: 'Middle 45' })).toBeInTheDocument();
    expect(bo.getByRole('button', { name: 'Max 60' })).toBeInTheDocument();
  });

  it('fills in the most with one tap, and clears it on a second', async () => {
    const { user } = setup();
    await user.click(within(row('Bo')).getByRole('button', { name: 'Max 80' }));
    expect(box('Bo')).toHaveValue('80');
    expect(within(row('Bo')).getByRole('button', { name: 'Max 80' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(row('Bo')).getByRole('button', { name: 'Max 80' }));
    expect(box('Bo')).toHaveValue('');
  });

  it('replaces a drop with the most, and saves it as points', async () => {
    const { user, onSubmit } = setup();
    await user.click(within(row('Asha')).getByRole('button', { name: 'Won' }));
    await user.click(within(row('Bo')).getByRole('button', { name: /Drop 20/ }));
    await user.click(within(row('Bo')).getByRole('button', { name: 'Max 80' }));
    await user.click(within(row('Cy')).getByRole('button', { name: 'Max 80' }));
    await user.click(screen.getByRole('button', { name: 'Save round' }));
    expect(onSubmit).toHaveBeenCalledWith({
      seq: 1,
      winnerId: 'a',
      entries: { b: pts(80), c: pts(80) },
    });
  });

  it('is not offered when the game has no cap, and not for the winner or in a penalty round', async () => {
    setup(play([], { maxRoundPenalty: null }));
    expect(screen.queryByRole('button', { name: /^Max/ })).not.toBeInTheDocument();
    cleanup();

    const { user } = setup();
    await user.click(within(row('Asha')).getByRole('button', { name: 'Won' }));
    expect(within(row('Asha')).queryByRole('button', { name: /^Max/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Penalty' }));
    expect(screen.queryByRole('button', { name: /^Max/ })).not.toBeInTheDocument();
  });
});

describe('seeing what a round does before saving it', () => {
  it('shows the new total under each player as their points go in', async () => {
    const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(30), c: pts(10) } }]);
    const { user } = setup(state);
    await user.click(within(row('Asha')).getByRole('button', { name: 'Won' }));
    expect(screen.getByTestId('after-a')).toHaveTextContent('→ 0');
    expect(screen.queryByTestId('after-b')).not.toBeInTheDocument();
    await user.type(box('Bo'), '25');
    expect(screen.getByTestId('after-b')).toHaveTextContent('→ 55');
  });

  it('catches a slip: a total near the limit, or past it, is called out', async () => {
    const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(50), c: pts(50) } }]);
    const { user } = setup(state);
    await user.click(within(row('Asha')).getByRole('button', { name: 'Won' }));
    await user.type(box('Bo'), '40');
    await user.type(box('Cy'), '51');
    expect(screen.getByTestId('after-b')).toHaveTextContent('→ 90 · close to the limit');
    expect(screen.getByTestId('after-c')).toHaveTextContent('→ 101 · out');
  });

  it('says so when the round would end the game, and who would win', async () => {
    const state = play([{ seq: 1, winnerId: 'a', entries: { b: pts(60), c: pts(60) } }]);
    const { user } = setup(state);
    await user.click(within(row('Asha')).getByRole('button', { name: 'Won' }));
    await user.type(box('Bo'), '50');
    expect(screen.queryByText(/ends the game/)).not.toBeInTheDocument();
    await user.type(box('Cy'), '50');
    expect(screen.getByText(/This round ends the game\. Asha wins\./)).toBeInTheDocument();
  });

  it('shows the penalty and the drops in a penalty round, too', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('radio', { name: 'Penalty' }));
    await user.click(within(row('Bo')).getByRole('button', { name: 'Got penalty' }));
    await user.click(within(row('Cy')).getByRole('button', { name: /Drop 20/ }));
    expect(screen.getByTestId('after-b')).toHaveTextContent(/^→ 80$/);
    expect(screen.getByTestId('after-c')).toHaveTextContent('→ 20');
    expect(screen.getByTestId('after-a')).toHaveTextContent('→ 0');
  });
});

describe('the Undo bar', () => {
  it('says which round was saved and undoes it with one tap', async () => {
    const onUndo = vi.fn();
    render(<UndoBar round={3} busy={false} onUndo={onUndo} onDismiss={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Round 3 saved');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Undo round 3' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed, and cannot be pressed twice while it is working', async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <UndoBar round={3} busy={false} onUndo={() => {}} onDismiss={onDismiss} />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    rerender(<UndoBar round={3} busy onUndo={() => {}} onDismiss={onDismiss} />);
    expect(screen.getByRole('button', { name: 'Undo round 3' })).toBeDisabled();
  });
});
