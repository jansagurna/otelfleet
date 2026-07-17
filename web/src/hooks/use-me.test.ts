import { describe, expect, it } from 'vitest'
import { canMutate, isAdmin } from '@/hooks/use-me'
import type { Me } from '@/api/generated'

function me(role: Me['role']): Me {
  return {
    id: '4f2c7a1e-0000-4000-8000-000000000001',
    email: 'someone@example.com',
    displayName: null,
    role,
    csrfToken: 'token',
  }
}

describe('isAdmin (admin-only route guard)', () => {
  it('only admits the admin role', () => {
    expect(isAdmin(me('admin'))).toBe(true)
    expect(isAdmin(me('operator'))).toBe(false)
    expect(isAdmin(me('viewer'))).toBe(false)
  })

  it('denies while the session is unknown', () => {
    expect(isAdmin(undefined)).toBe(false)
  })
})

describe('canMutate', () => {
  it('admits operators and admins, not viewers', () => {
    expect(canMutate(me('admin'))).toBe(true)
    expect(canMutate(me('operator'))).toBe(true)
    expect(canMutate(me('viewer'))).toBe(false)
    expect(canMutate(undefined)).toBe(false)
  })
})
