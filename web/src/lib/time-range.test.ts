import { describe, expect, it } from 'vitest'
import {
  EXTENDED_TIME_RANGES,
  isTimeRange,
  parseTimeRange,
  previousInterval,
  rangeSeconds,
  rangeToInterval,
  RANGE_STEP,
  shiftToCurrentWindow,
  TIME_RANGES,
} from '@/lib/time-range'

describe('parseTimeRange', () => {
  it('accepts every supported range as-is', () => {
    for (const range of TIME_RANGES) {
      expect(parseTimeRange(range)).toBe(range)
    }
  })

  it('falls back to 24h for unknown or non-string values', () => {
    expect(parseTimeRange('2h')).toBe('24h')
    expect(parseTimeRange(undefined)).toBe('24h')
    expect(parseTimeRange(42)).toBe('24h')
    expect(parseTimeRange(null, '1h')).toBe('1h')
  })

  it('isTimeRange narrows only valid literals', () => {
    expect(isTimeRange('7d')).toBe(true)
    expect(isTimeRange('7D')).toBe(false)
    expect(isTimeRange('')).toBe(false)
  })
})

describe('rangeToInterval', () => {
  it('produces an ISO window ending at the minute boundary', () => {
    const now = new Date('2026-07-15T10:30:42.500Z')
    const { from, to } = rangeToInterval('1h', now)
    expect(to).toBe('2026-07-15T10:30:00.000Z')
    expect(from).toBe('2026-07-15T09:30:00.000Z')
  })

  it('spans exactly the range duration for every preset', () => {
    const now = new Date('2026-07-15T00:00:00.000Z')
    for (const range of TIME_RANGES) {
      const { from, to } = rangeToInterval(range, now)
      const spanSeconds = (new Date(to).getTime() - new Date(from).getTime()) / 1000
      expect(spanSeconds).toBe(rangeSeconds(range))
    }
  })

  it('keeps the serialized window stable within the same minute', () => {
    const a = rangeToInterval('6h', new Date('2026-07-15T10:30:01Z'))
    const b = rangeToInterval('6h', new Date('2026-07-15T10:30:59Z'))
    expect(a).toEqual(b)
  })
})

describe('RANGE_STEP', () => {
  it('has a chart resolution for every range, including 30d', () => {
    for (const range of EXTENDED_TIME_RANGES) {
      expect(RANGE_STEP[range]).toMatch(/^\d+[smh]$/)
    }
  })
})

describe('extended ranges (metrics explorer)', () => {
  it('accepts 30d only against the extended set', () => {
    expect(isTimeRange('30d')).toBe(false)
    expect(isTimeRange('30d', EXTENDED_TIME_RANGES)).toBe(true)
  })

  it('30d spans thirty days', () => {
    expect(rangeSeconds('30d')).toBe(30 * 24 * 3600)
  })
})

describe('previousInterval (compare-period shift)', () => {
  it('returns the immediately preceding window of equal duration', () => {
    const current = rangeToInterval('24h', new Date('2026-07-15T10:00:00Z'))
    const previous = previousInterval(current)
    expect(previous.to).toBe(current.from)
    expect(previous.from).toBe('2026-07-13T10:00:00.000Z')
    const span = (i: { from: string; to: string }) =>
      new Date(i.to).getTime() - new Date(i.from).getTime()
    expect(span(previous)).toBe(span(current))
  })

  it('shiftToCurrentWindow maps previous-period timestamps onto the current axis', () => {
    const current = rangeToInterval('1h', new Date('2026-07-15T10:00:00Z'))
    const previous = previousInterval(current)
    // Start of the previous window lands on the start of the current one …
    expect(shiftToCurrentWindow(previous.from, current)).toBe(new Date(current.from).getTime())
    // … and its end on the current end.
    expect(shiftToCurrentWindow(previous.to, current)).toBe(new Date(current.to).getTime())
  })
})
