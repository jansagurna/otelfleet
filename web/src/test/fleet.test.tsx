import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp, stubApi, testAgent, testCustomer } from '@/test/render-app'
import { setCsrfToken } from '@/lib/api-client'

beforeEach(() => {
  stubApi()
})

afterEach(() => {
  vi.unstubAllGlobals()
  setCsrfToken(null)
})

describe('/fleet', () => {
  it('renders the agents table with status, config chip, and filters', async () => {
    renderApp('/fleet')
    expect(await screen.findByRole('link', { name: 'edge-agent-01' })).toBeInTheDocument()
    // Config-state chip derived from configInSync=true.
    expect(screen.getByText('in sync')).toBeInTheDocument()
    // Customer link for the agent.
    expect(screen.getByRole('link', { name: 'ACME Corp' })).toBeInTheDocument()
    // Filter bar.
    expect(screen.getByLabelText('Class')).toBeInTheDocument()
    expect(screen.getByLabelText('Customer')).toBeInTheDocument()
    expect(screen.getByLabelText('Connection')).toBeInTheDocument()
  })
})

describe('/fleet/$agentId', () => {
  it('renders the header and overview cards for a connected agent', async () => {
    renderApp(`/fleet/${testAgent.id}`)
    expect(await screen.findByRole('heading', { name: 'edge-agent-01' })).toBeInTheDocument()
    // Connected + healthy → green dot label in the header.
    expect(screen.getByText('Online, healthy')).toBeInTheDocument()
    // Overview cards.
    expect(screen.getByText('Remote config')).toBeInTheDocument()
    expect(screen.getByText('Health')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('host.name')).toBeInTheDocument()
    // Forget is blocked while the agent is connected.
    expect(screen.getByRole('button', { name: /forget agent/i })).toBeDisabled()
  })

  it('reaches the events tab with the timeline entries', async () => {
    renderApp(`/fleet/${testAgent.id}?tab=events`)
    expect(await screen.findByText('Connected')).toBeInTheDocument()
    expect(screen.getByLabelText('Agent events')).toBeInTheDocument()
  })
})

describe('/customers/$customerId (agents tab)', () => {
  it('renders bootstrap tokens and the enrolled-agents list', async () => {
    renderApp(`/customers/${testCustomer.id}?tab=agents`)
    expect(await screen.findByText('factory-floor')).toBeInTheDocument()
    expect(screen.getByText('obt_9x8y7z')).toBeInTheDocument()
    // Unlimited token → "3 / ∞".
    expect(screen.getByText('3 / ∞')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create token/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /revoke/i })).toBeInTheDocument()
    // The customer's agents, linking into the fleet.
    expect(screen.getByRole('link', { name: 'edge-agent-01' })).toBeInTheDocument()
  })
})
