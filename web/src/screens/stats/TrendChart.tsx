import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '../../lib/stats';
import { Card, money } from '../../ui';

/**
 * The eight categorical colours, in fixed order. They pass the palette checks for adjacent series
 * (colour-blind separation and normal-vision distance). Three of them are light on white, so every
 * chart also has a legend, direct labels for small groups, and a table view.
 */
export const SERIES_COLORS = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
];

const INK = '#52514e';
const MUTED = '#898781';
const GRID = '#e1e0d9';
const AXIS = '#c3c2b7';
const SURFACE = '#ffffff';

/** With this many series or fewer, each line is also labelled at its end. */
const DIRECT_LABEL_LIMIT = 4;

export type Metric = 'net' | 'wins';

const format = (metric: Metric, value: number) => (metric === 'net' ? money(value) : String(value));

const dateLabel = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

interface Props {
  title: string;
  description: string;
  metric: Metric;
  points: TrendPoint[];
  /** Players to draw, each with the colour slot they keep whatever the time range. */
  series: { id: string; name: string; slot: number }[];
}

type Row = { game: number; at: number } & Record<string, number | undefined>;

function TooltipBox({
  active,
  label,
  rows,
  metric,
  series,
}: {
  active?: boolean;
  label?: number | string;
  rows: Row[];
  metric: Metric;
  series: Props['series'];
}) {
  if (!active || typeof label !== 'number') return null;
  const row = rows.find((r) => r.game === label);
  if (!row) return null;
  const entries = series
    .map((s) => ({ ...s, value: row[s.id] }))
    .filter((e): e is typeof e & { value: number } => e.value !== undefined)
    .sort((a, b) => b.value - a.value);
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-slate-200">
      <p className="mb-1 font-medium text-slate-900">
        Game {row.game} · {dateLabel(row.at)}
      </p>
      <ul className="space-y-0.5">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-4 text-slate-700">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[e.slot] }}
              />
              {e.name}
            </span>
            <span className="tabular-nums">{format(metric, e.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Running totals over the games in the range, one line per player, on a single axis. */
export function TrendChart({ title, description, metric, points, series }: Props) {
  const rows: Row[] = points.map((p) => ({
    game: p.game,
    at: p.at,
    ...Object.fromEntries(series.map((s) => [s.id, p[metric][s.id]])),
  }));
  const direct = series.length <= DIRECT_LABEL_LIMIT;
  const lastGame = points.at(-1)?.game ?? 0;

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-slate-600">{description}</p>
      </div>

      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700" aria-label="Legend">
          {series.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[s.slot] }}
              />
              {s.name}
            </li>
          ))}
        </ul>
      )}

      <div role="img" aria-label={`${title}: ${description}`} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: direct ? 56 : 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="game"
              type="number"
              domain={[1, Math.max(lastGame, 2)]}
              allowDecimals={false}
              tickLine={false}
              axisLine={{ stroke: AXIS }}
              tick={{ fill: MUTED, fontSize: 12 }}
              tickFormatter={(g: number) => `#${g}`}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: MUTED, fontSize: 12 }}
              tickFormatter={(v: number) => format(metric, v).replace('+', '')}
            />
            {metric === 'net' && <ReferenceLine y={0} stroke={AXIS} />}
            <Tooltip
              cursor={{ stroke: MUTED, strokeDasharray: '3 3' }}
              content={(p) => (
                <TooltipBox
                  active={p.active}
                  label={p.label as number | string | undefined}
                  rows={rows}
                  metric={metric}
                  series={series}
                />
              )}
            />
            {series.map((s) => {
              const color = SERIES_COLORS[s.slot]!;
              return (
                <Line
                  key={s.id}
                  dataKey={s.id}
                  name={s.name}
                  stroke={color}
                  strokeWidth={2}
                  type={metric === 'wins' ? 'stepAfter' : 'linear'}
                  isAnimationActive={false}
                  connectNulls={false}
                  dot={{ r: 4, fill: color, stroke: SURFACE, strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: color, stroke: SURFACE, strokeWidth: 2 }}
                  label={
                    direct
                      ? (p: { x?: number; y?: number; index?: number }) =>
                          p.index === rows.length - 1 && p.x !== undefined && p.y !== undefined ? (
                            <text key={s.id} x={p.x + 10} y={p.y} dy={4} fontSize={12} fill={INK}>
                              {s.name}
                            </text>
                          ) : (
                            <g key={`${s.id}-${p.index}`} />
                          )
                      : false
                  }
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-slate-800">Show as a table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="py-1 pr-3">
                  Game
                </th>
                {series.map((s) => (
                  <th key={s.id} scope="col" className="px-2 py-1 text-right">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.game} className="border-t border-slate-100">
                  <th scope="row" className="whitespace-nowrap py-1 pr-3 font-normal">
                    #{r.game} · {dateLabel(r.at)}
                  </th>
                  {series.map((s) => (
                    <td key={s.id} className="px-2 py-1 text-right tabular-nums">
                      {r[s.id] === undefined ? '–' : format(metric, r[s.id]!)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
