import { PRESETS, type CustomDates, type Preset } from '../../lib/stats';
import { cx } from '../../ui';

/** One row of time filters above the stats. Applies to the table and both charts. */
export function FilterBar({
  preset,
  custom,
  backwards,
  onPreset,
  onCustom,
}: {
  preset: Preset;
  custom: CustomDates;
  backwards: boolean;
  onPreset: (preset: Preset) => void;
  onCustom: (custom: CustomDates) => void;
}) {
  return (
    <div className="space-y-2">
      <div role="group" aria-label="Time range" className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={preset === p.id}
            onClick={() => onPreset(p.id)}
            className={cx(
              'rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors',
              preset === p.id
                ? 'bg-emerald-700 text-white ring-emerald-700'
                : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">From</span>
            <input
              type="date"
              value={custom.from}
              max={custom.to || undefined}
              onChange={(e) => onCustom({ ...custom, from: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">To</span>
            <input
              type="date"
              value={custom.to}
              min={custom.from || undefined}
              onChange={(e) => onCustom({ ...custom, to: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
          </label>
        </div>
      )}
      {backwards && (
        <p role="alert" className="text-sm text-red-700">
          The end date is before the start date.
        </p>
      )}
    </div>
  );
}
