import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderApp, stubApi, testCustomer, testSpans } from '@/test/render-app'
import { setCsrfToken } from '@/lib/api-client'
import { TraceWaterfall } from '@/features/explore/trace-waterfall'

beforeEach(() => {
  stubApi()
})

afterEach(() => {
  vi.unstubAllGlobals()
  setCsrfToken(null)
})

describe('/explore', () => {
  it('prompts for a customer when none is selected', async () => {
    renderApp('/explore')
    expect(await screen.findByText('Pick a customer to explore')).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Signal' })).toBeInTheDocument()
  })

  it('renders the logs view for the selected customer', async () => {
    renderApp(`/explore?customerId=${testCustomer.id}&signal=logs`)
    expect(await screen.findByText(/payment gateway timeout/)).toBeInTheDocument()
    // Severity chip colored from the number range.
    expect(screen.getByText('ERROR')).toBeInTheDocument()
    expect(screen.getByText('served / in 12ms')).toBeInTheDocument()
    expect(screen.getByLabelText('Search body')).toBeInTheDocument()
  })

  it('renders the traces view for the selected customer', async () => {
    renderApp(`/explore?customerId=${testCustomer.id}&signal=traces`)
    expect(await screen.findByText('GET /checkout')).toBeInTheDocument()
    // 'frontend' shows in both the row and the derived service filter option.
    expect(screen.getAllByText('frontend').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('switch', { name: 'Errors only' })).toBeInTheDocument()
    expect(screen.getByLabelText('Min duration (ms)')).toBeInTheDocument()
  })
})

describe('TraceWaterfall', () => {
  it('renders one row per span with the error span flagged', () => {
    render(<TraceWaterfall spans={testSpans} />)
    expect(screen.getByText('GET /checkout')).toBeInTheDocument()
    expect(screen.getByText('charge card')).toBeInTheDocument()
    expect(screen.getByText('2 spans')).toBeInTheDocument()
    // The errored child span carries an ERROR flag.
    expect(screen.getByText('ERROR')).toBeInTheDocument()
  })

  it('is empty-safe', () => {
    render(<TraceWaterfall spans={[]} />)
    expect(screen.getByText('This trace has no spans.')).toBeInTheDocument()
  })
})
