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

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const

/**
 * Human byte size in binary units: 0 -> "0 B", 1536 -> "1.5 KiB",
 * 3.2e9 -> "3.0 GiB". Two significant-ish digits: <10 keeps one decimal.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const exponent = Math.min(Math.floor(Math.log2(bytes) / 10), BYTE_UNITS.length - 1)
  const value = bytes / 2 ** (10 * exponent)
  const rendered =
    exponent === 0 ? Math.round(value).toString() : value >= 10 ? Math.round(value).toString() : value.toFixed(1)
  return `${rendered} ${BYTE_UNITS[exponent]}`
}

/**
 * Span/trace duration. Sub-second stays in milliseconds ("742 ms"); once a
 * duration reaches a second it humanizes to seconds ("1.24 s", "18.3 s"),
 * and minute-scale spans fold into "m s" ("2m 05s").
 */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1) return '<1 ms'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2)} s`
  const minutes = Math.floor(seconds / 60)
  const rem = Math.round(seconds % 60)
  return `${minutes}m ${rem.toString().padStart(2, '0')}s`
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
