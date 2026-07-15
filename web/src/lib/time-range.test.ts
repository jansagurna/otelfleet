import { describe, expect, it } from 'vitest'
import {
  isTimeRange,
  parseTimeRange,
  rangeSeconds,
  rangeToInterval,
  RANGE_STEP,
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
  it('has a chart resolution for every range', () => {
    for (const range of TIME_RANGES) {
      expect(RANGE_STEP[range]).toMatch(/^\d+[smh]$/)
    }
  })
})
