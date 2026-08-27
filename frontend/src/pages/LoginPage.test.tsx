import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from './LoginPage'

const signIn = vi.fn()

vi.mock('../lib/supabaseClient', () => ({
  supabase: { auth: { signInWithPassword: (...a: unknown[]) => signIn(...(a as [])) } },
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: null }) }))

async function submit() {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
  await user.type(screen.getByLabelText('Email'), 'ada@example.com')
  // The password label wraps the show/hide button too, so go by the field.
  await user.type(document.querySelector('input[type=password]')!, 'hunter2hunter2')
  await user.click(screen.getByRole('button', { name: /^sign in$/i }))
}

describe('LoginPage', () => {
  it('reports a refused sign-in and frees the button', async () => {
    signIn.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
    await submit()
    expect(await screen.findByText(/invalid login credentials/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^sign in$/i })).not.toBeDisabled(),
    )
  })

  it('never stays on "Signing in…" when the request fails outright', async () => {
    // A dead endpoint, a request past its deadline, a phone that lost
    // signal: supabase-js rejects rather than returning an error, and the
    // button used to sit there for ever looking like progress.
    signIn.mockRejectedValueOnce({ message: 'The server took too long to respond.' })
    await submit()

    expect(await screen.findByText(/took too long/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /signing in/i })).not.toBeInTheDocument(),
    )
  })

  it('falls back to plain words when the failure carries no message', async () => {
    signIn.mockRejectedValueOnce(new Error(''))
    await submit()
    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument()
  })
})
