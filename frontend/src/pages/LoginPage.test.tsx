import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { LoginPage } from './LoginPage'
import { whereTheyWereHeaded } from '../lib/afterSignIn'

const signIn = vi.fn()

vi.mock('../lib/supabaseClient', () => ({
  supabase: { auth: { signInWithPassword: (...a: unknown[]) => signIn(...(a as [])) } },
}))
const who = vi.hoisted(() => ({ session: null as unknown }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => who }))

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

/*
 * Somebody sent to sign in from a link (ProtectedRoute says where they
 * were going) lands there once they are in, not on the Dashboard.
 */
describe('after signing in', () => {
  function Where() {
    const { pathname, search } = useLocation()
    return <p>landed on {pathname + search}</p>
  }
  const signedInFrom = (state: unknown) => {
    who.session = { user: { id: 'u1' } }
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )
    who.session = null
  }

  it('goes on to the place they were headed', () => {
    signedInFrom({ from: '/polls?poll=q1' })
    expect(screen.getByText('landed on /polls?poll=q1')).toBeInTheDocument()
  })

  it('goes to the Dashboard when they were headed nowhere', () => {
    signedInFrom(null)
    expect(screen.getByText('landed on /')).toBeInTheDocument()
  })

  it('only ever goes somewhere inside the app', () => {
    expect(whereTheyWereHeaded({ from: '/polls?poll=q1' })).toBe('/polls?poll=q1')
    expect(whereTheyWereHeaded({ from: '/settings/health#errors' })).toBe('/settings/health#errors')
    for (const bad of [null, undefined, {}, { from: 7 }, { from: '' }, { from: 'https://elsewhere.example/' }, { from: '//elsewhere.example/' }, { from: '/\\elsewhere.example' }, { from: 'polls' }]) {
      expect(whereTheyWereHeaded(bad), JSON.stringify(bad)).toBe('/')
    }
    // Not back to the page they are on.
    expect(whereTheyWereHeaded({ from: '/login' })).toBe('/')
    expect(whereTheyWereHeaded({ from: '/login?removed=1' })).toBe('/')
  })
})
