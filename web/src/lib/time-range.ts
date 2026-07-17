export const TIME_RANGES = ['1h', '6h', '24h', '7d'] as const

/** Superset used by the metrics explorer — adds a 30-day preset. */
export const EXTENDED_TIME_RANGES = ['1h', '6h', '24h', '7d', '30d'] as const

export type TimeRange = (typeof EXTENDED_TIME_RANGES)[number]

export const DEFAULT_TIME_RANGE: TimeRange = '24h'

export function isTimeRange(
  value: unknown,
  ranges: readonly TimeRange[] = TIME_RANGES,
): value is TimeRange {
  return typeof value === 'string' && (ranges as readonly string[]).includes(value)
}

/** Parse an untyped URL search value into a TimeRange, falling back safely. */
export function parseTimeRange(
  value: unknown,
  fallback: TimeRange = DEFAULT_TIME_RANGE,
  ranges: readonly TimeRange[] = TIME_RANGES,
): TimeRange {
  return isTimeRange(value, ranges) ? value : fallback
}

const HOUR_MS = 3_600_000

export const RANGE_DURATION_MS: Record<TimeRange, number> = {
  '1h': HOUR_MS,
  '6h': 6 * HOUR_MS,
  '24h': 24 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
  '30d': 30 * 24 * HOUR_MS,
}

/** Chart resolution per range — keeps point counts in the 60–170 band. */
export const RANGE_STEP: Record<TimeRange, string> = {
  '1h': '60s',
  '6h': '5m',
  '24h': '15m',
  '7d': '1h',
  '30d': '6h',
}

export const RANGE_LABEL: Record<TimeRange, string> = {
  '1h': 'Last hour',
  '6h': 'Last 6 hours',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
}

export interface Interval {
  from: string
  to: string
}

/**
 * Resolve a range to an ISO [from, to] window. `to` is floored to the
 * minute so query keys stay stable between renders.
 */
export function rangeToInterval(range: TimeRange, now: Date = new Date()): Interval {
  const toMs = Math.floor(now.getTime() / 60_000) * 60_000
  return {
    from: new Date(toMs - RANGE_DURATION_MS[range]).toISOString(),
    to: new Date(toMs).toISOString(),
  }
}

/** Seconds covered by a range — used to turn range totals into items/s. */
export function rangeSeconds(range: TimeRange): number {
  return RANGE_DURATION_MS[range] / 1000
}

/**
 * The window immediately before `interval`, same duration — the
 * "vs previous period" comparison window.
 */
export function previousInterval(interval: Interval): Interval {
  const fromMs = new Date(interval.from).getTime()
  const toMs = new Date(interval.to).getTime()
  const durationMs = toMs - fromMs
  return {
    from: new Date(fromMs - durationMs).toISOString(),
    to: new Date(fromMs).toISOString(),
  }
}

/**
 * Shift a previous-period timestamp forward by the window duration so its
 * series overlays the current window on a shared time axis.
 */
export function shiftToCurrentWindow(ts: string, interval: Interval): number {
  const durationMs = new Date(interval.to).getTime() - new Date(interval.from).getTime()
  return new Date(ts).getTime() + durationMs
}
