import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SignupPage } from './SignupPage'

const auth = vi.hoisted(() => ({
  calls: [] as { email: string; data: unknown }[],
  error: null as { message: string } | null,
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: null }) }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      signUp: (a: { email: string; options: { data: unknown } }) => {
        auth.calls.push({ email: a.email, data: a.options.data })
        return Promise.resolve({ error: auth.error })
      },
      resend: () => Promise.resolve({ error: null }),
    },
  },
}))

beforeEach(() => {
  auth.calls = []
  auth.error = null
})

async function fillIn(email = '  ada@gmail.com ') {
  render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
  )
  const user = userEvent.setup()
  const [first, last] = screen.getAllByRole('textbox')
  await user.type(first, 'Ada')
  await user.type(last, 'Grace')
  await user.type(screen.getByRole('textbox', { name: /email/i }), email)
  const passwords = document.querySelectorAll('input[type="password"]')
  await user.type(passwords[0] as HTMLElement, 'Sunday-Rota-9')
  await user.type(passwords[1] as HTMLElement, 'Sunday-Rota-9')
  await user.click(screen.getByRole('button', { name: /create account|sign up/i }))
  return user
}

describe('signing up', () => {
  it('tells them where the confirmation went — the address they typed, tidied — and to check spam', async () => {
    await fillIn()
    expect(await screen.findByRole('dialog', { name: 'Check your email' })).toBeInTheDocument()
    expect(auth.calls[0].email).toBe('ada@gmail.com')
    expect(screen.getByText('ada@gmail.com')).toBeInTheDocument()
    expect(screen.getByText(/spam or junk/)).toBeInTheDocument()
  })

  it('goes back to the form, with what they typed, when the address was wrong', async () => {
    const user = await fillIn()
    await screen.findByRole('dialog', { name: 'Check your email' })
    await user.click(screen.getByRole('button', { name: 'Wrong address? Go back' }))
    expect(screen.queryByRole('dialog', { name: 'Check your email' })).toBeNull()
    // (An email field drops stray spaces itself.)
    expect(screen.getByRole('textbox', { name: /email/i })).toHaveValue('ada@gmail.com')
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('Ada')
  })

  it('shows no such dialog when sign-up failed', async () => {
    auth.error = { message: 'Password is too weak' }
    await fillIn()
    expect(await screen.findByText('Password is too weak')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Check your email' })).toBeNull()
  })
})
