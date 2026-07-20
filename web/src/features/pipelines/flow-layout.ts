import { parseErrorPath } from '@/features/pipelines/error-path'
import type { NodeSection } from '@/features/pipelines/graph'
import type { PipelineGraph, Signal, ValidationResult } from '@/api/generated'

/**
 * Deterministic auto-layout for the graph view. The topology is fixed —
 * signal sources → linear processor chain → exporter fan-out — so three
 * fixed columns with vertically centered stacks are enough; no layout
 * engine needed.
 */

export const FLOW_NODE_WIDTH = 224
const COLUMN_GAP = 96
const SOURCE_NODE_HEIGHT = 44
const COMPONENT_NODE_HEIGHT = 92
const ROW_GAP = 28

export interface FlowPoint {
  x: number
  y: number
}

export interface FlowNodeSpec {
  id: string
  kind: 'source' | 'component'
  section: NodeSection | null
  /** Index within the section; null for sources. */
  index: number | null
  signal: Signal | null
  position: FlowPoint
}

export interface FlowEdgeSpec {
  id: string
  source: string
  target: string
}

export function sourceNodeId(signal: Signal): string {
  return `source-${signal}`
}

export function componentNodeId(section: NodeSection, index: number): string {
  return `${section}-${index}`
}

/** Inverse of componentNodeId — null for source nodes / unknown ids. */
export function parseComponentNodeId(
  id: string,
): { section: NodeSection; index: number } | null {
  const match = /^(processors|exporters)-(\d+)$/.exec(id)
  if (!match) return null
  return { section: match[1] as NodeSection, index: Number(match[2]) }
}

function columnX(column: 0 | 1 | 2): number {
  return column * (FLOW_NODE_WIDTH + COLUMN_GAP)
}

/** Vertically centered stack: y of each of `count` rows of `height`. */
function stackYs(count: number, height: number): number[] {
  const total = count * height + Math.max(count - 1, 0) * ROW_GAP
  const start = -total / 2
  return Array.from({ length: count }, (_, i) => start + i * (height + ROW_GAP))
}

export function buildFlowLayout(graph: PipelineGraph): {
  nodes: FlowNodeSpec[]
  edges: FlowEdgeSpec[]
} {
  const nodes: FlowNodeSpec[] = []

  const sourceYs = stackYs(graph.signals.length, SOURCE_NODE_HEIGHT)
  graph.signals.forEach((signal, i) => {
    nodes.push({
      id: sourceNodeId(signal),
      kind: 'source',
      section: null,
      index: null,
      signal,
      position: { x: columnX(0), y: sourceYs[i]! },
    })
  })

  // Processors keep column 1 even when empty — exporters always sit in
  // column 2 so toggling processors never reflows the whole canvas.
  const processorYs = stackYs(graph.processors.length, COMPONENT_NODE_HEIGHT)
  graph.processors.forEach((_, i) => {
    nodes.push({
      id: componentNodeId('processors', i),
      kind: 'component',
      section: 'processors',
      index: i,
      signal: null,
      position: { x: columnX(1), y: processorYs[i]! },
    })
  })

  const exporterYs = stackYs(graph.exporters.length, COMPONENT_NODE_HEIGHT)
  graph.exporters.forEach((_, i) => {
    nodes.push({
      id: componentNodeId('exporters', i),
      kind: 'component',
      section: 'exporters',
      index: i,
      signal: null,
      position: { x: columnX(2), y: exporterYs[i]! },
    })
  })

  const edges: FlowEdgeSpec[] = []
  const firstProcessor = graph.processors.length > 0 ? componentNodeId('processors', 0) : null
  const lastProcessor =
    graph.processors.length > 0
      ? componentNodeId('processors', graph.processors.length - 1)
      : null

  // Sources feed the head of the chain — or every exporter when there is none.
  for (const signal of graph.signals) {
    const from = sourceNodeId(signal)
    if (firstProcessor !== null) {
      edges.push({ id: `${from}->${firstProcessor}`, source: from, target: firstProcessor })
    } else {
      graph.exporters.forEach((_, i) => {
        const to = componentNodeId('exporters', i)
        edges.push({ id: `${from}->${to}`, source: from, target: to })
      })
    }
  }

  // The linear processor chain.
  for (let i = 0; i + 1 < graph.processors.length; i++) {
    const from = componentNodeId('processors', i)
    const to = componentNodeId('processors', i + 1)
    edges.push({ id: `${from}->${to}`, source: from, target: to })
  }

  // Fan-out: tail of the chain into every exporter.
  if (lastProcessor !== null) {
    graph.exporters.forEach((_, i) => {
      const to = componentNodeId('exporters', i)
      edges.push({ id: `${lastProcessor}->${to}`, source: lastProcessor, target: to })
    })
  }

  return { nodes, edges }
}

/**
 * Recompute a section's order from dragged y-positions: sort by y (stable
 * on the original index for ties). Returns a permutation of indices for
 * reorderNodes — [2, 0, 1] means "old node 2 first".
 */
export function orderFromY(rows: Array<{ index: number; y: number }>): number[] {
  return [...rows]
    .sort((a, b) => (a.y === b.y ? a.index - b.index : a.y - b.y))
    .map((row) => row.index)
}

/** True when the permutation is the identity (drag ended where it started). */
export function isIdentityOrder(order: number[]): boolean {
  return order.every((value, i) => value === i)
}

type ValidationErrors = ValidationResult['errors']

/**
 * Map validation errors onto graph-view node ids ('processors-0', …).
 * Signal-level errors map to every source node id so the whole source
 * column flags them.
 */
export function invalidNodeIds(
  errors: ValidationErrors | null | undefined,
  signals: readonly Signal[],
): Set<string> {
  const ids = new Set<string>()
  for (const error of errors ?? []) {
    const anchor = parseErrorPath(error.path)
    if (!anchor) continue
    if (anchor.section === 'signals' || anchor.index === null) {
      for (const signal of signals) ids.add(sourceNodeId(signal))
    } else {
      ids.add(componentNodeId(anchor.section, anchor.index))
    }
  }
  return ids
}

const SUMMARY_MAX_VALUE = 22

function summaryValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `[${value.length}]`
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>)
    return keys.length === 0 ? '{}' : `{${keys.length}}`
  }
  const rendered = typeof value === 'string' ? value : String(value)
  return rendered.length > SUMMARY_MAX_VALUE
    ? `${rendered.slice(0, SUMMARY_MAX_VALUE - 1)}…`
    : rendered
}

/** Compact "key: value" lines for a node card — first few config fields. */
export function configSummary(config: Record<string, unknown>, max = 3): string[] {
  return Object.entries(config)
    .filter(([, value]) => value !== undefined)
    .slice(0, max)
    .map(([key, value]) => `${key}: ${summaryValue(value)}`)
}
