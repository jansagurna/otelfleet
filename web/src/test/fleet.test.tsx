import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('shows the display name, reported name, labels, and a neutral chip for an unacknowledged agent', async () => {
    renderApp('/fleet')
    // displayName wins in the name column; the reported name shows beneath.
    expect(await screen.findByRole('link', { name: 'EU Gateway' })).toBeInTheDocument()
    expect(screen.getByText('gateway-eu-01')).toBeInTheDocument()
    // Operator labels render as compact key=value chips.
    expect(screen.getByText('region=eu')).toBeInTheDocument()
    expect(screen.getByText('role=ingest')).toBeInTheDocument()
    // configInSync=null → neutral "—" chip, not "out of sync".
    expect(screen.getByTitle('The agent has not acknowledged a config yet.')).toHaveTextContent('—')
    expect(screen.queryByText('out of sync')).not.toBeInTheDocument()
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

  it('offers re-sync and edit actions, and opens the edit dialog', async () => {
    const user = userEvent.setup()
    renderApp(`/fleet/${testAgent.id}`)
    // Edge agent → re-sync is enabled; edit is always available to operators.
    expect(await screen.findByRole('button', { name: /re-sync/i })).not.toBeDisabled()
    await user.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Edit agent' })).toBeInTheDocument()
    expect(screen.getByLabelText('Display name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add label/i })).toBeInTheDocument()
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
