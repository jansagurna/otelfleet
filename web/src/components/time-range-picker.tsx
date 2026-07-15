import { TIME_RANGES, RANGE_LABEL, type TimeRange } from '@/lib/time-range'
import { cn } from '@/lib/utils'

/**
 * Segmented preset picker (1h / 6h / 24h / 7d). Sits in the one filter row
 * above the content it scopes; the selected value lives in the URL.
 */
export function TimeRangePicker({
  value,
  onChange,
}: {
  value: TimeRange
  onChange: (range: TimeRange) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Time range"
      className="inline-flex h-8 items-center gap-0.5 rounded-md border border-line bg-surface p-0.5"
    >
      {TIME_RANGES.map((range) => (
        <button
          key={range}
          type="button"
          role="radio"
          aria-checked={range === value}
          title={RANGE_LABEL[range]}
          onClick={() => onChange(range)}
          className={cn(
            'h-6.5 cursor-pointer rounded px-2.5 font-mono text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/70',
            range === value ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {range}
        </button>
      ))}
    </div>
  )
}
