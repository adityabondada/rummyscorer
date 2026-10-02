import type { ReactNode } from 'react';
const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

/** The four suits, drawn as flat shapes so they scale cleanly and cost nothing to load. */
export type SuitKind = 'spade' | 'heart' | 'diamond' | 'club';

export const SUITS: SuitKind[] = ['spade', 'heart', 'diamond', 'club'];

const RED = '#dc2626';
const INK = '#1e293b';
const MUTED = '#cbd5e1';

export const suitColor = (kind: SuitKind) => (kind === 'heart' || kind === 'diamond' ? RED : INK);

/** The suit's shape on a 24 by 24 grid. Used inside any svg, so it can be placed and rotated freely. */
export function SuitShape({ kind, fill }: { kind: SuitKind; fill: string }): ReactNode {
  switch (kind) {
    case 'heart':
      return (
        <path
          fill={fill}
          d="M12 21.5C12 21.5 3 15.5 3 9.5C3 6.5 5.3 4.5 7.8 4.5C9.6 4.5 11.2 5.5 12 7C12.8 5.5 14.4 4.5 16.2 4.5C18.7 4.5 21 6.5 21 9.5C21 15.5 12 21.5 12 21.5Z"
        />
      );
    case 'diamond':
      return <path fill={fill} d="M12 2L19.5 12L12 22L4.5 12Z" />;
    case 'spade':
      return (
        <path
          fill={fill}
          d="M12 2C12 2 3 9 3 14C3 17 5.5 19 8 19C9.5 19 10.8 18.3 11.5 17.2C11.4 19.5 10.5 21 9 22H15C13.5 21 12.6 19.5 12.5 17.2C13.2 18.3 14.5 19 16 19C18.5 19 21 17 21 14C21 9 12 2 12 2Z"
        />
      );
    case 'club':
      return (
        <g fill={fill}>
          <circle cx="12" cy="7.5" r="4.6" />
          <circle cx="6.8" cy="14.2" r="4.6" />
          <circle cx="17.2" cy="14.2" r="4.6" />
          <path d="M12 11L10.6 14C10.6 18 9.8 20.3 8.2 22H15.8C14.2 20.3 13.4 18 13.4 14Z" />
        </g>
      );
  }
}

interface SuitProps {
  kind: SuitKind;
  size?: number;
  /** Greyed out, for something that is switched off or finished. */
  muted?: boolean;
  className?: string;
}

/** One suit symbol. Decorative, so it is hidden from screen readers. */
export function Suit({ kind, size = 16, muted = false, className }: SuitProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cx('inline-block shrink-0', className)}
      data-suit={kind}
    >
      <SuitShape kind={kind} fill={muted ? MUTED : suitColor(kind)} />
    </svg>
  );
}

/** All four suits in a row, as a quiet decoration. */
export function SuitRow({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cx('inline-flex items-center gap-1.5', className)}>
      {SUITS.map((kind) => (
        <Suit key={kind} kind={kind} size={size} />
      ))}
    </span>
  );
}

/** A loading indicator: the four suits light up one after another. */
export function SuitSpinner({ size = 22 }: { size?: number }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-2">
      {SUITS.map((kind, i) => (
        <span key={kind} className="suit-spinner-step" style={{ animationDelay: `${i * 0.18}s` }}>
          <Suit kind={kind} size={size} />
        </span>
      ))}
    </span>
  );
}

/** A friendly empty screen: the suits, a heading that invites, and one line of explanation. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-4 py-8 text-center shadow-sm ring-1 ring-slate-200">
      <SuitRow size={22} />
      <h2 className="mt-1 font-semibold text-slate-900">{title}</h2>
      {children && <p className="max-w-xs text-sm text-slate-600">{children}</p>}
    </div>
  );
}
