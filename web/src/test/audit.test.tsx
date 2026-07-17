import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, stubApi } from '@/test/render-app'
import { setCsrfToken } from '@/lib/api-client'

beforeEach(() => {
  stubApi()
})

afterEach(() => {
  vi.unstubAllGlobals()
  setCsrfToken(null)
})

describe('/audit', () => {
  it('renders entries with actor, colored action chip, entity link, and filters', async () => {
    renderApp('/audit')
    // User actor shows the email; system actor shows a chip.
    expect(await screen.findByText('ops@example.com')).toBeInTheDocument()
    expect(screen.getByText('system')).toBeInTheDocument()
    // Action chips.
    expect(screen.getByText('create_pipeline')).toBeInTheDocument()
    expect(screen.getByText('delete_api_key')).toBeInTheDocument()
    // Entity link for the pipeline entry (short id).
    expect(screen.getByRole('link', { name: /pipeline 4f2c7a1e/ })).toBeInTheDocument()
    // Customer links.
    expect(screen.getAllByRole('link', { name: 'ACME Corp' }).length).toBeGreaterThan(0)
    // Filter bar incl. statics in the entity type select.
    expect(screen.getByLabelText('Action')).toBeInTheDocument()
    expect(screen.getByLabelText('Entity type')).toBeInTheDocument()
    expect(screen.getByLabelText('Customer')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'bootstrap_token' })).toBeInTheDocument()
    // Exhausted cursor → end-of-log marker instead of Load more.
    expect(screen.getByText(/end of log/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument()
  })

  it('expands the payload JSON for entries that carry one', async () => {
    const user = userEvent.setup()
    renderApp('/audit')
    const toggle = await screen.findByRole('button', { name: 'Payload of create_pipeline' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(screen.getByText(/"name": "edge-default"/)).toBeInTheDocument()
  })
})
