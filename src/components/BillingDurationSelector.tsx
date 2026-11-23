import { Minus, Plus, SlidersHorizontal } from 'lucide-react';
import { clampMonths, type BillingPreset } from '../lib/pricing';

interface BillingDurationSelectorProps {
  preset: BillingPreset;
  months: number;
  onSelectPreset: (nextPreset: BillingPreset, nextMonths: number) => void;
  onChangeCustomMonths: (nextMonths: number) => void;
}

const PRESET_OPTIONS: { id: BillingPreset; label: string; months?: number; note?: string }[] = [
  { id: '1', label: '1 Month', months: 1 },
  { id: '2', label: '2 Months', months: 2 },
  { id: '3', label: '3 Months', months: 3 },
  { id: '12', label: '1 Year', months: 12, note: 'Save ~31%' },
  { id: 'custom', label: 'Customize' },
];

export function BillingDurationSelector({
  preset,
  months,
  onSelectPreset,
  onChangeCustomMonths,
}: BillingDurationSelectorProps) {
  const safeMonths = clampMonths(months);

  return (
    <div className="space-y-3">
      {/* Main Segmented Duration Bar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-[#0B0F0C] p-1.5">
        {PRESET_OPTIONS.map((opt) => {
          const active = preset === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                if (opt.id === 'custom') {
                  onSelectPreset('custom', safeMonths === 12 ? 6 : safeMonths);
                } else {
                  onSelectPreset(opt.id, opt.months!);
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#22C55E] text-[#050705] font-semibold'
                  : 'text-[#9AA69D] hover:bg-white/[0.04] hover:text-[#F4F7F4]'
              }`}
            >
              {opt.id === 'custom' && <SlidersHorizontal className="h-3.5 w-3.5" />}
              <span>{opt.label}</span>
              {opt.note && (
                <span
                  className={`font-mono text-[10px] ${
                    active ? 'text-[#050705]/80 font-bold' : 'text-[#4ADE80]'
                  }`}
                >
                  {opt.note}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Expandable Custom Month Picker */}
      {preset === 'custom' && (
        <div className="rounded-xl border border-[#22C55E]/30 bg-[#0B0F0C] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-[#4ADE80]">Custom Billing Duration</p>
              <p className="mt-0.5 text-xs text-[#9AA69D]">
                Choose how many months to prepay — longer durations automatically lower your
                monthly rate.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChangeCustomMonths(clampMonths(safeMonths - 1))}
                disabled={safeMonths <= 1}
                aria-label="Decrease months"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-[#060807] text-[#E6ECE7] transition-colors hover:border-white/25 disabled:opacity-40"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-[96px] rounded-lg border border-white/10 bg-[#060807] px-3 py-1.5 text-center font-mono text-xs font-semibold text-[#F4F7F4] tabular-nums">
                {safeMonths} {safeMonths === 1 ? 'month' : 'months'}
              </div>
              <button
                type="button"
                onClick={() => onChangeCustomMonths(clampMonths(safeMonths + 1))}
                disabled={safeMonths >= 12}
                aria-label="Increase months"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-[#060807] text-[#E6ECE7] transition-colors hover:border-white/25 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-4">
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              value={safeMonths}
              onChange={(e) => onChangeCustomMonths(Number(e.target.value))}
              aria-label="Select number of billing months"
              className="w-full accent-[#22C55E] cursor-pointer"
            />
            <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-[#7E8C81]">
              {[1, 2, 3, 6, 9, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChangeCustomMonths(m)}
                  className={`transition-colors hover:text-[#F4F7F4] ${
                    safeMonths === m ? 'font-semibold text-[#4ADE80]' : ''
                  }`}
                >
                  {m === 12 ? '12m (Best)' : `${m}m`}
                </button>
              ))}
            </div>
          </div>

          {safeMonths >= 10 && safeMonths < 12 && (
            <p className="mt-3 text-xs text-[#4ADE80]">
              Tip: Select 12 months to lock in the lowest annual rate (save up to 33% vs. paying
              monthly).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
