import { simplifyTransfers, summarize, type GameState } from '@rummy/engine';
import { Badge, Card, money } from '../../ui';

const ordinal = (n: number) =>
  `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

/** The result of a finished game: who won, what each player nets, and who pays whom. */
export function ResultCard({ state, names }: { state: GameState; names: Record<string, string> }) {
  const summary = summarize(state);
  if (!summary) return null;
  const nameOf = (id: string) => names[id] ?? '?';
  const winners = summary.winnerIds.map(nameOf).join(' & ');
  const transfers = simplifyTransfers(summary.net);
  const order = [...state.seatOrder].sort(
    (a, b) => summary.positions[a]! - summary.positions[b]! || summary.net[b]! - summary.net[a]!,
  );

  return (
    <Card className="space-y-3 ring-emerald-600">
      <div>
        <p className="text-sm text-slate-500">
          {summary.outcome === 'split' ? 'Split pot' : 'Winner'}
        </p>
        <h2 className="text-xl font-semibold">{winners}</h2>
        <p className="text-sm text-slate-600">
          {summary.outcome === 'split' ? 'Shared the' : 'Takes the'} ${summary.pot} pot after{' '}
          {summary.rounds} round
          {summary.rounds === 1 ? '' : 's'}.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-1">Player</th>
            <th className="py-1 text-right">Paid in</th>
            <th className="py-1 text-right">Won</th>
            <th className="py-1 text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {order.map((id) => (
            <tr key={id} className="border-t border-slate-100">
              <td className="py-1.5">
                {nameOf(id)}{' '}
                <span className="text-xs text-slate-500">
                  {summary.positions[id] === 1 ? (
                    <Badge tone="green">
                      {summary.outcome === 'split' ? 'Shared win' : 'Winner'}
                    </Badge>
                  ) : (
                    ordinal(summary.positions[id]!)
                  )}
                </span>
              </td>
              <td className="py-1.5 text-right tabular-nums">
                ${state.players[id]!.buyIns * state.settings.buyIn}
              </td>
              <td className="py-1.5 text-right tabular-nums">${summary.payouts[id] ?? 0}</td>
              <td
                className={`py-1.5 text-right font-medium tabular-nums ${
                  summary.net[id]! < 0 ? 'text-red-700' : 'text-emerald-700'
                }`}
              >
                {money(summary.net[id]!)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {transfers.length > 0 && (
        <div className="rounded-lg bg-slate-50 p-3">
          <h3 className="mb-1 text-sm font-semibold">Settling up</h3>
          <ul className="space-y-0.5 text-sm">
            {transfers.map((t) => (
              <li key={`${t.from}-${t.to}`}>
                <strong>{nameOf(t.from)}</strong> pays <strong>{nameOf(t.to)}</strong> ${t.amount}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
