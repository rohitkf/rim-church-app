import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthContext } from '../auth/AuthContext'
import { SecondStepPage } from './SecondStepPage'

const giveCode = vi.hoisted(() => vi.fn())
vi.mock('../lib/secondStep', async (real) => ({ ...(await real<typeof import('../lib/secondStep')>()), giveCode }))
const reloadApp = vi.hoisted(() => vi.fn())
vi.mock('../lib/reloadApp', () => ({ reloadApp }))
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))

/*
 * The second step of signing in (0334): shown in place of the whole app
 * to an account that has given only its password.
 */
const signOut = vi.fn(() => Promise.resolve())
function show() {
  return render(
    <AuthContext.Provider value={{ signOut } as never}>
      <SecondStepPage factorId="f1" email="grace@example.com" />
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  giveCode.mockReset()
  reloadApp.mockClear()
  signOut.mockClear()
})

describe('the page that asks for the code', () => {
  it('says what is wanted and for which account, and names the tab', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'Enter the code from your authenticator app' })).toBeInTheDocument()
    expect(screen.getByText(/Your password was right/)).toHaveTextContent('grace@example.com')
    expect(document.title).toMatch(/^Enter your code/)
    const box = screen.getByLabelText('Six-digit code')
    // A phone offers the number pad, and a code texted or kept by the phone itself.
    expect(box).toHaveAttribute('inputmode', 'numeric')
    expect(box).toHaveAttribute('autocomplete', 'one-time-code')
    expect(screen.getByRole('button', { name: 'Finish signing in' })).toBeDisabled()
  })

  it('checks the code on its sixth digit and starts the app afresh when it is right', async () => {
    giveCode.mockResolvedValue(undefined)
    show()
    await userEvent.type(screen.getByLabelText('Six-digit code'), '123 456')
    await waitFor(() => expect(reloadApp).toHaveBeenCalledTimes(1))
    expect(giveCode).toHaveBeenCalledTimes(1)
    expect(giveCode).toHaveBeenCalledWith('f1', '123456')
  })

  it('says a wrong code was wrong, empties the box and lets them try the next one', async () => {
    giveCode.mockRejectedValueOnce({ message: 'Invalid TOTP code entered' })
    show()
    const box = screen.getByLabelText('Six-digit code')
    await userEvent.type(box, '000000')
    expect(await screen.findByRole('alert')).toHaveTextContent(/That code was not accepted.*enter the one showing now/)
    expect(box).toHaveValue('')
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(reloadApp).not.toHaveBeenCalled()
    giveCode.mockResolvedValueOnce(undefined)
    await userEvent.type(box, '654321')
    await waitFor(() => expect(reloadApp).toHaveBeenCalledTimes(1))
  })

  it('offers no way round, only a way out and who to ask', async () => {
    show()
    expect(screen.getByText(/Ask the church’s Owner to clear your second step/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
