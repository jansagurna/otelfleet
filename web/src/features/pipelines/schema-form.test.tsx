import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SchemaForm, fieldKind, type JsonSchema } from '@/features/pipelines/schema-form'
import { REDACTED_SENTINEL } from '@/lib/secrets'

const SECRET_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    endpoint: { type: 'string' },
    token: { type: 'string', format: 'password' },
  },
}

function Harness({ initial }: { initial: Record<string, unknown> }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <SchemaForm schema={SECRET_SCHEMA} value={value} onChange={setValue} idPrefix="t" />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  )
}

const currentValue = () =>
  JSON.parse(screen.getByTestId('value').textContent ?? '{}') as Record<string, unknown>

describe('fieldKind', () => {
  it('classifies format password as the password widget', () => {
    expect(fieldKind({ type: 'string', format: 'password' })).toBe('password')
  })
})

describe('schema-form stored-secret sentinel', () => {
  it('renders the sentinel as a stored placeholder, not the raw value', () => {
    render(<Harness initial={{ token: REDACTED_SENTINEL }} />)
    const stored = screen.getByLabelText('token (stored secret)')
    expect(stored).toHaveAttribute('placeholder', '•••••• (stored)')
    expect(stored).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Replace token' })).toBeInTheDocument()
    // Untouched, the sentinel stays in the config for validate/preview.
    expect(currentValue().token).toBe(REDACTED_SENTINEL)
  })

  it('replace clears to an editable input; typing rotates the secret', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ token: REDACTED_SENTINEL }} />)
    await user.click(screen.getByRole('button', { name: 'Replace token' }))
    const input = screen.getByLabelText<HTMLInputElement>('token', { selector: 'input' })
    expect(input.type).toBe('password')
    expect(input).not.toBeDisabled()
    await user.type(input, 'new-secret')
    expect(currentValue().token).toBe('new-secret')
  })

  it('reset restores the sentinel (keeps the stored secret)', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ token: REDACTED_SENTINEL }} />)
    await user.click(screen.getByRole('button', { name: 'Replace token' }))
    await user.type(screen.getByLabelText('token', { selector: 'input' }), 'typo')
    await user.click(screen.getByRole('button', { name: 'Keep stored token' }))
    expect(currentValue().token).toBe(REDACTED_SENTINEL)
    expect(screen.getByLabelText('token (stored secret)')).toHaveAttribute(
      'placeholder',
      '•••••• (stored)',
    )
  })

  it('offers no reset affordance for fields that never held a stored secret', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{}} />)
    const input = screen.getByLabelText<HTMLInputElement>('token', { selector: 'input' })
    await user.type(input, 'fresh')
    expect(screen.queryByRole('button', { name: 'Keep stored token' })).not.toBeInTheDocument()
    expect(currentValue().token).toBe('fresh')
  })
})
