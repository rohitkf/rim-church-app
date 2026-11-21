import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ForgotPasswordPage } from './ForgotPasswordPage'

const reset = vi.hoisted(() => vi.fn(() => Promise.resolve({ error: null })))
vi.mock('../lib/supabaseClient', () => ({ supabase: { auth: { resetPasswordForEmail: reset } } }))

beforeEach(() => reset.mockClear())

async function ask(email: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  )
  await user.type(screen.getByRole('textbox'), email)
  await user.click(screen.getByRole('button', { name: /send|reset/i }))
  return user
}

describe('asking for a link to reset a password', () => {
  it('sends one to an address that can be one', async () => {
    await ask('ada@gmail.com')
    expect(reset).toHaveBeenCalledWith('ada@gmail.com', expect.anything())
    expect(await screen.findByText(/If an account exists for ada@gmail\.com/)).toBeInTheDocument()
  })

  // No link can reach "…@gmail.con", and "check your email" would send them to wait for it.
  it('does not ask for one for an address that cannot be one, and says the one that was meant', async () => {
    await ask('ada@gmail.con')
    expect(reset).not.toHaveBeenCalled()
    expect(screen.getByText(/Email addresses do not end in “\.con”.*Did you mean ada@gmail\.com\?/)).toBeInTheDocument()
    expect(screen.queryByText(/If an account exists/)).toBeNull()
  })
})
