// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_SETTINGS, type GameState, type Round } from '@rummy/engine';
import type { GameDoc, PlayerDoc } from '@rummy/data';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../../ErrorBoundary';
import { gameState } from '../../lib/game';
import { RejoinModal, SplitModal } from './Modals';
import { ResultCard } from './ResultCard';
import { RoundEntry } from './RoundEntry';
import { ScoreBoard } from './ScoreBoard';

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
  settings: { ...DEFAULT_SETTINGS, limit: 50, maxRoundPenalty: null, ...overrides },
  seatOrder: ['a', 'b', 'c'],
  status: 'inProgress',
  createdBy: 'u',
  createdAt: 1,
  split: null,
  summary: null,
  summaryError: null,
});

const stateWith = (rounds: Round[] = [], overrides = {}): GameState =>
  gameState(
    game(overrides),
    rounds.map((r, i) => ({
      id: `r${i}`,
      doc: {
        seq: r.seq,
        winnerId: r.winnerId,
        penalty: r.penalty ?? null,
        entries: r.entries,
        rejoins: r.rejoins ?? [],
        scrapped: null,
        updatedBy: 'u',
        updatedAt: 1,
        history: [],
      },
    })),
    players,
  );

describe('RoundEntry', () => {
  const setup = (state = stateWith(), onSubmit = vi.fn().mockResolvedValue(null)) => {
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
  };

  it('saves a round from a winner, points and a drop', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getAllByRole('button', { name: 'Won' })[0]!);
    await user.type(screen.getByLabelText('Bo points'), '25');
    await user.click(screen.getAllByRole('button', { name: /Drop 20/ })[1]!);
    await user.click(screen.getByRole('button', { name: 'Save round' }));

    expect(onSubmit).toHaveBeenCalledWith({
      seq: 1,
      winnerId: 'a',
      entries: { b: { kind: 'points', points: 25 }, c: { kind: 'drop' } },
    });
  });

  it('checks a later round against the next sequence number, not round zero', async () => {
    const played = stateWith([
      {
        seq: 1,
        winnerId: 'a',
        entries: { b: { kind: 'points', points: 5 }, c: { kind: 'points', points: 5 } },
      },
    ]);
    const { onSubmit, user } = setup(played);
    await user.click(screen.getAllByRole('button', { name: 'Won' })[0]!);
    await user.type(screen.getByLabelText('Bo points'), '5');
    await user.type(screen.getByLabelText('Cy points'), '5');
    await user.click(screen.getByRole('button', { name: 'Save round' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ seq: 2 }));
  });

  it("asks for a winner and for everyone else's points, without saving", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Save round' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick who won');

    await user.click(screen.getAllByRole('button', { name: 'Won' })[0]!);
    await user.type(screen.getByLabelText('Bo points'), '10');
    await user.click(screen.getByRole('button', { name: 'Save round' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Cy');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('turns the drop buttons off for someone with no drops left', () => {
    setup(stateWith([], { maxDrops: 0 }));
    for (const button of screen.getAllByRole('button', { name: /Drop 20|Middle 40/ })) {
      expect(button).toBeDisabled();
    }
  });

  it("shows who deals and who plays first, and each player's drops", () => {
    setup();
    expect(screen.getByText(/drops 2 of 2 left · deals/)).toBeInTheDocument();
    expect(screen.getByText(/plays first/)).toBeInTheDocument();
  });

  it('shows the reason when saving fails', async () => {
    const { user } = setup(stateWith(), vi.fn().mockResolvedValue('Could not save'));
    await user.click(screen.getAllByRole('button', { name: 'Won' })[0]!);
    await user.type(screen.getByLabelText('Bo points'), '10');
    await user.type(screen.getByLabelText('Cy points'), '10');
    await user.click(screen.getByRole('button', { name: 'Save round' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  });

  it('refuses points past the cap', async () => {
    const { onSubmit, user } = setup(stateWith([], { maxRoundPenalty: 80 }));
    await user.click(screen.getAllByRole('button', { name: 'Won' })[0]!);
    await user.type(screen.getByLabelText('Bo points'), '81');
    await user.type(screen.getByLabelText('Cy points'), '5');
    await user.click(screen.getByRole('button', { name: 'Save round' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cap');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('SplitModal', () => {
  const inProgress = () =>
    stateWith([
      {
        seq: 1,
        winnerId: 'a',
        entries: { b: { kind: 'points', points: 10 }, c: { kind: 'points', points: 20 } },
      },
    ]);

  it('suggests a split that adds up, and saves it', async () => {
    const onConfirm = vi.fn().mockResolvedValue(null);
    render(
      <SplitModal state={inProgress()} names={names} onConfirm={onConfirm} onClose={() => {}} />,
    );
    const user = userEvent.setup();
    expect(screen.getByText(/Total \$30 of \$30/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /End game with this split/ }));
    const shares = onConfirm.mock.calls[0]![0] as Record<string, number>;
    expect(Object.values(shares).reduce((x, y) => x + y, 0)).toBe(30);
  });

  it("will not save amounts that don't add up to the pot", async () => {
    render(
      <SplitModal state={inProgress()} names={names} onConfirm={vi.fn()} onClose={() => {}} />,
    );
    const user = userEvent.setup();
    const input = screen.getByLabelText('Asha share');
    await user.clear(input);
    await user.type(input, '1');
    expect(screen.getByRole('button', { name: /End game with this split/ })).toBeDisabled();
    expect(screen.getByText(/\$\d+ left/)).toBeInTheDocument();
  });

  it('is replaced by the result once the game finishes, instead of crashing', () => {
    // The game screen only mounts the modal while in progress; a finished state would throw here.
    const finished = stateWith([
      {
        seq: 1,
        winnerId: 'a',
        entries: { b: { kind: 'points', points: 60 }, c: { kind: 'points', points: 60 } },
      },
    ]);
    expect(finished.status).toBe('finished');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(<SplitModal state={finished} names={names} onConfirm={vi.fn()} onClose={() => {}} />),
    ).toThrow('already over');
    spy.mockRestore();
  });
});

describe('RejoinModal', () => {
  it('pays the buy-in and lets the player pick a seat', async () => {
    const out = stateWith([
      {
        seq: 1,
        winnerId: 'a',
        entries: { b: { kind: 'points', points: 10 }, c: { kind: 'points', points: 60 } },
      },
    ]);
    const onConfirm = vi.fn().mockResolvedValue(null);
    render(
      <RejoinModal
        state={out}
        playerId="c"
        names={names}
        entryScore={11}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    const user = userEvent.setup();
    expect(screen.getByText(/re-enters on/)).toHaveTextContent('11');
    await user.click(screen.getByRole('button', { name: /First seat/ }));
    await user.click(screen.getByRole('button', { name: 'Rejoin for $10' }));
    expect(onConfirm).toHaveBeenCalledWith(0);
  });
});

describe('ScoreBoard and ResultCard', () => {
  it('marks the dealer, who plays first, and who is out', () => {
    const state = stateWith([
      {
        seq: 1,
        winnerId: 'a',
        entries: { b: { kind: 'points', points: 10 }, c: { kind: 'points', points: 60 } },
      },
    ]);
    render(<ScoreBoard state={state} names={names} />);
    expect(screen.getByText('Out')).toBeInTheDocument();
    expect(screen.getByText('Deals')).toBeInTheDocument();
    expect(screen.getByText('Plays first')).toBeInTheDocument();
    expect(screen.getByText(/Pot \$30/)).toBeInTheDocument();
  });

  it('shows the winner, each net and who pays whom', () => {
    const state = stateWith([
      {
        seq: 1,
        winnerId: 'a',
        entries: { b: { kind: 'points', points: 60 }, c: { kind: 'points', points: 60 } },
      },
    ]);
    render(<ResultCard state={state} names={names} />);
    expect(screen.getByRole('heading', { name: 'Asha' })).toBeInTheDocument();
    expect(screen.getByText('+$20')).toBeInTheDocument();
    expect(screen.getAllByText('−$10')).toHaveLength(2);
    // Bo and Cy each pay Asha $10.
    expect(screen.getAllByText(/pays/, { selector: 'li' })).toHaveLength(2);
  });

  it('shows nothing while the game is still going', () => {
    const { container } = render(<ResultCard state={stateWith()} names={names} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ErrorBoundary', () => {
  it('shows a message instead of a blank page when a screen crashes', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Boom(): never {
      throw new Error('kaboom');
    }
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());
    expect(screen.getByText('kaboom')).toBeInTheDocument();
    spy.mockRestore();
  });
});
