import { describe, expect, it } from 'vitest'
import { canMutate, hasAllCustomers, isAdmin, scopedCustomerCount } from '@/hooks/use-me'
import type { Me } from '@/api/generated'

function me(role: Me['role'], scope: Partial<Me> = {}): Me {
  return {
    id: '4f2c7a1e-0000-4000-8000-000000000001',
    email: 'someone@example.com',
    displayName: null,
    role,
    allCustomers: true,
    csrfToken: 'token',
    ...scope,
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

describe('hasAllCustomers', () => {
  it('follows the allCustomers flag from the session', () => {
    expect(hasAllCustomers(me('admin', { allCustomers: true }))).toBe(true)
    expect(
      hasAllCustomers(me('operator', { allCustomers: false, scopedCustomerIds: ['c1'] })),
    ).toBe(false)
    // Unknown session is treated as unrestricted (nothing to narrow yet).
    expect(hasAllCustomers(undefined)).toBe(true)
  })
})

describe('scopedCustomerCount', () => {
  it('counts the grants for a scoped user, else zero', () => {
    expect(
      scopedCustomerCount(me('operator', { allCustomers: false, scopedCustomerIds: ['c1', 'c2'] })),
    ).toBe(2)
    expect(scopedCustomerCount(me('admin'))).toBe(0)
    expect(scopedCustomerCount(undefined)).toBe(0)
  })
})
