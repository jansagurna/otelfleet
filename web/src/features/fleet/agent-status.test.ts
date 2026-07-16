import { describe, expect, it } from 'vitest'
import {
  agentDisplayName,
  agentStatus,
  configChip,
  shortHash,
  shortId,
} from '@/features/fleet/agent-status'
import type { Agent } from '@/api/generated'

function statusInput(
  overrides: Partial<Pick<Agent, 'connected' | 'healthy' | 'remoteConfigStatus'>> = {},
) {
  return {
    connected: true,
    healthy: true,
    remoteConfigStatus: 'applied' as const,
    ...overrides,
  }
}

describe('agentStatus', () => {
  it('is gray/offline when disconnected, regardless of health', () => {
    expect(agentStatus(statusInput({ connected: false }))).toEqual({
      tone: 'off',
      label: 'Offline',
    })
    expect(
      agentStatus(statusInput({ connected: false, healthy: false, remoteConfigStatus: 'failed' })),
    ).toEqual({ tone: 'off', label: 'Offline' })
  })

  it('is green when connected and healthy', () => {
    expect(agentStatus(statusInput())).toEqual({ tone: 'ok', label: 'Online, healthy' })
  })

  it('is green/online when connected with unknown health', () => {
    expect(agentStatus(statusInput({ healthy: null }))).toEqual({ tone: 'ok', label: 'Online' })
    expect(agentStatus(statusInput({ healthy: undefined }))).toEqual({
      tone: 'ok',
      label: 'Online',
    })
  })

  it('is amber when connected but unhealthy', () => {
    expect(agentStatus(statusInput({ healthy: false }))).toEqual({
      tone: 'warn',
      label: 'Online, unhealthy',
    })
  })

  it('is amber when connected and the remote config failed', () => {
    expect(agentStatus(statusInput({ remoteConfigStatus: 'failed' }))).toEqual({
      tone: 'warn',
      label: 'Online, config failed',
    })
  })
})

function configInput(
  overrides: Partial<Pick<Agent, 'remoteConfigStatus' | 'remoteConfigError' | 'configInSync'>> = {},
) {
  return {
    remoteConfigStatus: 'applied' as const,
    remoteConfigError: null,
    configInSync: true,
    ...overrides,
  }
}

describe('configChip', () => {
  it('shows "in sync" when hashes match', () => {
    expect(configChip(configInput())).toEqual({ label: 'in sync', variant: 'ok' })
  })

  it('shows "out of sync" when hashes differ', () => {
    const chip = configChip(configInput({ configInSync: false }))
    expect(chip.label).toBe('out of sync')
    expect(chip.variant).toBe('warn')
  })

  it('shows "applying" while a config push is in flight, even if hashes differ', () => {
    const chip = configChip(configInput({ remoteConfigStatus: 'applying', configInSync: false }))
    expect(chip.label).toBe('applying')
    expect(chip.variant).toBe('neutral')
  })

  it('shows "failed" with the error as tooltip, winning over sync state', () => {
    const chip = configChip(
      configInput({
        remoteConfigStatus: 'failed',
        remoteConfigError: 'yaml: line 3: mapping values',
        configInSync: true,
      }),
    )
    expect(chip.label).toBe('failed')
    expect(chip.variant).toBe('danger')
    expect(chip.tooltip).toBe('yaml: line 3: mapping values')
  })

  it('falls back to a generic tooltip when a failure carries no error text', () => {
    const chip = configChip(configInput({ remoteConfigStatus: 'failed', remoteConfigError: null }))
    expect(chip.label).toBe('failed')
    expect(chip.tooltip).toBeTruthy()
  })

  it('shows "—" when nothing is known', () => {
    const chip = configChip(configInput({ remoteConfigStatus: 'unset', configInSync: null }))
    expect(chip.label).toBe('—')
    expect(chip.variant).toBe('neutral')
  })
})

describe('agentDisplayName', () => {
  it('prefers the reported name', () => {
    expect(agentDisplayName({ name: 'edge-01', instanceUid: '019078abcdef' })).toBe('edge-01')
  })

  it('falls back to the shortened instance UID', () => {
    expect(agentDisplayName({ name: null, instanceUid: '019078abcdef40008000' })).toBe('019078ab…')
    expect(agentDisplayName({ name: '', instanceUid: '019078abcdef40008000' })).toBe('019078ab…')
  })
})

describe('shortId / shortHash', () => {
  it('leaves short ids untouched', () => {
    expect(shortId('abcd')).toBe('abcd')
  })

  it('previews the first 12 chars of a hash and dashes out missing ones', () => {
    expect(shortHash('abc123def4567890')).toBe('abc123def456')
    expect(shortHash(null)).toBe('—')
    expect(shortHash(undefined)).toBe('—')
    expect(shortHash('')).toBe('—')
  })
})
