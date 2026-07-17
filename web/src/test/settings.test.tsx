import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp, stubApi, testViewerMe } from '@/test/render-app'
import { setCsrfToken } from '@/lib/api-client'

beforeEach(() => {
  stubApi()
})

afterEach(() => {
  vi.unstubAllGlobals()
  setCsrfToken(null)
})

describe('/settings?tab=sso', () => {
  it('renders the provider table with source chips and env read-only rows', async () => {
    renderApp('/settings?tab=sso')
    expect(await screen.findByText('Google Workspace')).toBeInTheDocument()
    // Slug + truncated client id in mono.
    expect(screen.getByText('google')).toBeInTheDocument()
    expect(screen.getByText('1234567890-abc.apps.googleusercontent.com')).toBeInTheDocument()
    // Source chips.
    expect(screen.getByText('database')).toBeInTheDocument()
    expect(screen.getByText('env')).toBeInTheDocument()
    // Database provider row has actions; env provider switch is read-only.
    expect(screen.getByRole('button', { name: 'Edit Google Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Google Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Corp Login enabled' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Edit Corp Login' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add provider/i })).toBeInTheDocument()
  })
})

describe('/settings?tab=users', () => {
  it('renders the users table with status chips and self-row protections', async () => {
    renderApp('/settings?tab=users')
    expect(await screen.findByText('ops@example.com')).toBeInTheDocument()
    expect(screen.getByText('newbie@example.com')).toBeInTheDocument()
    // Status chips: active admin, invited operator.
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Invited')).toBeInTheDocument()
    // Own row: role select disabled, no delete button.
    expect(screen.getByRole('combobox', { name: 'Role for ops@example.com' })).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Delete ops@example.com' }),
    ).not.toBeInTheDocument()
    // Other rows stay editable.
    expect(
      screen.getByRole('combobox', { name: 'Role for newbie@example.com' }),
    ).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete newbie@example.com' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /invite user/i })).toBeInTheDocument()
  })
})

describe('/settings as non-admin', () => {
  it('shows the requires-admin page and hides admin nav items', async () => {
    stubApi({ me: testViewerMe })
    renderApp('/settings')
    expect(
      await screen.findByText('This page requires the admin role'),
    ).toBeInTheDocument()
    // Nav: admin-only entries hidden, general ones present.
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /audit/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /metrics/i })).toBeInTheDocument()
  })
})
