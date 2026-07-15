import { client } from '@/api/generated/client.gen'

/**
 * Session-scoped CSRF token, cached from GET /api/v1/me. Sent as
 * X-CSRF-Token on every mutating request (see api/openapi.yaml).
 */
let csrfToken: string | null = null

export function setCsrfToken(token: string | null): void {
  csrfToken = token
}

export function getCsrfToken(): string | null {
  return csrfToken
}

let onUnauthorized: () => void = () => {}

/** Registered once at startup; called on any 401 from a non-auth endpoint. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Attaches the cached CSRF token to mutating requests. Exported for tests. */
export function applyCsrf(request: Request): Request {
  if (
    csrfToken !== null &&
    MUTATING_METHODS.has(request.method.toUpperCase()) &&
    !request.headers.has('X-CSRF-Token')
  ) {
    request.headers.set('X-CSRF-Token', csrfToken)
  }
  return request
}

/**
 * Global 401 handling: any unauthenticated response outside the auth
 * endpoints means the session is gone — bounce to /login. Exported for tests.
 */
export function handleUnauthorized(response: Response, request: Request): Response {
  if (
    response.status === 401 &&
    !new URL(request.url, 'http://localhost').pathname.startsWith('/api/v1/auth/')
  ) {
    onUnauthorized()
  }
  return response
}

/** Configure the generated fetch client. Called once from main.tsx. */
export function configureApiClient(): void {
  client.setConfig({ baseUrl: '/', credentials: 'include' })
  client.interceptors.request.use(applyCsrf)
  client.interceptors.response.use(handleUnauthorized)
}
