import { describe, expect, it } from 'vitest'
import { formatDurationMs } from '@/lib/format'

describe('formatDurationMs', () => {
  it('keeps sub-second durations in milliseconds', () => {
    expect(formatDurationMs(0)).toBe('<1 ms')
    expect(formatDurationMs(0.4)).toBe('<1 ms')
    expect(formatDurationMs(12)).toBe('12 ms')
    expect(formatDurationMs(742)).toBe('742 ms')
    expect(formatDurationMs(999)).toBe('999 ms')
  })

  it('humanizes one second and above to seconds', () => {
    expect(formatDurationMs(1000)).toBe('1.00 s')
    expect(formatDurationMs(1240)).toBe('1.24 s')
    expect(formatDurationMs(18_300)).toBe('18.3 s')
    expect(formatDurationMs(59_900)).toBe('59.9 s')
  })

  it('folds minute-scale durations into m s', () => {
    expect(formatDurationMs(60_000)).toBe('1m 00s')
    expect(formatDurationMs(125_000)).toBe('2m 05s')
  })

  it('guards against invalid input', () => {
    expect(formatDurationMs(-5)).toBe('—')
    expect(formatDurationMs(NaN)).toBe('—')
  })
})
