import type { CustomerCost } from '@/api/generated'

/** Chart keeps at most this many customer series; the rest fold into "other". */
export const MAX_COST_SERIES = 8

/** Synthetic id for the aggregate bucket — never collides with a UUID. */
export const OTHER_BUCKET_ID = '__other__'

/** Volume rank: bytes first, items as the pre-v0.5 tiebreak (bytes=0 era). */
export function rankCustomers(customers: CustomerCost[]): CustomerCost[] {
  return [...customers].sort(
    (a, b) => b.bytes - a.bytes || b.items - a.items || a.name.localeCompare(b.name),
  )
}

/**
 * Top-N customers for the stacked chart plus an aggregated "other" bucket
 * (per-day sums across the remainder). `other` is null when everything fits.
 */
export function bucketCustomers(
  customers: CustomerCost[],
  max: number = MAX_COST_SERIES,
): { top: CustomerCost[]; other: CustomerCost | null } {
  const ranked = rankCustomers(customers)
  if (ranked.length <= max) return { top: ranked, other: null }

  const top = ranked.slice(0, max)
  const rest = ranked.slice(max)

  const byDate = new Map<string, { items: number; bytes: number }>()
  let items = 0
  let bytes = 0
  for (const customer of rest) {
    items += customer.items
    bytes += customer.bytes
    for (const day of customer.days) {
      const bucket = byDate.get(day.date) ?? { items: 0, bytes: 0 }
      bucket.items += day.items
      bucket.bytes += day.bytes
      byDate.set(day.date, bucket)
    }
  }

  return {
    top,
    other: {
      customerId: OTHER_BUCKET_ID,
      name: `Other (${rest.length})`,
      items,
      bytes,
      days: [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, sums]) => ({ date, ...sums })),
    },
  }
}

/** Sorted union of all day buckets — the chart's shared category axis. */
export function unionDates(customers: CustomerCost[]): string[] {
  const dates = new Set<string>()
  for (const customer of customers) {
    for (const day of customer.days) dates.add(day.date)
  }
  return [...dates].sort((a, b) => a.localeCompare(b))
}

export function costTotals(customers: CustomerCost[]): {
  items: number
  bytes: number
  top: CustomerCost | null
} {
  const items = customers.reduce((sum, c) => sum + c.items, 0)
  const bytes = customers.reduce((sum, c) => sum + c.bytes, 0)
  const ranked = rankCustomers(customers)
  return { items, bytes, top: ranked[0] ?? null }
}
