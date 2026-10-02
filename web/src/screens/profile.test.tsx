// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const updateName = vi.fn();
const signOut = vi.fn();
const createLeague = vi.fn();
const joinLeague = vi.fn();
let user: { uid: string; displayName: string | null; email: string | null };

vi.mock('../auth', () => ({
  useUser: () => user,
  useAuth: () => ({ user, updateName, signOut }),
}));
vi.mock('../api', () => ({
  createLeague: (...args: unknown[]) => createLeague(...args),
  joinLeague: (...args: unknown[]) => joinLeague(...args),
  errorMessage: (e: unknown) =>
    e instanceof Error ? e.message : 'Something went wrong. Try again.',
}));
vi.mock('../hooks', () => ({ useMyLeagues: () => ({ loading: false, value: [] }) }));

import { LeaguesScreen } from './LeaguesScreen';
import { ProfileScreen } from './ProfileScreen';

function setup(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<LeaguesScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/l/:id" element={<p>A league</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  user = { uid: 'u1', displayName: 'Asha', email: 'asha@example.com' };
  updateName.mockReset().mockResolvedValue(undefined);
  signOut.mockReset().mockResolvedValue(undefined);
  createLeague.mockReset().mockResolvedValue({ leagueId: 'L1' });
  joinLeague.mockReset().mockResolvedValue({ leagueId: 'L1' });
});
afterEach(cleanup);

describe('the home screen', () => {
  it('has no name section, and a Profile link at the top right instead of Sign out', () => {
    setup();
    expect(screen.queryByText('Your name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Shown to your league/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile');
  });

  it('opens the profile from that link', async () => {
    const u = setup();
    await u.click(screen.getByRole('link', { name: 'Profile' }));
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
  });

  it('creates a league under the name from the profile', async () => {
    const u = setup();
    await u.type(screen.getByLabelText('League name'), 'Friday Rummy');
    await u.click(screen.getByRole('button', { name: 'Create league' }));
    expect(createLeague).toHaveBeenCalledWith({ name: 'Friday Rummy', displayName: 'Asha' });
    expect(await screen.findByText('A league')).toBeInTheDocument();
  });

  it('joins a league under the name from the profile', async () => {
    const u = setup();
    await u.type(screen.getByLabelText('Invite code'), 'ABCD2345');
    await u.click(screen.getByRole('button', { name: 'Join league' }));
    expect(joinLeague).toHaveBeenCalledWith({ code: 'ABCD2345', displayName: 'Asha' });
  });

  it('asks for a name, with a link to the profile, when there is none yet', async () => {
    user = { uid: 'u1', displayName: null, email: null };
    const u = setup();
    expect(screen.getByRole('status')).toHaveTextContent('Add your name in your profile');
    await u.type(screen.getByLabelText('League name'), 'Friday Rummy');
    expect(screen.getByRole('button', { name: 'Create league' })).toBeDisabled();
    await u.type(screen.getByLabelText('Invite code'), 'ABCD2345');
    expect(screen.getByRole('button', { name: 'Join league' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'profile' })).toHaveAttribute('href', '/profile');
  });

  it('does not show that note when there is a name', () => {
    setup();
    expect(screen.queryByText(/Add your name/)).not.toBeInTheDocument();
  });
});

describe('the profile screen', () => {
  it('shows the current name and who is signed in', () => {
    setup('/profile');
    expect(screen.getByLabelText(/Shown to your league/)).toHaveValue('Asha');
    expect(screen.getByText('Signed in as asha@example.com')).toBeInTheDocument();
  });

  it('only offers to save once the name has changed to something', async () => {
    const u = setup('/profile');
    const save = screen.getByRole('button', { name: 'Save name' });
    expect(save).toBeDisabled();
    const field = screen.getByLabelText(/Shown to your league/);
    await u.clear(field);
    expect(save).toBeDisabled();
    await u.type(field, '   ');
    expect(save).toBeDisabled();
    await u.clear(field);
    await u.type(field, 'Asha B');
    expect(save).toBeEnabled();
  });

  it('saves the trimmed name and says so', async () => {
    const u = setup('/profile');
    const field = screen.getByLabelText(/Shown to your league/);
    await u.clear(field);
    await u.type(field, '  Asha B  ');
    await u.click(screen.getByRole('button', { name: 'Save name' }));
    expect(updateName).toHaveBeenCalledWith('Asha B');
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
    expect(field).toHaveValue('Asha B');
  });

  it('takes the Saved note away as soon as the name is edited again', async () => {
    const u = setup('/profile');
    const field = screen.getByLabelText(/Shown to your league/);
    await u.type(field, 'x');
    await u.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    await u.type(field, 'y');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says why when saving fails, and does not claim it saved', async () => {
    updateName.mockRejectedValue(new Error("Couldn't reach the server. Check your connection."));
    const u = setup('/profile');
    await u.type(screen.getByLabelText(/Shown to your league/), 'x');
    await u.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server");
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('signs out', async () => {
    const u = setup('/profile');
    await u.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
