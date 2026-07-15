import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { vi } from 'vitest'
import { routeTree } from '@/routeTree.gen'
import type { ApiKey, Customer, Me, StatsOverview } from '@/api/generated'

export const testMe: Me = {
  id: '4f2c7a1e-0000-4000-8000-000000000001',
  email: 'ops@example.com',
  displayName: 'Ops Admin',
  role: 'admin',
  csrfToken: 'csrf-test-token',
}

export const testCustomer: Customer = {
  id: '4f2c7a1e-0000-4000-8000-000000000002',
  slug: 'acme',
  name: 'ACME Corp',
  clientId: 'cust_7f3a9b2c',
  status: 'active',
  createdAt: '2026-07-01T09:00:00Z',
}

export const testApiKey: ApiKey = {
  id: '4f2c7a1e-0000-4000-8000-000000000003',
  customerId: testCustomer.id,
  name: 'prod-gateway',
  keyPrefix: 'otm_ab12cd34',
  createdAt: '2026-07-02T09:00:00Z',
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: '2026-07-15T08:00:00Z',
}

export const testOverview: StatsOverview = {
  activeCustomers: 3,
  totals: { logs: 864_000, traces: 432_000, metrics: 216_000 },
  refusedRequests: 12,
  topCustomers: [{ customerId: testCustomer.id, name: testCustomer.name, items: 900_000 }],
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Route-matching fetch stub for the endpoints the pages use. */
export function stubApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input)
      const path = new URL(request.url, 'http://localhost').pathname
      switch (path) {
        case '/api/v1/me':
          return json(testMe)
        case '/api/v1/auth/providers':
          return json({
            providers: [{ name: 'google', displayName: 'Google', loginUrl: '/auth/google/start' }],
            devLoginEnabled: true,
          })
        case '/api/v1/stats/overview':
          return json(testOverview)
        case '/api/v1/customers':
          return json({ customers: [testCustomer] })
        case `/api/v1/customers/${testCustomer.id}`:
          return json(testCustomer)
        case `/api/v1/customers/${testCustomer.id}/api-keys`:
          return json({ apiKeys: [testApiKey] })
        default:
          return new Response(JSON.stringify({ code: 'not_found', message: 'not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
      }
    }),
  )
}

export function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient, view }
}
