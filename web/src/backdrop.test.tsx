// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { CardBackdrop, NumberCard, RANKS } from './backdrop';
import { SUITS } from './suits';
import { Button } from './ui';

afterEach(cleanup);

describe('number cards', () => {
  it('cover 2 to 10', () => {
    expect(RANKS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it.each(RANKS)('put %i pips on the card', (rank) => {
    const { container } = render(<NumberCard rank={rank} suit="heart" />);
    // Every pip is one suit shape; the two corner marks add two more.
    expect(container.querySelectorAll('path, circle')).toHaveLength(rank + 2);
  });

  it('draw in the colour of the suit', () => {
    for (const suit of SUITS) {
      const { container } = render(<NumberCard rank={5} suit={suit} />);
      const red = suit === 'heart' || suit === 'diamond';
      const fills = [...container.querySelectorAll('path, circle')].map((n) =>
        n.closest('[fill]')?.getAttribute('fill'),
      );
      expect(new Set(fills)).toEqual(new Set([red ? '#dc2626' : '#1e293b']));
      cleanup();
    }
  });
});

describe('the card backdrop', () => {
  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <CardBackdrop />
      </MemoryRouter>,
    );

  it('sits behind the page, takes no taps and is hidden from screen readers', () => {
    at('/l/L1');
    const backdrop = screen.getByTestId('card-backdrop');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop.className).toContain('pointer-events-none');
    expect(backdrop.className).toContain('-z-10');
    expect(backdrop.children.length).toBeGreaterThanOrEqual(4);
  });

  it('is left out on the game screen so the scores have the room', () => {
    at('/l/L1/g/G1');
    expect(screen.queryByTestId('card-backdrop')).not.toBeInTheDocument();
  });

  it('shows on the other screens', () => {
    for (const path of ['/', '/l/L1', '/l/L1/stats', '/l/L1/new-game']) {
      at(path);
      expect(screen.getByTestId('card-backdrop')).toBeInTheDocument();
      cleanup();
    }
  });
});

describe('button colour', () => {
  it('is black for the main button, not green', () => {
    render(<Button>Start game</Button>);
    const cls = screen.getByRole('button', { name: 'Start game' }).className;
    expect(cls).toContain('bg-slate-900');
    expect(cls).not.toContain('emerald');
  });
});
