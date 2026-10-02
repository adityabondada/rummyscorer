import type { GameState } from '@rummy/engine';
import { dropsLabel } from '../../lib/roundEntry';
import { Badge, Card, cx } from '../../ui';

export function ScoreBoard({ state, names }: { state: GameState; names: Record<string, string> }) {
  const { settings } = state;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Player</th>
            <th className="px-3 py-2 text-right">Score</th>
            <th className="px-3 py-2 text-right">Drops</th>
          </tr>
        </thead>
        <tbody>
          {state.seatOrder.map((id) => {
            const p = state.players[id]!;
            return (
              <tr
                key={id}
                className={cx('border-t border-slate-100', !p.active && 'text-slate-400')}
              >
                <td className="px-3 py-2">
                  <span className={cx('font-medium', !p.active && 'line-through')}>
                    {names[id] ?? '?'}
                  </span>
                  <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                    {id === state.dealerId && <Badge tone="green">Deals</Badge>}
                    {id === state.firstPlayerId && <Badge>Plays first</Badge>}
                    {!p.active && <Badge tone="red">Out</Badge>}
                    {p.rejoins > 0 && (
                      <Badge tone="amber">Rejoined{p.rejoins > 1 ? ` ×${p.rejoins}` : ''}</Badge>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className="font-semibold">{p.total}</span>
                  <span className="text-xs text-slate-400"> / {settings.limit}</span>
                </td>
                <td className="px-3 py-2 text-right text-xs">
                  {p.active ? dropsLabel(state, id) : '–'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
        Pot ${state.pot} · {state.rounds.length} round{state.rounds.length === 1 ? '' : 's'} played
      </p>
    </Card>
  );
}
