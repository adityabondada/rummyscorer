import { useMatch } from 'react-router-dom';
import { SuitShape, suitColor, type SuitKind } from './suits';

/** A pip's place on a card that is 100 wide and 140 tall, as [column, row]. */
type Pip = [number, number];

const L = 31;
const C = 50;
const R = 69;
const TOP = 30;
const BOTTOM = 110;
const MID = 70;

/* Where each rank puts its pips, laid out like a real deck. */
const LAYOUTS: Record<number, Pip[]> = {
  2: [
    [C, TOP],
    [C, BOTTOM],
  ],
  3: [
    [C, TOP],
    [C, MID],
    [C, BOTTOM],
  ],
  4: [
    [L, TOP],
    [R, TOP],
    [L, BOTTOM],
    [R, BOTTOM],
  ],
  5: [
    [L, TOP],
    [R, TOP],
    [C, MID],
    [L, BOTTOM],
    [R, BOTTOM],
  ],
  6: [
    [L, TOP],
    [R, TOP],
    [L, MID],
    [R, MID],
    [L, BOTTOM],
    [R, BOTTOM],
  ],
  7: [
    [L, TOP],
    [R, TOP],
    [C, 50],
    [L, MID],
    [R, MID],
    [L, BOTTOM],
    [R, BOTTOM],
  ],
  8: [
    [L, TOP],
    [R, TOP],
    [C, 50],
    [L, MID],
    [R, MID],
    [C, 90],
    [L, BOTTOM],
    [R, BOTTOM],
  ],
  9: [
    [L, TOP],
    [R, TOP],
    [L, 56],
    [R, 56],
    [C, MID],
    [L, 84],
    [R, 84],
    [L, BOTTOM],
    [R, BOTTOM],
  ],
  10: [
    [L, TOP],
    [R, TOP],
    [C, 44],
    [L, 56],
    [R, 56],
    [L, 84],
    [R, 84],
    [C, 96],
    [L, BOTTOM],
    [R, BOTTOM],
  ],
};

export const RANKS = Object.keys(LAYOUTS).map(Number);

const PIP = 15;

/** A number card, 2 to 10, with its pips and corner marks. Pips in the lower half are upside down. */
export function NumberCard({ rank, suit }: { rank: number; suit: SuitKind }) {
  const color = suitColor(suit);
  const pips = LAYOUTS[rank] ?? [];
  const corner = (
    <g>
      <text
        x="7"
        y="19"
        fontSize="15"
        fontWeight="600"
        fontFamily="Georgia, serif"
        fill={color}
        textAnchor="start"
      >
        {rank}
      </text>
      <g transform="translate(6 23) scale(0.5)">
        <SuitShape kind={suit} fill={color} />
      </g>
    </g>
  );
  return (
    <svg viewBox="0 0 100 140" aria-hidden="true" focusable="false" className="h-full w-full">
      <rect x="1.5" y="1.5" width="97" height="137" rx="9" fill="#fff" stroke="#94a3b8" />
      {corner}
      <g transform="rotate(180 50 70)">{corner}</g>
      {pips.map(([x, y], i) => (
        <g
          key={i}
          transform={`translate(${x} ${y}) ${y > MID ? 'rotate(180)' : ''} translate(${-PIP / 2} ${-PIP / 2}) scale(${PIP / 24})`}
        >
          <SuitShape kind={suit} fill={color} />
        </g>
      ))}
    </svg>
  );
}

/** A hand dealt around the edges of the screen. Fixed, so it always looks the same. */
const HAND: { rank: number; suit: SuitKind; className: string; rotate: number }[] = [
  { rank: 7, suit: 'heart', className: 'left-[-1.5rem] top-[6%]', rotate: -16 },
  { rank: 3, suit: 'spade', className: 'right-[-1.25rem] top-[22%]', rotate: 13 },
  { rank: 10, suit: 'diamond', className: 'left-[-1.75rem] top-[52%]', rotate: 11 },
  { rank: 5, suit: 'club', className: 'right-[-1.5rem] top-[68%]', rotate: -12 },
  { rank: 9, suit: 'spade', className: 'left-[3%] bottom-[-3rem]', rotate: -8 },
  { rank: 4, suit: 'diamond', className: 'right-[4%] top-[-2.5rem]', rotate: 9 },
];

/**
 * Faint number cards behind the page, kept to the edges. They sit under everything, so they never
 * take a tap. Left out on the game screen, where the numbers need all the room.
 */
export function CardBackdrop() {
  const onGameScreen = useMatch('/l/:leagueId/g/:gameId');
  if (onGameScreen) return null;
  return (
    <div
      data-testid="card-backdrop"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {HAND.map((card, i) => (
        <div
          key={i}
          className={`absolute h-32 w-[5.75rem] opacity-[0.22] sm:h-40 sm:w-28 ${card.className}`}
          style={{ transform: `rotate(${card.rotate}deg)` }}
        >
          <NumberCard rank={card.rank} suit={card.suit} />
        </div>
      ))}
    </div>
  );
}
