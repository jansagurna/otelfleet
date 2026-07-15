import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyCsrf,
  handleUnauthorized,
  setCsrfToken,
  setUnauthorizedHandler,
} from '@/lib/api-client'

describe('applyCsrf', () => {
  beforeEach(() => {
    setCsrfToken(null)
  })

  it('adds X-CSRF-Token to mutating requests when a token is cached', () => {
    setCsrfToken('tok-123')
    for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) {
      const request = applyCsrf(new Request('http://localhost/api/v1/customers', { method }))
      expect(request.headers.get('X-CSRF-Token')).toBe('tok-123')
    }
  })

  it('does not add the header to GET requests', () => {
    setCsrfToken('tok-123')
    const request = applyCsrf(new Request('http://localhost/api/v1/customers'))
    expect(request.headers.get('X-CSRF-Token')).toBeNull()
  })

  it('does not add a header when no token is cached (pre-login)', () => {
    const request = applyCsrf(
      new Request('http://localhost/api/v1/auth/dev-login', { method: 'POST' }),
    )
    expect(request.headers.get('X-CSRF-Token')).toBeNull()
  })

  it('never overwrites an explicitly set token', () => {
    setCsrfToken('cached')
    const request = applyCsrf(
      new Request('http://localhost/api/v1/customers', {
        method: 'POST',
        headers: { 'X-CSRF-Token': 'explicit' },
      }),
    )
    expect(request.headers.get('X-CSRF-Token')).toBe('explicit')
  })
})

describe('handleUnauthorized', () => {
  it('invokes the handler on 401 from API endpoints', () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    handleUnauthorized(
      new Response(null, { status: 401 }),
      new Request('http://localhost/api/v1/customers'),
    )
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('ignores non-401 responses', () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    handleUnauthorized(
      new Response(null, { status: 403 }),
      new Request('http://localhost/api/v1/customers'),
    )
    handleUnauthorized(
      new Response(null, { status: 200 }),
      new Request('http://localhost/api/v1/me'),
    )
    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores 401s from auth endpoints (login flow handles those)', () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    handleUnauthorized(
      new Response(null, { status: 401 }),
      new Request('http://localhost/api/v1/auth/dev-login', { method: 'POST' }),
    )
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns the response unchanged', () => {
    setUnauthorizedHandler(() => {})
    const response = new Response(null, { status: 401 })
    expect(handleUnauthorized(response, new Request('http://localhost/api/v1/customers'))).toBe(
      response,
    )
  })
})
