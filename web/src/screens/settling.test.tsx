// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { settledKey, type SettledDoc } from '@rummy/data';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmModal } from './game/Modals';
import { SettlingUp } from './SettlingUp';

afterEach(cleanup);

const names = { a: 'Asha', b: 'Bo', c: 'Cy' };
const day = '2026-10-03';
const transfers = [
  { from: 'c', to: 'a', amount: 10 },
  { from: 'b', to: 'a', amount: 5 },
];
const paid = (from: string, to: string, amount: number, by = 'u1'): [string, SettledDoc] => [
  settledKey(day, from, to, amount),
  { day, from, to, amount, by, at: 1 },
];

function setup(over: Partial<React.ComponentProps<typeof SettlingUp>> = {}) {
  const onMarkPaid = vi.fn();
  const onUndo = vi.fn();
  render(
    <SettlingUp
      day={day}
      transfers={transfers}
      names={names}
      settled={{}}
      uidNames={{ u1: 'Asha' }}
      inProgress={0}
      onMarkPaid={onMarkPaid}
      onMarkAllPaid={vi.fn()}
      onUndo={onUndo}
      {...over}
    />,
  );
  return { onMarkPaid, onUndo, user: userEvent.setup() };
}

describe('SettlingUp', () => {
  it('lists who pays whom, each with a way to mark it paid', () => {
    setup();
    expect(screen.getByText(/Cy/).closest('li')).toHaveTextContent('Cy pays Asha $10');
    expect(screen.getByText(/Bo/).closest('li')).toHaveTextContent('Bo pays Asha $5');
    expect(screen.getAllByRole('button', { name: 'Mark paid' })).toHaveLength(2);
    expect(screen.getByText('0 of 2 paid')).toBeInTheDocument();
  });

  it('marks just the payment that was clicked as paid', async () => {
    const { onMarkPaid, user } = setup();
    const row = screen.getByText(/Bo/).closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Mark paid' }));
    expect(onMarkPaid).toHaveBeenCalledTimes(1);
    expect(onMarkPaid).toHaveBeenCalledWith({ from: 'b', to: 'a', amount: 5 });
  });

  it('shows a paid payment as paid, with an undo, and keeps the others open', () => {
    setup({ settled: Object.fromEntries([paid('c', 'a', 10)]) });
    const row = screen.getByText(/Cy/).closest('li')!;
    expect(within(row).getByText('Paid')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Mark paid' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark paid' })).toHaveLength(1);
    expect(screen.getByText('1 of 2 paid')).toBeInTheDocument();
    expect(screen.queryByText('All settled')).not.toBeInTheDocument();
  });

  it('undoes using the record id for that exact payment', async () => {
    const entry = paid('c', 'a', 10);
    const { onUndo, user } = setup({ settled: Object.fromEntries([entry]) });
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledWith(entry[0]);
  });

  it('says who marked a payment, for screen readers', () => {
    setup({ settled: Object.fromEntries([paid('c', 'a', 10, 'u1')]), uidNames: { u1: 'Bo' } });
    expect(screen.getByText('marked by Bo')).toBeInTheDocument();
  });

  it('says all settled once everything is paid and no game is still running', () => {
    setup({ settled: Object.fromEntries([paid('c', 'a', 10), paid('b', 'a', 5)]) });
    expect(screen.getByText('All settled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark paid' })).not.toBeInTheDocument();
  });

  it('does not say all settled while a game that night is still being played', () => {
    setup({ settled: Object.fromEntries([paid('c', 'a', 10), paid('b', 'a', 5)]), inProgress: 1 });
    expect(screen.queryByText('All settled')).not.toBeInTheDocument();
    expect(screen.getByText('2 of 2 paid')).toBeInTheDocument();
    expect(screen.getByText(/Not counting 1 game still in progress/)).toBeInTheDocument();
  });

  it('shows a payment as unpaid again when the amount changed, because the old mark no longer matches', () => {
    // Cy paid $10, then another game made it $15.
    setup({
      transfers: [{ from: 'c', to: 'a', amount: 15 }],
      settled: Object.fromEntries([paid('c', 'a', 10)]),
    });
    expect(screen.getByRole('button', { name: 'Mark paid' })).toBeInTheDocument();
    expect(screen.queryByText('Paid')).not.toBeInTheDocument();
    expect(screen.queryByText('All settled')).not.toBeInTheDocument();
  });

  it('ignores a paid record from a different night', () => {
    const other = settledKey('2026-09-26', 'c', 'a', 10);
    setup({
      settled: { [other]: { day: '2026-09-26', from: 'c', to: 'a', amount: 10, by: 'u1', at: 1 } },
    });
    expect(screen.getAllByRole('button', { name: 'Mark paid' })).toHaveLength(2);
  });

  it('shows nothing when nobody owes anything', () => {
    const { container } = render(
      <SettlingUp
        day={day}
        transfers={[]}
        names={names}
        settled={{}}
        uidNames={{}}
        inProgress={0}
        onMarkPaid={() => {}}
        onMarkAllPaid={() => {}}
        onUndo={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ConfirmModal', () => {
  const modal = (onConfirm = vi.fn().mockResolvedValue(null), onClose = vi.fn()) => {
    render(
      <ConfirmModal
        title="Delete this game?"
        description="It cannot be undone."
        confirmLabel="Delete game"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    return { onConfirm, onClose, user: userEvent.setup() };
  };

  it('does nothing until the destructive button is pressed', () => {
    const { onConfirm } = modal();
    expect(screen.getByText('It cannot be undone.')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms when the button is pressed', async () => {
    const { onConfirm, user } = modal();
    await user.click(screen.getByRole('button', { name: 'Delete game' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes without confirming on Cancel', async () => {
    const { onConfirm, onClose, user } = modal();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows why it failed and lets you try again', async () => {
    const { onConfirm, user } = modal(
      vi.fn().mockResolvedValueOnce('You are not a member of this league').mockResolvedValue(null),
    );
    await user.click(screen.getByRole('button', { name: 'Delete game' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not a member');
    expect(screen.getByRole('button', { name: 'Delete game' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Delete game' }));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });
});
