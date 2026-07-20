import { describe, expect, it } from 'vitest'
import {
  severityLabel,
  severityMeta,
  severityTone,
  SEVERITY_FILTERS,
} from '@/features/explore/severity'

describe('severityTone', () => {
  it('maps OTel SeverityNumber ranges to chip tones', () => {
    expect(severityTone(1)).toBe('muted') // TRACE
    expect(severityTone(5)).toBe('muted') // DEBUG
    expect(severityTone(9)).toBe('info') // INFO
    expect(severityTone(12)).toBe('info')
    expect(severityTone(13)).toBe('warn') // WARN
    expect(severityTone(17)).toBe('error') // ERROR
    expect(severityTone(21)).toBe('error') // FATAL
    expect(severityTone(0)).toBe('muted') // UNSPECIFIED
  })
})

describe('severityLabel', () => {
  it('derives a label from the number', () => {
    expect(severityLabel(0)).toBe('UNSET')
    expect(severityLabel(3)).toBe('TRACE')
    expect(severityLabel(6)).toBe('DEBUG')
    expect(severityLabel(9)).toBe('INFO')
    expect(severityLabel(14)).toBe('WARN')
    expect(severityLabel(18)).toBe('ERROR')
    expect(severityLabel(22)).toBe('FATAL')
  })
})

describe('severityMeta', () => {
  it('prefers the emitted text, upper-cased, but keeps number-derived tone', () => {
    expect(severityMeta(17, 'error')).toEqual({ label: 'ERROR', tone: 'error' })
    expect(severityMeta(13, 'Warning')).toEqual({ label: 'WARNING', tone: 'warn' })
  })

  it('falls back to the derived label when text is blank or missing', () => {
    expect(severityMeta(9, '')).toEqual({ label: 'INFO', tone: 'info' })
    expect(severityMeta(9, '   ')).toEqual({ label: 'INFO', tone: 'info' })
    expect(severityMeta(21, null)).toEqual({ label: 'FATAL', tone: 'error' })
  })

  it('never lets a rogue text value change the tone', () => {
    // Text says INFO but the number is ERROR-range — tone follows the number.
    expect(severityMeta(17, 'INFO').tone).toBe('error')
  })
})

describe('SEVERITY_FILTERS', () => {
  it('offers All / INFO+ / WARN+ / ERROR+ with OTel thresholds', () => {
    expect(SEVERITY_FILTERS.map((f) => f.value)).toEqual([0, 9, 13, 17])
  })
})
