// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import type { LeagueDoc, PlayerDoc } from '@rummy/data';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const addDoc = vi.fn();
const updateDoc = vi.fn();
const mergePlayers = vi.fn();
const unmergePlayers = vi.fn();
const removeMember = vi.fn();
const regenerateInvite = vi.fn();

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDoc(...args),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
}));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../api', () => ({
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.'),
  mergePlayers: (...args: unknown[]) => mergePlayers(...args),
  unmergePlayers: (...args: unknown[]) => unmergePlayers(...args),
  removeMember: (...args: unknown[]) => removeMember(...args),
  regenerateInvite: (...args: unknown[]) => regenerateInvite(...args),
}));

import { LeagueTabs, type LeagueContext } from './LeagueLayout';
import { PlayersTab } from './PlayersTab';

const person = (name: string, over: Partial<PlayerDoc> = {}): PlayerDoc => ({
  name,
  linkedUid: null,
  retired: false,
  mergedInto: null,
  createdBy: 'u',
  createdAt: 1,
  ...over,
});

const league: LeagueDoc = {
  name: 'Friday Rummy',
  adminUid: 'admin',
  inviteCode: 'ABCD2345',
  memberUids: ['admin', 'ravi'],
  createdAt: 1,
};

const players: Record<string, PlayerDoc> = {
  p1: person('Asha', { linkedUid: 'admin' }),
  p2: person('Ravi', { linkedUid: 'ravi' }),
  p3: person('Bo'),
  p4: person('Cy', { retired: true }),
  p5: person('Dev', { linkedUid: 'gone', retired: true }),
  g1: person('Bo (guest)', { mergedInto: 'p2' }),
};

function setup(as: 'admin' | 'ravi' = 'admin', over: Partial<LeagueContext> = {}) {
  const context = {
    leagueId: 'L1',
    league,
    uid: as,
    isAdmin: as === 'admin',
    players,
    names: {},
    myPlayerId: null,
    ...over,
  } as unknown as LeagueContext;
  render(
    <MemoryRouter initialEntries={['/players']}>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="/players" element={<PlayersTab />} />
          <Route path="/tabs" element={<LeagueTabs />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const row = (name: string) =>
  within(screen.getByRole('list', { name: 'Players' }))
    .getByText(name, { selector: 'span' })
    .closest('li')!;
const openMenu = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(within(row(name)).getByRole('button', { name: `More actions for ${name}` }));
  return within(row(name)).getByRole('menu');
};

beforeEach(() => {
  for (const fn of [
    addDoc,
    updateDoc,
    mergePlayers,
    unmergePlayers,
    removeMember,
    regenerateInvite,
  ])
    fn.mockReset().mockResolvedValue({});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the league tabs', () => {
  it('are Games, Stats and Players, with no separate Members tab', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route
            element={
              <Outlet
                context={{ leagueId: 'L1', league, uid: 'admin', players, names: {} } as never}
              />
            }
          >
            <Route path="/" element={<LeagueTabs />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'League sections' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Games', 'Stats', 'Players']);
  });
});

describe('the list of players', () => {
  it('shows members and guests together, with a badge for each kind', () => {
    setup();
    const badges = (name: string) =>
      within(row(name))
        .getAllByText(/^(Admin|You|Member|Former member|Guest|Retired)$/)
        .map((b) => b.textContent);
    expect(badges('Asha')).toEqual(['Member', 'Admin', 'You']);
    expect(badges('Ravi')).toEqual(['Member']);
    expect(badges('Bo')).toEqual(['Guest']);
    expect(badges('Cy')).toEqual(['Guest', 'Retired']);
  });

  it('calls someone who was removed a former member, not a member', () => {
    setup();
    const dev = within(row('Dev'));
    expect(dev.getByText('Former member')).toBeInTheDocument();
    expect(dev.queryByText('Member')).not.toBeInTheDocument();
    expect(dev.getByText('Retired')).toBeInTheDocument();
  });

  it('lists people by name, and leaves out guests merged into a member', () => {
    setup();
    const names = within(screen.getByRole('list', { name: 'Players' }))
      .getAllByRole('listitem')
      .map((li) => li.querySelector('span span')?.textContent);
    expect(names).toEqual(['Asha', 'Bo', 'Cy', 'Dev', 'Ravi']);
  });

  it('says under a member which guest games were linked to them, with a way to undo it', async () => {
    const user = setup();
    expect(within(row('Ravi')).getByText(/Includes games played as guest/)).toHaveTextContent(
      'Bo (guest)',
    );
    await user.click(within(row('Ravi')).getByRole('button', { name: 'Unlink' }));
    expect(unmergePlayers).toHaveBeenCalledWith({ leagueId: 'L1', guestId: 'g1' });
  });
});

describe('the actions on a row', () => {
  it('keeps them behind a menu, closed to begin with', () => {
    setup();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(
      within(row('Asha')).getByRole('button', { name: 'More actions for Asha' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the menu with rename and retire, and shuts it on Escape or a tap elsewhere', async () => {
    const user = setup();
    const menu = await openMenu(user, 'Bo');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Rename', 'Retire']);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await openMenu(user, 'Bo');
    await user.click(screen.getByRole('button', { name: 'Add player' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('has one menu open at a time', async () => {
    const user = setup();
    await openMenu(user, 'Bo');
    await openMenu(user, 'Ravi');
    expect(screen.getAllByRole('menu')).toHaveLength(1);
  });

  it('retires a player, and brings a retired one back', async () => {
    const user = setup();
    await openMenu(user, 'Bo');
    await user.click(screen.getByRole('menuitem', { name: 'Retire' }));
    expect(updateDoc).toHaveBeenCalledWith({ path: 'leagues/L1/players/p3' }, { retired: true });

    await openMenu(user, 'Cy');
    await user.click(screen.getByRole('menuitem', { name: 'Bring back' }));
    expect(updateDoc).toHaveBeenLastCalledWith(
      { path: 'leagues/L1/players/p4' },
      { retired: false },
    );
  });

  it('renames a player', async () => {
    const user = setup();
    await openMenu(user, 'Bo');
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const field = screen.getByLabelText('Name');
    expect(field).toHaveValue('Bo');
    await user.clear(field);
    await user.type(field, '  Bo B  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateDoc).toHaveBeenCalledWith({ path: 'leagues/L1/players/p3' }, { name: 'Bo B' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not save a blank name', async () => {
    const user = setup();
    await openMenu(user, 'Bo');
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    await user.clear(screen.getByLabelText('Name'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('removing someone from the league', () => {
  it('is offered to the admin for another member, and says what it does', async () => {
    const user = setup();
    const menu = await openMenu(user, 'Ravi');
    await user.click(within(menu).getByRole('menuitem', { name: 'Remove from league' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Remove Ravi'));
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('Their games and stats stay'),
    );
    expect(removeMember).toHaveBeenCalledWith({ leagueId: 'L1', memberUid: 'ravi' });
  });

  it('does nothing when the admin cancels', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = setup();
    const menu = await openMenu(user, 'Ravi');
    await user.click(within(menu).getByRole('menuitem', { name: 'Remove from league' }));
    expect(removeMember).not.toHaveBeenCalled();
  });

  it('is not offered for the admin, a guest or a former member', async () => {
    const user = setup();
    for (const name of ['Asha', 'Bo', 'Dev']) {
      const menu = await openMenu(user, name);
      expect(within(menu).queryByRole('menuitem', { name: 'Remove from league' })).toBeNull();
      await user.keyboard('{Escape}');
    }
  });

  it('is not offered to anyone but the admin', async () => {
    const user = setup('ravi');
    const menu = await openMenu(user, 'Asha');
    expect(within(menu).queryByRole('menuitem', { name: 'Remove from league' })).toBeNull();
  });

  it('shows why it failed', async () => {
    removeMember.mockRejectedValue(new Error('The admin cannot be removed'));
    const user = setup();
    const menu = await openMenu(user, 'Ravi');
    await user.click(within(menu).getByRole('menuitem', { name: 'Remove from league' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The admin cannot be removed');
  });
});

describe('adding a player', () => {
  it('is a button at the top that opens a popup, rather than a form that is always open', async () => {
    const user = setup();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add player' }));
    expect(screen.getByRole('dialog', { name: 'Add a player' })).toBeInTheDocument();
  });

  it('saves a guest under the trimmed name and closes', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Add player' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('button', { name: 'Add player' })).toBeDisabled();
    await user.type(dialog.getByLabelText('Name'), '  Eli ');
    await user.click(dialog.getByRole('button', { name: 'Add player' }));
    expect(addDoc).toHaveBeenCalledWith(
      { path: 'leagues/L1/players' },
      expect.objectContaining({
        name: 'Eli',
        linkedUid: null,
        retired: false,
        mergedInto: null,
        createdBy: 'admin',
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is open to every member, not only the admin', () => {
    setup('ravi');
    expect(screen.getByRole('button', { name: 'Add player' })).toBeInTheDocument();
  });
});

describe('inviting people', () => {
  it('is a button for every member, not only the admin', () => {
    setup('ravi');
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
    cleanup();
    setup('admin');
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
  });

  it('gives a member the link and the code, and a way to copy the link', async () => {
    const user = setup('ravi');
    await user.click(screen.getByRole('button', { name: 'Invite' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Invite people' }));
    expect(dialog.getByTestId('invite-link')).toHaveTextContent('/join/ABCD2345');
    expect(dialog.getByText('ABCD2345')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('keeps replacing the invite, which cuts off links already out there, for the admin', async () => {
    const user = setup('ravi');
    await user.click(screen.getByRole('button', { name: 'Invite' }));
    expect(screen.queryByRole('button', { name: 'New invite' })).not.toBeInTheDocument();
  });

  it('shows the link and the code in a popup, not on the page', async () => {
    const user = setup();
    expect(screen.queryByTestId('invite-link')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Invite' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Invite people' }));
    expect(dialog.getByTestId('invite-link')).toHaveTextContent('/join/ABCD2345');
    expect(dialog.getByText('ABCD2345')).toBeInTheDocument();
  });

  it('copies the link and says so', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Invite' }));
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await navigator.clipboard.readText()).toContain('/join/ABCD2345');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('replaces the invite only after a confirmation', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Invite' }));
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await user.click(screen.getByRole('button', { name: 'New invite' }));
    expect(regenerateInvite).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'New invite' }));
    expect(regenerateInvite).toHaveBeenCalledWith({ leagueId: 'L1' });
  });
});

describe('linking a guest to a member', () => {
  it('is on guest rows only, and not on retired guests or members', () => {
    setup();
    expect(within(row('Bo')).getByRole('button', { name: 'Link to a member' })).toBeInTheDocument();
    for (const name of ['Asha', 'Ravi', 'Cy', 'Dev']) {
      expect(within(row(name)).queryByRole('button', { name: 'Link to a member' })).toBeNull();
    }
  });

  it('offers current members only, not a former member', async () => {
    const user = setup();
    await user.click(within(row('Bo')).getByRole('button', { name: 'Link to a member' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(
      dialog
        .getAllByRole('button')
        .map((b) => b.textContent)
        .filter((t) => t !== '×'),
    ).toEqual(['Asha', 'Ravi']);
  });

  it('links the guest to the member picked', async () => {
    const user = setup();
    await user.click(within(row('Bo')).getByRole('button', { name: 'Link to a member' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ravi' }));
    expect(mergePlayers).toHaveBeenCalledWith({ leagueId: 'L1', guestId: 'p3', targetId: 'p2' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
