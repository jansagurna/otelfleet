import { describe, expect, it } from 'vitest'
import {
  actionTone,
  entityTypeOptions,
  shortId,
  STATIC_ENTITY_TYPES,
} from '@/features/audit/audit-meta'

describe('actionTone (action chip color)', () => {
  it('colors creations green', () => {
    expect(actionTone('create_customer')).toBe('ok')
    expect(actionTone('invite_user')).toBe('ok')
    expect(actionTone('create_pipeline_version')).toBe('ok')
  })

  it('colors mutations amber', () => {
    expect(actionTone('update_customer')).toBe('warn')
    expect(actionTone('activate_pipeline_version')).toBe('warn')
    expect(actionTone('disable_user')).toBe('warn')
  })

  it('colors destructive verbs red, even when the noun matches another bucket', () => {
    expect(actionTone('delete_pipeline')).toBe('danger')
    expect(actionTone('revoke_api_key')).toBe('danger')
    expect(actionTone('delete_pipeline_version')).toBe('danger')
    expect(actionTone('forget_agent')).toBe('danger')
  })

  it('falls back to neutral for unknown verbs', () => {
    expect(actionTone('login')).toBe('neutral')
  })
})

describe('entityTypeOptions', () => {
  it('unions statics with loaded types, deduped and sorted', () => {
    const options = entityTypeOptions(['customer', 'webhook', 'customer'])
    for (const staticType of STATIC_ENTITY_TYPES) {
      expect(options).toContain(staticType)
    }
    expect(options).toContain('webhook')
    expect(options.filter((t) => t === 'customer')).toHaveLength(1)
    expect(options).toEqual([...options].sort())
  })
})

describe('shortId', () => {
  it('truncates UUIDs to the first segment length', () => {
    expect(shortId('4f2c7a1e-0000-4000-8000-000000000041')).toBe('4f2c7a1e')
    expect(shortId('42')).toBe('42')
  })
})
