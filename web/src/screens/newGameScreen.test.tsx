// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { DEFAULT_SETTINGS } from '@rummy/engine';
import type { PlayerDoc } from '@rummy/data';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const addDoc = vi.fn();
vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDoc(...args),
  collection: (_db: unknown, path: string) => ({ path }),
}));
vi.mock('../firebase', () => ({ db: {} }));

import { NewGameScreen } from './NewGameScreen';
import type { LeagueContext } from './LeagueLayout';

const person = (name: string): PlayerDoc => ({
  name,
  linkedUid: null,
  retired: false,
  mergedInto: null,
  createdBy: 'u',
  createdAt: 1,
});

const players = { a: person('Asha'), b: person('Bo'), c: person('Cy'), d: person('Dev') };

function Shell() {
  const context = {
    leagueId: 'L1',
    uid: 'u1',
    players,
    names: {},
    league: {},
    isAdmin: true,
    myPlayerId: null,
  } as unknown as LeagueContext;
  return <Outlet context={context} />;
}

function setup() {
  render(
    <MemoryRouter initialEntries={['/new']}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/new" element={<NewGameScreen />} />
          <Route path="/l/:leagueId/g/:gameId" element={<p>The game screen</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const lineUp = () =>
  screen
    .queryAllByRole('listitem')
    .filter((li) => li.closest('ol'))
    .map((li) =>
      li
        .textContent!.replace(/^\d+\.\s*/, '')
        .replace(/\(deals first\)|[↑↓×]/g, '')
        .trim(),
    );

beforeEach(() => addDoc.mockReset().mockResolvedValue({ id: 'new-game' }));
afterEach(cleanup);

describe('who is playing', () => {
  it('is one section: the line-up and the order live together, with no separate seating section', () => {
    setup();
    expect(screen.getByRole('heading', { name: "1. Who's playing" })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2. Rules' })).toBeInTheDocument();
    expect(screen.queryByText(/seating order/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^3\./ })).not.toBeInTheDocument();
  });

  it('starts with nobody in the line-up and every player ready to tap in', () => {
    setup();
    expect(lineUp()).toEqual([]);
    for (const name of ['Asha', 'Bo', 'Cy', 'Dev']) {
      expect(screen.getByRole('button', { name: `+ ${name}` })).toBeInTheDocument();
    }
  });

  it('adds players to the line-up in the order they are tapped, and takes them out of the add list', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: '+ Cy' }));
    await user.click(screen.getByRole('button', { name: '+ Asha' }));
    expect(lineUp()).toEqual(['Cy', 'Asha']);
    expect(screen.queryByRole('button', { name: '+ Cy' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Bo' })).toBeInTheDocument();
  });

  it('marks the player at the bottom as the dealer and has no arrow buttons', async () => {
    const user = setup();
    for (const name of ['Asha', 'Bo', 'Cy'])
      await user.click(screen.getByRole('button', { name: `+ ${name}` }));
    const rows = within(
      screen.getByRole('list', { name: 'Playing, in dealing order' }),
    ).getAllByRole('listitem');
    expect(rows.at(-1)).toHaveTextContent('(deals first)');
    expect(rows[0]).not.toHaveTextContent('(deals first)');
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reorder Asha' })).toBeInTheDocument();
  });

  it('reorders from the keyboard with the arrow keys on a handle, keeping focus on it', async () => {
    const user = setup();
    for (const name of ['Asha', 'Bo', 'Cy'])
      await user.click(screen.getByRole('button', { name: `+ ${name}` }));
    screen.getByRole('button', { name: 'Reorder Cy' }).focus();
    await user.keyboard('{ArrowUp}');
    expect(lineUp()).toEqual(['Asha', 'Cy', 'Bo']);
    expect(screen.getByRole('button', { name: 'Reorder Cy' })).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(lineUp()).toEqual(['Cy', 'Asha', 'Bo']);
    await user.keyboard('{ArrowDown}');
    expect(lineUp()).toEqual(['Asha', 'Cy', 'Bo']);
  });

  it('removes a player and puts them back on the add list', async () => {
    const user = setup();
    for (const name of ['Asha', 'Bo', 'Cy'])
      await user.click(screen.getByRole('button', { name: `+ ${name}` }));
    await user.click(screen.getByRole('button', { name: 'Remove Bo' }));
    expect(lineUp()).toEqual(['Asha', 'Cy']);
    expect(screen.getByRole('button', { name: '+ Bo' })).toBeInTheDocument();
  });

  it('selects everyone, then clears them, keeping the order already set', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: '+ Cy' }));
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(lineUp()).toEqual(['Cy', 'Asha', 'Bo', 'Dev']);
    expect(screen.queryByRole('button', { name: /^\+ / })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(lineUp()).toEqual([]);
  });

  it('says who deals and who gets the first card once two are in', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: '+ Asha' }));
    expect(screen.queryByTestId('seat-order')).not.toBeInTheDocument();
    expect(screen.getByText('Add at least one more.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+ Bo' }));
    await user.click(screen.getByRole('button', { name: '+ Cy' }));
    const note = screen.getByTestId('seat-order');
    expect(note).toHaveTextContent('Cy deals round 1 and Asha gets the first card');
    expect(note).toHaveTextContent('Asha → Bo → Cy');
  });
});

describe('dragging to reorder', () => {
  const ROW = 50;

  async function lineUpOf(names: string[]) {
    const user = setup();
    for (const name of names) await user.click(screen.getByRole('button', { name: `+ ${name}` }));
    return user;
  }

  beforeEach(() => {
    // jsdom does no layout, so say where each row is: 50px apart, in list order.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const list = this.closest('ol');
      const index = list ? [...list.children].indexOf(this) : 0;
      const top = Math.max(index, 0) * ROW;
      return {
        top,
        bottom: top + 40,
        height: 40,
        left: 0,
        right: 300,
        width: 300,
        x: 0,
        y: top,
      } as DOMRect;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const press = (name: string, y = 0) =>
    fireEvent(
      screen.getByRole('button', { name: `Reorder ${name}` }),
      new MouseEvent('pointerdown', { bubbles: true, clientY: y, button: 0 }),
    );
  const moveTo = (y: number) =>
    fireEvent(window, new MouseEvent('pointermove', { bubbles: true, clientY: y }));
  const release = () => fireEvent(window, new MouseEvent('pointerup', { bubbles: true }));
  const row = (name: string) =>
    within(screen.getByRole('list', { name: 'Playing, in dealing order' }))
      .getByText(name)
      .closest('li')!;

  it('moves a player down by dragging their handle past the next rows', async () => {
    await lineUpOf(['Asha', 'Bo', 'Cy', 'Dev']);
    press('Asha', 10);
    moveTo(10 + 2 * ROW + 5);
    release();
    expect(lineUp()).toEqual(['Bo', 'Cy', 'Asha', 'Dev']);
  });

  it('moves a player up to the top', async () => {
    await lineUpOf(['Asha', 'Bo', 'Cy', 'Dev']);
    press('Dev', 160);
    moveTo(0);
    release();
    expect(lineUp()).toEqual(['Dev', 'Asha', 'Bo', 'Cy']);
  });

  it('shows the dragged row following the pointer and the others sliding aside', async () => {
    await lineUpOf(['Asha', 'Bo', 'Cy']);
    press('Asha', 10);
    moveTo(10 + ROW);
    expect(row('Asha')).toHaveAttribute('data-dragging', 'true');
    expect(row('Asha').style.transform).toBe(`translateY(${ROW}px)`);
    expect(row('Bo').style.transform).toBe(`translateY(-${ROW}px)`);
    expect(row('Cy').style.transform).toBe('translateY(0px)');
    // Nothing is committed until the pointer is released.
    expect(lineUp()).toEqual(['Asha', 'Bo', 'Cy']);
    release();
    expect(lineUp()).toEqual(['Bo', 'Asha', 'Cy']);
    expect(row('Asha')).not.toHaveAttribute('data-dragging');
    expect(row('Asha').style.transform).toBe('');
  });

  it('does not drag a row off the ends of the list', async () => {
    await lineUpOf(['Asha', 'Bo']);
    press('Asha', 0);
    moveTo(900);
    expect(row('Asha').style.transform).toBe(`translateY(${ROW}px)`);
    release();
    expect(lineUp()).toEqual(['Bo', 'Asha']);
  });

  it('leaves the order alone for a small nudge', async () => {
    await lineUpOf(['Asha', 'Bo', 'Cy']);
    press('Bo', 60);
    moveTo(60 + 20);
    release();
    expect(lineUp()).toEqual(['Asha', 'Bo', 'Cy']);
  });

  it('puts everything back when the drag is cancelled with Escape or by the system', async () => {
    await lineUpOf(['Asha', 'Bo', 'Cy']);
    press('Asha', 0);
    moveTo(2 * ROW);
    fireEvent.keyDown(window, { key: 'Escape' });
    release();
    expect(lineUp()).toEqual(['Asha', 'Bo', 'Cy']);
    expect(row('Asha')).not.toHaveAttribute('data-dragging');

    press('Cy', 100);
    moveTo(0);
    fireEvent(window, new MouseEvent('pointercancel', { bubbles: true }));
    expect(lineUp()).toEqual(['Asha', 'Bo', 'Cy']);
  });

  it('starts the game with the dragged order, the player at the bottom dealing first', async () => {
    const user = await lineUpOf(['Asha', 'Bo', 'Cy']);
    press('Cy', 100);
    moveTo(0);
    release();
    expect(lineUp()).toEqual(['Cy', 'Asha', 'Bo']);
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    // Bo is now at the bottom, so deals first; then the cycle runs Cy, Asha.
    expect(addDoc.mock.calls[0]![1]).toMatchObject({ seatOrder: ['b', 'c', 'a'] });
  });
});

describe('rules', () => {
  const more = () => screen.getByRole('button', { name: /More rules/ });

  it('shows the elimination limit and buy-in, and keeps the rest out of the way', () => {
    setup();
    expect(screen.getByLabelText(/Elimination limit/)).toBeVisible();
    expect(screen.getByLabelText(/Buy-in/)).toBeVisible();
    for (const label of [
      /^Drop points/,
      /Middle drop points/,
      /Max drops/,
      /Max penalty/,
      /Rejoin cutoff/,
      /Drops on rejoin/,
    ]) {
      expect(screen.getByLabelText(label)).not.toBeVisible();
    }
    expect(more()).toHaveAttribute('aria-expanded', 'false');
  });

  it('says what is behind More rules while it is closed', () => {
    setup();
    expect(screen.getByTestId('more-rules-summary')).toHaveTextContent(
      'Drop 20, middle drop 40, up to 2 each · penalty cap 80 · rejoin with no drops · rejoin always open',
    );
  });

  it('opens and closes the rest of the rules', async () => {
    const user = setup();
    await user.click(more());
    expect(more()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(/^Drop points/)).toBeVisible();
    expect(screen.getByLabelText(/Drops on rejoin/)).toBeVisible();
    expect(screen.queryByTestId('more-rules-summary')).not.toBeInTheDocument();
    await user.click(more());
    expect(screen.getByLabelText(/^Drop points/)).not.toBeVisible();
  });

  it('keeps what was typed in the hidden rules, and the summary follows it', async () => {
    const user = setup();
    await user.click(more());
    const cap = screen.getByLabelText(/Max penalty/);
    await user.clear(cap);
    await user.type(cap, '60');
    await user.click(more());
    expect(screen.getByTestId('more-rules-summary')).toHaveTextContent('penalty cap 60');
  });

  it('does not offer to start while a rule is invalid, and says why', async () => {
    const user = setup();
    for (const name of ['Asha', 'Bo'])
      await user.click(screen.getByRole('button', { name: `+ ${name}` }));
    expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled();
    const limit = screen.getByLabelText(/Elimination limit/);
    await user.clear(limit);
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('more-rules-summary')).not.toBeInTheDocument();
  });
});

describe('starting the game', () => {
  it('needs at least two players', async () => {
    const user = setup();
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '+ Asha' }));
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '+ Bo' }));
    expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled();
  });

  it('saves the seat order starting at the dealer, with the default rules', async () => {
    const user = setup();
    for (const name of ['Asha', 'Bo', 'Cy'])
      await user.click(screen.getByRole('button', { name: `+ ${name}` }));
    await user.click(screen.getByRole('button', { name: 'Start game' }));

    expect(addDoc).toHaveBeenCalledTimes(1);
    const [target, game] = addDoc.mock.calls[0]!;
    expect(target).toEqual({ path: 'leagues/L1/games' });
    // Cy is at the bottom of the list, so deals first; then the cycle runs Asha, Bo.
    expect(game).toMatchObject({
      seatOrder: ['c', 'a', 'b'],
      status: 'inProgress',
      createdBy: 'u1',
      split: null,
      summary: null,
      summaryError: null,
      settings: DEFAULT_SETTINGS,
    });
    expect(await screen.findByText('The game screen')).toBeInTheDocument();
  });

  it('saves rules changed under More rules, and the limit and buy-in typed above them', async () => {
    const user = setup();
    for (const name of ['Asha', 'Bo'])
      await user.click(screen.getByRole('button', { name: `+ ${name}` }));
    const limit = screen.getByLabelText(/Elimination limit/);
    await user.clear(limit);
    await user.type(limit, '101');
    await user.click(screen.getByRole('button', { name: /More rules/ }));
    const drops = screen.getByLabelText(/Drops on rejoin/);
    await user.selectOptions(drops, 'carryOver');
    const cutoff = screen.getByLabelText(/Rejoin cutoff/);
    await user.type(cutoff, '80');
    await user.click(screen.getByRole('button', { name: 'Start game' }));

    const [, game] = addDoc.mock.calls[0]!;
    expect(game.settings).toMatchObject({
      limit: 101,
      dropsOnRejoin: { mode: 'carryOver' },
      rejoinCutoff: 80,
    });
  });

  it('shows why when saving fails and lets you try again', async () => {
    addDoc
      .mockReset()
      .mockRejectedValueOnce(new Error('Missing or insufficient permissions'))
      .mockResolvedValue({ id: 'g2' });
    const user = setup();
    for (const name of ['Asha', 'Bo'])
      await user.click(screen.getByRole('button', { name: `+ ${name}` }));
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(await screen.findByText('Missing or insufficient permissions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(await screen.findByText('The game screen')).toBeInTheDocument();
  });
});
