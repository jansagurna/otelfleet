const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const plain = new Intl.NumberFormat('en-US')

/** 1284 -> "1.3K", 4200000 -> "4.2M" */
export function formatCompact(value: number): string {
  return compact.format(value)
}

/** Thousands-comma'd integer. */
export function formatNumber(value: number): string {
  return plain.format(value)
}

/** Items-per-second rate: sub-1 keeps 2 decimals, otherwise compact. */
export function formatRate(value: number): string {
  if (value === 0) return '0'
  if (value < 1) return value.toFixed(2)
  if (value < 1000) return value >= 100 ? Math.round(value).toString() : value.toFixed(1)
  return compact.format(value)
}

const dateTime = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dateOnly = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

export function formatDate(iso: string): string {
  return dateOnly.format(new Date(iso))
}

/** "just now", "4m ago", "3h ago", "2d ago" — falls back to the date. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const deltaMs = now.getTime() - new Date(iso).getTime()
  if (deltaMs < 60_000) return 'just now'
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d ago`
  return dateOnly.format(new Date(iso))
}
