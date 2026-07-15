export const TIME_RANGES = ['1h', '6h', '24h', '7d'] as const

export type TimeRange = (typeof TIME_RANGES)[number]

export const DEFAULT_TIME_RANGE: TimeRange = '24h'

export function isTimeRange(value: unknown): value is TimeRange {
  return typeof value === 'string' && (TIME_RANGES as readonly string[]).includes(value)
}

/** Parse an untyped URL search value into a TimeRange, falling back safely. */
export function parseTimeRange(
  value: unknown,
  fallback: TimeRange = DEFAULT_TIME_RANGE,
): TimeRange {
  return isTimeRange(value) ? value : fallback
}

const HOUR_MS = 3_600_000

export const RANGE_DURATION_MS: Record<TimeRange, number> = {
  '1h': HOUR_MS,
  '6h': 6 * HOUR_MS,
  '24h': 24 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
}

/** Chart resolution per range — keeps point counts in the 60–170 band. */
export const RANGE_STEP: Record<TimeRange, string> = {
  '1h': '60s',
  '6h': '5m',
  '24h': '15m',
  '7d': '1h',
}

export const RANGE_LABEL: Record<TimeRange, string> = {
  '1h': 'Last hour',
  '6h': 'Last 6 hours',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
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
