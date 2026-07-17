import type { ThroughputPoint } from '@/api/generated'

/** Parse a step string ("60s", "5m", "1h", "6h") into seconds. */
export function stepSeconds(step: string): number {
  const match = /^(\d+)([smh])$/.exec(step)
  if (match === null) return 60
  const value = Number(match[1])
  switch (match[2]) {
    case 's':
      return value
    case 'm':
      return value * 60
    default:
      return value * 3600
  }
}

/**
 * Total items over a window: points carry items/s averaged over the step,
 * so each point contributes rate * step seconds.
 */
export function seriesTotal(points: ThroughputPoint[], stepSec: number): number {
  return points.reduce((sum, point) => sum + point.value * stepSec, 0)
}

/**
 * Percentage change vs the previous period; null when the previous period
 * had no volume (a delta against zero is meaningless, not +Inf%).
 */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}
