// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
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

  it('reorders with the arrows and marks the player at the bottom as the dealer', async () => {
    const user = setup();
    for (const name of ['Asha', 'Bo', 'Cy'])
      await user.click(screen.getByRole('button', { name: `+ ${name}` }));
    expect(lineUp()).toEqual(['Asha', 'Bo', 'Cy']);
    await user.click(screen.getByRole('button', { name: 'Move Cy up' }));
    expect(lineUp()).toEqual(['Asha', 'Cy', 'Bo']);
    const rows = within(
      screen.getByRole('list', { name: 'Playing, in dealing order' }),
    ).getAllByRole('listitem');
    expect(rows.at(-1)).toHaveTextContent('(deals first)');
    expect(rows[0]).not.toHaveTextContent('(deals first)');
    expect(screen.getByRole('button', { name: 'Move Asha up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Bo down' })).toBeDisabled();
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
