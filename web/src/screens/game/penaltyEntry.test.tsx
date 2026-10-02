// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS, type GameState, type Round } from '@rummy/engine';
import { newRoundDoc, type GameDoc, type PlayerDoc } from '@rummy/data';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameState, type RoundRow } from '../../lib/game';
import { RoundEntry } from './RoundEntry';
import { RoundList } from './RoundList';

afterEach(cleanup);

const person = (name: string): PlayerDoc => ({
  name,
  linkedUid: null,
  retired: false,
  mergedInto: null,
  createdBy: 'u',
  createdAt: 1,
});
const players = { a: person('Asha'), b: person('Bo'), c: person('Cy') };
const names = { a: 'Asha', b: 'Bo', c: 'Cy' };

const game = (overrides: Partial<GameDoc['settings']> = {}): GameDoc => ({
  settings: { ...DEFAULT_SETTINGS, limit: 200, ...overrides },
  seatOrder: ['a', 'b', 'c'],
  status: 'inProgress',
  createdBy: 'u',
  createdAt: 1,
  split: null,
  summary: null,
  summaryError: null,
});

const rowsOf = (rounds: Round[]): RoundRow[] =>
  rounds.map((r, i) => ({ id: `r${i}`, doc: newRoundDoc(r, 'u', 1) }));
const stateWith = (rounds: Round[] = [], overrides = {}): GameState =>
  gameState(game(overrides), rowsOf(rounds), players);

const pts = (points: number) => ({ kind: 'points' as const, points });

const penaltyRound = (over: Partial<Round> = {}): Round => ({
  seq: 1,
  winnerId: null,
  penalty: { playerId: 'b', points: 80, reason: 'wrongShow' },
  entries: { a: pts(0), c: { kind: 'drop' } },
  ...over,
});

function setup(state = stateWith(), initial?: Round, onSubmit = vi.fn().mockResolvedValue(null)) {
  render(
    <RoundEntry
      state={state}
      names={names}
      title="Round 1"
      initial={initial}
      seq={initial?.seq ?? state.lastSeq + 1}
      submitLabel="Save round"
      onSubmit={onSubmit}
      onClose={() => {}}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
}

const row = (name: string) => screen.getByText(name).closest('li')!;
const kind = (label: string) => screen.getByRole('radio', { name: label });

describe('choosing a penalty round', () => {
  it('starts as an ordinary round, with a switch to a penalty round', () => {
    setup();
    expect(kind('Someone won')).toBeChecked();
    expect(kind('Penalty')).not.toBeChecked();
    expect(screen.queryByLabelText(/^Penalty points/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Won' })).toHaveLength(3);
  });

  it('shows the reason, the penalty points starting at the most, and who got it', async () => {
    const { user } = setup();
    await user.click(kind('Penalty'));
    expect(kind('Penalty')).toBeChecked();
    expect(screen.getByLabelText(/^Penalty points/)).toHaveValue('80');
    expect(screen.getByText('The most is 80')).toBeInTheDocument();
    expect(screen.getByLabelText('Reason')).toHaveValue('wrongShow');
    expect(screen.queryByRole('button', { name: 'Won' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Got penalty' })).toHaveLength(3);
    expect(screen.queryByLabelText('Bo points')).not.toBeInTheDocument();
  });

  it('starts the points empty when the game has no cap', async () => {
    const { user } = setup(stateWith([], { maxRoundPenalty: null }));
    await user.click(kind('Penalty'));
    expect(screen.getByLabelText(/^Penalty points/)).toHaveValue('');
    expect(screen.queryByText(/The most is/)).not.toBeInTheDocument();
  });
});

describe('entering a penalty round', () => {
  it('saves a wrong show: the culprit takes the most, others 0, and a dropper keeps the drop', async () => {
    const { onSubmit, user } = setup();
    await user.click(kind('Penalty'));
    await user.click(within(row('Bo')).getByRole('button', { name: 'Got penalty' }));
    await user.click(within(row('Cy')).getByRole('button', { name: /Drop 20/ }));
    await user.click(screen.getByRole('button', { name: 'Save round' }));

    expect(onSubmit).toHaveBeenCalledWith({
      seq: 1,
      winnerId: null,
      penalty: { playerId: 'b', points: 80, reason: 'wrongShow' },
      entries: { a: pts(0), c: { kind: 'drop' } },
    });
  });

  it('saves another kind of error for fewer points', async () => {
    const { onSubmit, user } = setup();
    await user.click(kind('Penalty'));
    await user.selectOptions(screen.getByLabelText('Reason'), 'error');
    const points = screen.getByLabelText(/^Penalty points/);
    await user.clear(points);
    await user.type(points, '40');
    await user.click(within(row('Asha')).getByRole('button', { name: 'Got penalty' }));
    await user.click(screen.getByRole('button', { name: 'Save round' }));
    expect(onSubmit).toHaveBeenCalledWith({
      seq: 1,
      winnerId: null,
      penalty: { playerId: 'a', points: 40, reason: 'error' },
      entries: { b: pts(0), c: pts(0) },
    });
  });

  it('marks the player who got the penalty and takes their drop buttons away', async () => {
    const { user } = setup();
    await user.click(kind('Penalty'));
    await user.click(within(row('Bo')).getByRole('button', { name: 'Got penalty' }));
    const bo = within(row('Bo'));
    expect(bo.getByRole('button', { name: 'Penalty' })).toHaveAttribute('aria-pressed', 'true');
    expect(bo.queryByRole('button', { name: /Drop/ })).not.toBeInTheDocument();
    expect(within(row('Asha')).getByText('0 pts')).toBeInTheDocument();
  });

  it('moves the penalty to someone else, and forgets a drop they had tapped', async () => {
    const { onSubmit, user } = setup();
    await user.click(kind('Penalty'));
    await user.click(within(row('Cy')).getByRole('button', { name: /Drop 20/ }));
    await user.click(within(row('Bo')).getByRole('button', { name: 'Got penalty' }));
    await user.click(within(row('Cy')).getByRole('button', { name: 'Got penalty' }));
    expect(within(row('Bo')).getByRole('button', { name: /Drop 20/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save round' }));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      penalty: { playerId: 'c' },
      entries: { a: pts(0), b: pts(0) },
    });
  });

  it('asks who made the mistake, and for the points, without saving', async () => {
    const { onSubmit, user } = setup();
    await user.click(kind('Penalty'));
    await user.click(screen.getByRole('button', { name: 'Save round' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick who made the mistake');

    await user.click(within(row('Bo')).getByRole('button', { name: 'Got penalty' }));
    await user.clear(screen.getByLabelText(/^Penalty points/));
    await user.click(screen.getByRole('button', { name: 'Save round' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the penalty points');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses more than the most the game allows, naming nobody by id', async () => {
    const { onSubmit, user } = setup();
    await user.click(kind('Penalty'));
    const points = screen.getByLabelText(/^Penalty points/);
    await user.clear(points);
    await user.type(points, '90');
    await user.click(within(row('Bo')).getByRole('button', { name: 'Got penalty' }));
    await user.click(screen.getByRole('button', { name: 'Save round' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('80 cap');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps what was typed for an ordinary round when switching to a penalty and back', async () => {
    const { user } = setup();
    await user.click(within(row('Asha')).getByRole('button', { name: 'Won' }));
    await user.type(screen.getByLabelText('Bo points'), '25');
    await user.click(kind('Penalty'));
    await user.click(kind('Someone won'));
    expect(screen.getByLabelText('Bo points')).toHaveValue('25');
    expect(within(row('Asha')).getByRole('button', { name: 'Winner' })).toBeInTheDocument();
  });

  it('shows the reason when saving fails', async () => {
    const { user } = setup(stateWith(), undefined, vi.fn().mockResolvedValue('Could not save'));
    await user.click(kind('Penalty'));
    await user.click(within(row('Bo')).getByRole('button', { name: 'Got penalty' }));
    await user.click(screen.getByRole('button', { name: 'Save round' }));
    expect(await screen.findByText('Could not save')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save round' })).toBeEnabled();
  });
});

describe('editing a penalty round', () => {
  it('opens as a penalty round with the player, the points, the reason and the drops', () => {
    setup(stateWith(), penaltyRound({ penalty: { playerId: 'b', points: 40, reason: 'error' } }));
    expect(kind('Penalty')).toBeChecked();
    expect(screen.getByLabelText(/^Penalty points/)).toHaveValue('40');
    expect(screen.getByLabelText('Reason')).toHaveValue('error');
    expect(within(row('Bo')).getByRole('button', { name: 'Penalty' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(row('Cy')).getByRole('button', { name: /Drop 20/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('can be changed to an ordinary round with a winner', async () => {
    const { onSubmit, user } = setup(stateWith(), penaltyRound());
    await user.click(kind('Someone won'));
    await user.click(within(row('Asha')).getByRole('button', { name: 'Won' }));
    await user.type(screen.getByLabelText('Bo points'), '10');
    await user.type(screen.getByLabelText('Cy points'), '10');
    await user.click(screen.getByRole('button', { name: 'Save round' }));
    const saved = onSubmit.mock.calls[0]![0] as Round;
    expect(saved.winnerId).toBe('a');
    expect(saved.penalty ?? null).toBeNull();
  });
});

describe('the list of rounds', () => {
  const rounds: Round[] = [
    { seq: 1, winnerId: 'a', entries: { b: pts(10), c: pts(20) } },
    penaltyRound({ seq: 2 }),
  ];
  const renderList = (rs: Round[]) => {
    const rows = rowsOf(rs);
    render(
      <RoundList
        rows={rows}
        state={gameState(game(), rows, players)}
        names={names}
        uidNames={{ u: 'Asha' }}
        onEdit={null}
      />,
    );
  };

  it('says who took the penalty, why, and how many points', () => {
    renderList(rounds);
    expect(screen.getByText('Wrong show: Bo took 80')).toBeInTheDocument();
    expect(screen.getByText('Asha won')).toBeInTheDocument();
  });

  it('shows everyone s points for the round, with the drop and the penalty player marked', () => {
    renderList(rounds);
    const second = screen.getByText('Wrong show: Bo took 80').closest('li')!;
    const chips = within(second)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(chips).toEqual(['Asha 0', 'Bo 80', 'Cy 20(drop)']);
  });

  it('names the reason for another kind of error', () => {
    renderList([
      penaltyRound({
        penalty: { playerId: 'c', points: 40, reason: 'error' },
        entries: { a: pts(0), b: pts(0) },
      }),
    ]);
    expect(screen.getByText('Other error: Cy took 40')).toBeInTheDocument();
  });

  it('describes an earlier version that was a penalty round', () => {
    const rows = rowsOf([penaltyRound()]);
    const edited = {
      ...rows[0]!,
      doc: {
        ...rows[0]!.doc,
        winnerId: 'a',
        penalty: null,
        entries: { b: pts(5), c: pts(5) },
        history: [
          {
            by: 'u',
            at: 5,
            prev: {
              winnerId: null,
              penalty: { playerId: 'b', points: 80, reason: 'wrongShow' as const },
              entries: { a: pts(0), c: pts(0) },
              rejoins: [],
              scrapped: null,
            },
          },
        ],
      },
    };
    render(
      <RoundList
        rows={[edited]}
        state={gameState(game(), [edited], players)}
        names={names}
        uidNames={{ u: 'Asha' }}
        onEdit={null}
      />,
    );
    expect(screen.getByText(/Wrong show, Bo took 80; Asha 0, Cy 0/)).toBeInTheDocument();
  });
});
