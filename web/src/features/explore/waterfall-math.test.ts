import { describe, expect, it } from 'vitest'
import {
  barGeometry,
  buildSpanTree,
  computeTraceWindow,
  isErrorSpan,
  serviceColorIndex,
} from '@/features/explore/waterfall-math'
import type { Span } from '@/api/generated'

const span = (over: Partial<Span> & Pick<Span, 'spanId' | 'startTime' | 'durationMs'>): Span => ({
  parentSpanId: null,
  name: over.spanId,
  service: 'svc',
  kind: 'SPAN_KIND_INTERNAL',
  statusCode: 'STATUS_CODE_UNSET',
  ...over,
})

describe('buildSpanTree', () => {
  it('orders roots first, then children depth-first, siblings by start time', () => {
    const spans: Span[] = [
      span({ spanId: 'b', parentSpanId: 'root', startTime: '2026-07-20T00:00:02Z', durationMs: 1 }),
      span({ spanId: 'a', parentSpanId: 'root', startTime: '2026-07-20T00:00:01Z', durationMs: 1 }),
      span({ spanId: 'root', startTime: '2026-07-20T00:00:00Z', durationMs: 10 }),
      span({ spanId: 'a1', parentSpanId: 'a', startTime: '2026-07-20T00:00:01.5Z', durationMs: 1 }),
    ]
    const tree = buildSpanTree(spans)
    expect(tree.map((n) => n.span.spanId)).toEqual(['root', 'a', 'a1', 'b'])
    expect(tree.map((n) => n.depth)).toEqual([0, 1, 2, 1])
  })

  it('treats a span with a missing parent as a root', () => {
    const spans: Span[] = [
      span({ spanId: 'orphan', parentSpanId: 'gone', startTime: '2026-07-20T00:00:00Z', durationMs: 1 }),
    ]
    const tree = buildSpanTree(spans)
    expect(tree).toHaveLength(1)
    expect(tree[0]?.depth).toBe(0)
    expect(tree[0]?.span.spanId).toBe('orphan')
  })

  it('renders every span exactly once even with a cycle', () => {
    const spans: Span[] = [
      span({ spanId: 'x', parentSpanId: 'y', startTime: '2026-07-20T00:00:00Z', durationMs: 1 }),
      span({ spanId: 'y', parentSpanId: 'x', startTime: '2026-07-20T00:00:01Z', durationMs: 1 }),
    ]
    const tree = buildSpanTree(spans)
    expect(new Set(tree.map((n) => n.span.spanId))).toEqual(new Set(['x', 'y']))
    expect(tree).toHaveLength(2)
  })
})

describe('computeTraceWindow', () => {
  it('spans the earliest start to the latest end', () => {
    const spans: Span[] = [
      span({ spanId: 'a', startTime: '2026-07-20T00:00:00.000Z', durationMs: 500 }),
      span({ spanId: 'b', startTime: '2026-07-20T00:00:00.200Z', durationMs: 1000 }), // ends at +1200ms
    ]
    const w = computeTraceWindow(spans)
    expect(w.durationMs).toBe(1200)
  })

  it('is zero-safe for an empty trace', () => {
    expect(computeTraceWindow([])).toEqual({ startMs: 0, endMs: 0, durationMs: 0 })
  })
})

describe('barGeometry', () => {
  const root = span({ spanId: 'root', startTime: '2026-07-20T00:00:00.000Z', durationMs: 1000 })
  const mid = span({ spanId: 'mid', startTime: '2026-07-20T00:00:00.250Z', durationMs: 500 })
  const window = computeTraceWindow([root, mid]) // 1000ms wide

  it('places the root bar across the full window', () => {
    expect(barGeometry(root, window)).toEqual({ leftPct: 0, widthPct: 100 })
  })

  it('offsets and scales a child by its start and duration', () => {
    expect(barGeometry(mid, window)).toEqual({ leftPct: 25, widthPct: 50 })
  })

  it('floors a zero-duration span to a visible sliver and never overflows', () => {
    const instant = span({ spanId: 'i', startTime: '2026-07-20T00:00:01.000Z', durationMs: 0 })
    const geom = barGeometry(instant, window)
    expect(geom.leftPct).toBe(100)
    expect(geom.widthPct).toBe(0) // clamped to 100 - left
  })

  it('fills the track when the whole trace is instantaneous', () => {
    const zero = { startMs: 0, endMs: 0, durationMs: 0 }
    expect(barGeometry(root, zero)).toEqual({ leftPct: 0, widthPct: 100 })
  })
})

describe('isErrorSpan', () => {
  it('detects ERROR in the status code, case-insensitively', () => {
    expect(isErrorSpan(span({ spanId: 'e', startTime: 'x', durationMs: 1, statusCode: 'STATUS_CODE_ERROR' }))).toBe(true)
    expect(isErrorSpan(span({ spanId: 'o', startTime: 'x', durationMs: 1, statusCode: 'STATUS_CODE_OK' }))).toBe(false)
  })
})

describe('serviceColorIndex', () => {
  it('assigns stable slots by first appearance', () => {
    const spans: Span[] = [
      span({ spanId: 'a', service: 'frontend', startTime: 'x', durationMs: 1 }),
      span({ spanId: 'b', service: 'checkout', startTime: 'x', durationMs: 1 }),
      span({ spanId: 'c', service: 'frontend', startTime: 'x', durationMs: 1 }),
    ]
    const index = serviceColorIndex(spans)
    expect(index.get('frontend')).toBe(0)
    expect(index.get('checkout')).toBe(1)
  })
})
