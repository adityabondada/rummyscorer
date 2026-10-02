import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { dragTarget, moveInOrder, moveToIndex, rowShift } from '../lib/newGame';
import { Button, cx } from '../ui';

interface Drag {
  id: string;
  from: number;
  startY: number;
  dy: number;
  over: number;
  /** The distance from one row to the next, so a drag can be turned into a place in the list. */
  step: number;
}

/**
 * The playing line-up, in the order the cards are dealt, rearranged by dragging a row's handle.
 * Rows don't move in the page while a drag is going on: the dragged row follows the finger and the
 * rows it passes slide aside, and the new order is applied on release. That keeps the touch alive
 * on a phone. The handle also takes the up and down arrow keys, for anyone without a pointer.
 */
export function DraggableLineUp({
  order,
  nameOf,
  onChange,
  onRemove,
}: {
  order: string[];
  nameOf: (id: string) => string;
  onChange: (order: string[]) => void;
  onRemove: (id: string) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const set = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const move = (e: globalThis.PointerEvent | MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const count = orderRef.current.length;
      const dy = Math.max(
        -d.from * d.step,
        Math.min((count - 1 - d.from) * d.step, e.clientY - d.startY),
      );
      set({ ...d, dy, over: dragTarget(d.from, dy, d.step, count) });
    };
    const finish = (commit: boolean) => {
      const d = dragRef.current;
      set(null);
      if (commit && d && d.over !== d.from) {
        refocus.current = d.id;
        changeRef.current(moveToIndex(orderRef.current, d.id, d.over));
      }
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && finish(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
    };
  }, [dragging]);

  // Put focus back on the handle that was just used, as the row it belongs to has moved.
  useEffect(() => {
    if (refocus.current) handles.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [order]);

  const start = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const from = order.indexOf(id);
    const here = rows.current.get(id)?.getBoundingClientRect();
    const after = rows.current.get(order[from + 1] ?? '')?.getBoundingClientRect();
    const before = rows.current.get(order[from - 1] ?? '')?.getBoundingClientRect();
    if (!here) return;
    const step = after ? after.top - here.top : before ? here.top - before.top : here.height;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    set({ id, from, startY: e.clientY, dy: 0, over: from, step });
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const next = moveInOrder(order, id, e.key === 'ArrowUp' ? -1 : 1);
    if (next === order) return;
    refocus.current = id;
    onChange(next);
  };

  return (
    <ol className="space-y-2" aria-label="Playing, in dealing order">
      {order.map((id, i) => {
        const isDragged = drag?.id === id;
        const shift = drag && !isDragged ? rowShift(i, drag.from, drag.over) : 0;
        const offset = isDragged ? drag.dy : shift * (drag?.step ?? 0);
        return (
          <li
            key={id}
            ref={(el) => {
              if (el) rows.current.set(id, el);
              else rows.current.delete(id);
            }}
            data-dragging={isDragged || undefined}
            style={drag ? { transform: `translateY(${offset}px)` } : undefined}
            className={cx(
              'relative flex items-center gap-2 rounded-lg bg-slate-100 py-1.5 pl-1.5 pr-2 ring-1',
              isDragged
                ? 'z-10 bg-white shadow-lg ring-slate-900'
                : cx('ring-slate-300', drag && 'transition-transform duration-150'),
            )}
          >
            <button
              type="button"
              ref={(el) => {
                if (el) handles.current.set(id, el);
                else handles.current.delete(id);
              }}
              aria-label={`Reorder ${nameOf(id)}`}
              onPointerDown={(e) => start(e, id)}
              onKeyDown={(e) => onKey(e, id)}
              className={cx(
                'grid h-10 w-10 shrink-0 touch-none select-none place-items-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-800',
                isDragged ? 'cursor-grabbing' : 'cursor-grab',
              )}
            >
              <svg
                width="14"
                height="20"
                viewBox="0 0 14 20"
                aria-hidden="true"
                fill="currentColor"
              >
                {[3, 10].flatMap((x) =>
                  [3, 10, 17].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.7" />),
                )}
              </svg>
            </button>
            <span className="min-w-0 flex-1 select-none truncate">
              {i + 1}. <span className="font-medium">{nameOf(id)}</span>{' '}
              {i === order.length - 1 && order.length > 1 && (
                <span className="text-xs text-slate-500">(deals first)</span>
              )}
            </span>
            <Button
              variant="ghost"
              small
              aria-label={`Remove ${nameOf(id)}`}
              onClick={() => onRemove(id)}
            >
              ×
            </Button>
          </li>
        );
      })}
    </ol>
  );
}
