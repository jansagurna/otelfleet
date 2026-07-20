import type { Span } from '@/api/generated'

/**
 * Pure geometry + ordering for the trace waterfall. Kept separate from the
 * component so the tree walk and the bar math can be unit-tested without a DOM.
 */

export interface SpanNode {
  span: Span
  /** Nesting level: roots are 0, each child one deeper than its parent. */
  depth: number
}

/** Absolute time window the whole trace spans, in epoch milliseconds. */
export interface TraceWindow {
  startMs: number
  endMs: number
  durationMs: number
}

/** A span bar's horizontal placement as percentages of the trace window. */
export interface BarGeometry {
  leftPct: number
  widthPct: number
}

/** Tiny floor so a near-instant span still renders a visible sliver. */
const MIN_WIDTH_PCT = 0.4

const startMsOf = (span: Span): number => new Date(span.startTime).getTime()

/**
 * Order spans for display: roots first (a span whose parent is missing from
 * the set is treated as a root), then each subtree depth-first, siblings
 * sorted by start time. Cycles and orphaned spans are handled gracefully so a
 * malformed trace still renders every span exactly once.
 */
export function buildSpanTree(spans: Span[]): SpanNode[] {
  const byId = new Map(spans.map((s) => [s.spanId, s]))
  const childrenOf = new Map<string, Span[]>()
  const roots: Span[] = []

  for (const span of spans) {
    const parentId = span.parentSpanId ?? null
    if (parentId !== null && parentId !== span.spanId && byId.has(parentId)) {
      const siblings = childrenOf.get(parentId) ?? []
      siblings.push(span)
      childrenOf.set(parentId, siblings)
    } else {
      // No parent, self-referential parent, or a parent we never received.
      roots.push(span)
    }
  }

  const byStart = (a: Span, b: Span) => startMsOf(a) - startMsOf(b)
  roots.sort(byStart)
  for (const siblings of childrenOf.values()) siblings.sort(byStart)

  const ordered: SpanNode[] = []
  const visited = new Set<string>()
  const walk = (span: Span, depth: number) => {
    if (visited.has(span.spanId)) return // guard against cycles
    visited.add(span.spanId)
    ordered.push({ span, depth })
    for (const child of childrenOf.get(span.spanId) ?? []) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)

  // Any span left unvisited was part of a cycle — surface it as a root so the
  // waterfall never silently drops rows.
  for (const span of spans) {
    if (!visited.has(span.spanId)) {
      visited.add(span.spanId)
      ordered.push({ span, depth: 0 })
    }
  }
  return ordered
}

/** Earliest start to latest end across all spans. */
export function computeTraceWindow(spans: Span[]): TraceWindow {
  if (spans.length === 0) return { startMs: 0, endMs: 0, durationMs: 0 }
  let startMs = Infinity
  let endMs = -Infinity
  for (const span of spans) {
    const begin = startMsOf(span)
    const finish = begin + Math.max(0, span.durationMs)
    if (begin < startMs) startMs = begin
    if (finish > endMs) endMs = finish
  }
  return { startMs, endMs, durationMs: Math.max(0, endMs - startMs) }
}

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(Math.max(value, lo), hi)

/**
 * Where a span's bar sits inside the trace window. `left` is the offset from
 * the trace start; `width` scales by the span's own duration. Both are clamped
 * so a bar can never overflow the track, and width is floored to stay visible.
 * A zero-duration trace (single instant span) fills the track.
 */
export function barGeometry(span: Span, window: TraceWindow): BarGeometry {
  if (window.durationMs <= 0) return { leftPct: 0, widthPct: 100 }
  const rawLeft = ((startMsOf(span) - window.startMs) / window.durationMs) * 100
  const rawWidth = (Math.max(0, span.durationMs) / window.durationMs) * 100
  const leftPct = clamp(rawLeft, 0, 100)
  const widthPct = clamp(Math.max(rawWidth, MIN_WIDTH_PCT), 0, 100 - leftPct)
  return { leftPct, widthPct }
}

/** A span is failed when its status code carries ERROR (OTel STATUS_CODE_ERROR). */
export function isErrorSpan(span: Span): boolean {
  return span.statusCode.toUpperCase().includes('ERROR')
}

/**
 * Assign each distinct service a stable palette slot by first appearance, so
 * bar colors stay put as the user clicks around a trace.
 */
export function serviceColorIndex(spans: Span[]): Map<string, number> {
  const index = new Map<string, number>()
  for (const span of spans) {
    if (!index.has(span.service)) index.set(span.service, index.size)
  }
  return index
}
