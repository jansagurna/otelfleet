/**
 * OTel SeverityNumber helpers. The read path stores the raw SeverityNumber
 * (1-24) alongside the SeverityText; the log table colors its chip by the
 * number range so severity reads consistently even when text is missing or
 * non-standard.
 */

/** Chip tone — maps to the log table's severity chip styling. */
export type SeverityTone = 'error' | 'warn' | 'info' | 'muted'

export interface SeverityMeta {
  label: string
  tone: SeverityTone
}

/** SeverityNumber → chip tone, using the OTel range boundaries. */
export function severityTone(severityNumber: number): SeverityTone {
  if (severityNumber >= 17) return 'error' // ERROR 17-20, FATAL 21-24
  if (severityNumber >= 13) return 'warn' // WARN 13-16
  if (severityNumber >= 9) return 'info' // INFO 9-12
  return 'muted' // DEBUG 5-8, TRACE 1-4, UNSPECIFIED 0
}

/** Fallback label derived from the number when SeverityText is absent. */
export function severityLabel(severityNumber: number): string {
  if (severityNumber >= 21) return 'FATAL'
  if (severityNumber >= 17) return 'ERROR'
  if (severityNumber >= 13) return 'WARN'
  if (severityNumber >= 9) return 'INFO'
  if (severityNumber >= 5) return 'DEBUG'
  if (severityNumber >= 1) return 'TRACE'
  return 'UNSET'
}

/**
 * Resolve the chip's label + tone for a record. Prefer the emitted
 * SeverityText (upper-cased) for the label; always derive tone from the
 * number so a rogue text value can't mis-color the chip.
 */
export function severityMeta(severityNumber: number, severityText?: string | null): SeverityMeta {
  const trimmed = severityText?.trim()
  return {
    label: trimmed ? trimmed.toUpperCase() : severityLabel(severityNumber),
    tone: severityTone(severityNumber),
  }
}

/** Options for the severity `<Select>`. `0` means "no minSeverity filter". */
export const SEVERITY_FILTERS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'All severities' },
  { value: 9, label: 'INFO and above' },
  { value: 13, label: 'WARN and above' },
  { value: 17, label: 'ERROR and above' },
]
