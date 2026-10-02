import type { CSSProperties } from 'react';
import { SUITS, SuitShape, suitColor, type SuitKind } from './suits';

/** Each card slides out sideways and tilts a little, so every suit stays fully in view. */
const CARDS: { suit: SuitKind; angle: number; dx: number; dy: number }[] = [
  { suit: 'spade', angle: -11, dx: -87, dy: 9 },
  { suit: 'heart', angle: -4, dx: -29, dy: 0 },
  { suit: 'diamond', angle: 4, dx: 29, dy: 0 },
  { suit: 'club', angle: 11, dx: 87, dy: 9 },
];

/** One ace, drawn flat: rank and small suit in two corners, the big suit in the middle. */
function Ace({ suit }: { suit: SuitKind }) {
  const color = suitColor(suit);
  return (
    <>
      <rect
        x="84"
        y="30"
        width="72"
        height="108"
        rx="9"
        fill="#ffffff"
        stroke="#cbd5e1"
        strokeWidth="1.5"
      />
      <text
        x="92"
        y="50"
        fontSize="16"
        fontWeight="600"
        fill={color}
        fontFamily="system-ui, sans-serif"
      >
        A
      </text>
      <g transform="translate(91 54) scale(0.55)">
        <SuitShape kind={suit} fill={color} />
      </g>
      <g transform="translate(94 59) scale(2.3)">
        <SuitShape kind={suit} fill={color} />
      </g>
      <g transform="rotate(180 120 84)">
        <text
          x="92"
          y="50"
          fontSize="16"
          fontWeight="600"
          fill={color}
          fontFamily="system-ui, sans-serif"
        >
          A
        </text>
        <g transform="translate(91 54) scale(0.55)">
          <SuitShape kind={suit} fill={color} />
        </g>
      </g>
    </>
  );
}

/** The picture at the top of the sign-in screen. The cards fan out once when the page opens. */
export function SignInArt() {
  return (
    <div className="float-slow mx-auto w-64 sm:w-80">
      <svg
        viewBox="-20 0 280 196"
        role="img"
        aria-label="Four playing cards fanned out: the ace of each suit"
        className="h-auto w-full"
      >
        <circle cx="120" cy="106" r="96" fill="#ecfdf5" />
        {CARDS.map(({ suit, angle, dx, dy }, i) => (
          <g
            key={suit}
            className="fan-card"
            style={
              {
                '--fan': `${angle}deg`,
                '--dx': `${dx}px`,
                '--dy': `${dy}px`,
                '--delay': `${i * 0.07}s`,
              } as CSSProperties
            }
          >
            <Ace suit={suit} />
          </g>
        ))}
        {SUITS.map((suit, i) => (
          <g key={`dot-${suit}`} transform={`translate(${72 + i * 28} 176) scale(0.7)`}>
            <SuitShape kind={suit} fill={suitColor(suit)} />
          </g>
        ))}
      </svg>
    </div>
  );
}
