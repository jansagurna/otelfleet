import { SIGNAL_COLOR, SIGNAL_LABEL, SIGNALS } from '@/lib/chart-theme'
import { useTheme } from '@/lib/theme'
import { Badge } from '@/components/ui/badge'
import type { Signal } from '@/api/generated'

/** Signal chip with its fixed system color as the identity dot. */
export function SignalBadge({ signal }: { signal: Signal }) {
  const { theme } = useTheme()
  return (
    <Badge>
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ background: SIGNAL_COLOR[signal][theme] }}
      />
      {SIGNAL_LABEL[signal]}
    </Badge>
  )
}

/** Row of signal badges in canonical logs/traces/metrics order. */
export function SignalBadges({ signals }: { signals: Signal[] }) {
  const present = SIGNALS.filter((s) => signals.includes(s))
  if (present.length === 0) return <span className="text-xs text-ink-3">none</span>
  return (
    <span className="inline-flex flex-wrap gap-1">
      {present.map((signal) => (
        <SignalBadge key={signal} signal={signal} />
      ))}
    </span>
  )
}
