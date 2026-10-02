import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-300',
  secondary:
    'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50 disabled:text-red-300',
  ghost: 'text-emerald-800 hover:bg-emerald-50 disabled:text-slate-400',
};

export function Button({
  variant = 'primary',
  small,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) {
  return (
    <button
      type={type}
      className={cx(
        'rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        small ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200', className)}>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        {...props}
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
      {children}
    </p>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <p className="py-8 text-center text-slate-500">{label}</p>;
}

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: 'slate' | 'green' | 'amber' | 'red';
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
  };
  return (
    <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  );
}

/** A sheet that slides over the page. Closes on Escape or a tap outside. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            aria-label="Close"
            className="px-2 text-2xl leading-none text-slate-500"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Page({
  title,
  back,
  actions,
  children,
}: {
  title: string;
  back?: { to: string; label: string };
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-24 pt-4">
      {back && (
        <Link to={back.to} className="text-sm text-emerald-800 hover:underline">
          ← {back.label}
        </Link>
      )}
      <header className="mb-4 mt-1 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {actions}
      </header>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export const money = (amount: number) =>
  `${amount < 0 ? '−' : amount > 0 ? '+' : ''}$${Math.abs(amount)}`;
