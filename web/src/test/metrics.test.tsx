import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp, stubApi, testCustomer } from '@/test/render-app'
import { setCsrfToken } from '@/lib/api-client'

// jsdom has no canvas — swap the ECharts binding for an inert ref.
vi.mock('@/hooks/use-echarts', () => ({
  useECharts: () => ({ current: null }),
}))

beforeEach(() => {
  stubApi()
})

afterEach(() => {
  vi.unstubAllGlobals()
  setCsrfToken(null)
})

describe('/metrics', () => {
  it('prompts for a customer selection when none is picked', async () => {
    renderApp('/metrics')
    expect(await screen.findByText('Pick customers to compare')).toBeInTheDocument()
    expect(screen.getByText('Select customers…')).toBeInTheDocument()
    expect(screen.getByLabelText('Signal')).toBeInTheDocument()
    // 30d preset exists here (extended range set).
    expect(screen.getByRole('radio', { name: '30d' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Compare vs previous period' })).toBeInTheDocument()
  })

  it('renders chart and summary strip for a selected customer', async () => {
    renderApp(`/metrics?customers=${JSON.stringify([testCustomer.id])}`)
    expect(
      await screen.findByRole('img', { name: 'Per-customer throughput comparison chart' }),
    ).toBeInTheDocument()
    // Customer name appears in the multi-select summary and the summary tile.
    expect(screen.getAllByText('ACME Corp').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('items')).toBeInTheDocument()
  })
})
