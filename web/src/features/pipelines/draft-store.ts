import { create } from 'zustand'
import {
  addNode,
  EMPTY_GRAPH,
  moveNode,
  removeNode,
  renameNode,
  toggleSignal,
  updateNodeConfig,
  type NodeSection,
} from '@/features/pipelines/graph'
import type { GraphNode, PipelineGraph, Signal } from '@/api/generated'

/**
 * Client-side draft of the pipeline graph being edited. One editor is open at
 * a time, so a single global store suffices; `seed` re-keys it per pipeline.
 *
 * `revision` bumps on every whole-graph replacement (seed / restore) and is
 * used as a React key to remount uncontrolled form internals (JSON fallback
 * textareas, map editors) so they pick up the new values.
 */
interface DraftState {
  pipelineId: string | null
  graph: PipelineGraph
  /** Version the draft was seeded from — null when seeded from scratch. */
  baseVersion: number | null
  dirty: boolean
  revision: number
  seed: (pipelineId: string, graph: PipelineGraph, baseVersion: number | null) => void
  /** Restore-as-draft: replaces the graph, keeps the pipeline, marks dirty. */
  replaceGraph: (graph: PipelineGraph) => void
  markSaved: (version: number) => void
  toggleSignal: (signal: Signal) => void
  addNode: (section: NodeSection, node: GraphNode) => void
  removeNode: (section: NodeSection, index: number) => void
  moveNode: (section: NodeSection, index: number, delta: -1 | 1) => void
  setNodeConfig: (section: NodeSection, index: number, config: Record<string, unknown>) => void
  setNodeName: (section: NodeSection, index: number, name: string) => void
}

export const useDraftStore = create<DraftState>()((set) => ({
  pipelineId: null,
  graph: EMPTY_GRAPH,
  baseVersion: null,
  dirty: false,
  revision: 0,

  seed: (pipelineId, graph, baseVersion) =>
    set((state) => ({
      pipelineId,
      graph: structuredClone(graph),
      baseVersion,
      dirty: false,
      revision: state.revision + 1,
    })),

  replaceGraph: (graph) =>
    set((state) => ({
      graph: structuredClone(graph),
      dirty: true,
      revision: state.revision + 1,
    })),

  markSaved: (version) => set({ baseVersion: version, dirty: false }),

  toggleSignal: (signal) =>
    set((state) => ({ graph: toggleSignal(state.graph, signal), dirty: true })),

  addNode: (section, node) =>
    set((state) => ({ graph: addNode(state.graph, section, node), dirty: true })),

  removeNode: (section, index) =>
    set((state) => ({ graph: removeNode(state.graph, section, index), dirty: true })),

  moveNode: (section, index, delta) =>
    set((state) => ({ graph: moveNode(state.graph, section, index, delta), dirty: true })),

  setNodeConfig: (section, index, config) =>
    set((state) => ({ graph: updateNodeConfig(state.graph, section, index, config), dirty: true })),

  setNodeName: (section, index, name) =>
    set((state) => ({ graph: renameNode(state.graph, section, index, name), dirty: true })),
}))
