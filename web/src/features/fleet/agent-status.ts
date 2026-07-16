import type { Agent } from '@/api/generated'

/**
 * Pure derivation helpers for the fleet UI. Kept free of React so the
 * status-dot / config-chip logic is unit-testable in isolation.
 */

export type StatusTone = 'ok' | 'warn' | 'off'

export interface AgentStatusSpec {
  tone: StatusTone
  label: string
}

type StatusInput = Pick<Agent, 'connected' | 'healthy' | 'remoteConfigStatus'>

/**
 * Status dot: green = connected and healthy, amber = connected but unhealthy
 * or its remote config failed, gray = offline.
 */
export function agentStatus(agent: StatusInput): AgentStatusSpec {
  if (!agent.connected) return { tone: 'off', label: 'Offline' }
  if (agent.healthy === false) return { tone: 'warn', label: 'Online, unhealthy' }
  if (agent.remoteConfigStatus === 'failed') return { tone: 'warn', label: 'Online, config failed' }
  if (agent.healthy == null) return { tone: 'ok', label: 'Online' }
  return { tone: 'ok', label: 'Online, healthy' }
}

export type ConfigChipVariant = 'ok' | 'warn' | 'danger' | 'neutral'

export interface ConfigChipSpec {
  label: 'in sync' | 'out of sync' | 'applying' | 'failed' | '—'
  variant: ConfigChipVariant
  tooltip?: string
}

type ConfigInput = Pick<Agent, 'remoteConfigStatus' | 'remoteConfigError' | 'configInSync'>

/**
 * Config-state chip: failure and in-flight application win over the hash
 * comparison; "—" when neither side is known.
 */
export function configChip(agent: ConfigInput): ConfigChipSpec {
  if (agent.remoteConfigStatus === 'failed') {
    return {
      label: 'failed',
      variant: 'danger',
      tooltip: agent.remoteConfigError ?? 'The agent rejected the assigned config.',
    }
  }
  if (agent.remoteConfigStatus === 'applying') {
    return { label: 'applying', variant: 'neutral', tooltip: 'The agent is applying the assigned config.' }
  }
  if (agent.configInSync === true) return { label: 'in sync', variant: 'ok' }
  if (agent.configInSync === false) {
    return { label: 'out of sync', variant: 'warn', tooltip: 'Reported config differs from the assigned config.' }
  }
  return { label: '—', variant: 'neutral', tooltip: 'Config state unknown — nothing reported yet.' }
}

/** Display name: reported name, falling back to a shortened instance UID. */
export function agentDisplayName(agent: Pick<Agent, 'name' | 'instanceUid'>): string {
  if (agent.name != null && agent.name !== '') return agent.name
  return shortId(agent.instanceUid)
}

/** First 8 chars of a UID/hash with an ellipsis when truncated. */
export function shortId(id: string, length = 8): string {
  return id.length > length ? `${id.slice(0, length)}…` : id
}

/** 12-char hash preview, "—" when absent (matches the pipelines pattern). */
export function shortHash(hash: string | null | undefined): string {
  if (hash == null || hash === '') return '—'
  return hash.slice(0, 12)
}
