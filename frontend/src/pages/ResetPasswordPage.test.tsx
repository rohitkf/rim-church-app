import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ResetPasswordPage } from './ResetPasswordPage'

const session = { user: { id: 'u1' } }
const updateUser = vi.fn()
const profileUpdate = vi.fn()
let profileRow: { first_name: string; last_name: string } | null = null

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session } }),
      getUser: () => Promise.resolve({ data: { user: session.user } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      updateUser: (...args: unknown[]) => updateUser(...(args as [])),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: profileRow, error: null }) }),
      }),
      update: (patch: unknown) => ({
        eq: (_col: string, id: string) => profileUpdate(patch, id),
      }),
    }),
  },
}))

function show() {
  render(
    <MemoryRouter>
      <ResetPasswordPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

/** The two password boxes are worded differently for a new arrival. */
const password = async (user: ReturnType<typeof userEvent.setup>, welcoming = true) => {
  await user.type(
    screen.getByLabelText(welcoming ? 'Choose a password' : 'New password'),
    'Str0ng!pass',
  )
  await user.type(
    screen.getByLabelText(welcoming ? 'Re-enter password' : 'Re-enter new password'),
    'Str0ng!pass',
  )
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    updateUser.mockReset().mockResolvedValue({ error: null })
    profileUpdate.mockReset().mockResolvedValue({ error: null })
  })

  describe('somebody arriving on an invitation, with no name on file', () => {
    beforeEach(() => {
      profileRow = { first_name: '', last_name: '' }
    })

    it('welcomes them rather than talking about a password they never had', async () => {
      show()
      expect(await screen.findByText(/Welcome — finish setting up/)).toBeInTheDocument()
      expect(screen.queryByText(/Choose a new password/)).not.toBeInTheDocument()
    })

    it('asks for a name, and will not continue without a first one', async () => {
      const user = show()
      await screen.findByLabelText('First name')
      await password(user)
      expect(screen.getByRole('button', { name: /Set password and continue/ })).toBeDisabled()
      await user.type(screen.getByLabelText('First name'), 'Grace')
      expect(screen.getByRole('button', { name: /Set password and continue/ })).toBeEnabled()
    })

    it('saves the name and the password, name first', async () => {
      const user = show()
      await screen.findByLabelText('First name')
      await user.type(screen.getByLabelText('First name'), 'Grace')
      await user.type(screen.getByLabelText('Last name'), 'Mensah')
      await password(user)
      await user.click(screen.getByRole('button', { name: /Set password and continue/ }))
      await waitFor(() => expect(updateUser).toHaveBeenCalled())
      expect(profileUpdate).toHaveBeenCalledWith({ first_name: 'Grace', last_name: 'Mensah' }, 'u1')
      expect(profileUpdate.mock.invocationCallOrder[0]).toBeLessThan(
        updateUser.mock.invocationCallOrder[0],
      )
      expect(await screen.findByText(/Good to have you, Grace/)).toBeInTheDocument()
    })

    it('takes a first name alone — a surname is not worth locking somebody out over', async () => {
      const user = show()
      await screen.findByLabelText('First name')
      await user.type(screen.getByLabelText('First name'), 'Grace')
      await password(user)
      await user.click(screen.getByRole('button', { name: /Set password and continue/ }))
      await waitFor(() =>
        expect(profileUpdate).toHaveBeenCalledWith({ first_name: 'Grace', last_name: '' }, 'u1'),
      )
    })

    it('keeps welcoming them even though the profile now has a name', async () => {
      // The auth listener fires again on the password change, and a re-read
      // would find the name just saved and decide they were never new — so
      // the page would change its wording underneath them mid-submit. It is
      // asked once and then left alone; the browser caught this, not the
      // mocks, so the test exists to keep it caught.
      const user = show()
      await screen.findByLabelText('First name')
      await user.type(screen.getByLabelText('First name'), 'Grace')
      await password(user)
      profileRow = { first_name: 'Grace', last_name: '' } // as a re-read would find it
      await user.click(screen.getByRole('button', { name: /Set password and continue/ }))
      expect(await screen.findByText(/Good to have you, Grace/)).toBeInTheDocument()
      expect(screen.getByText(/You’re all set/)).toBeInTheDocument()
    })

    it('leaves the password alone when the name could not be saved', async () => {
      profileUpdate.mockResolvedValue({ error: { message: 'Could not save your name.' } })
      const user = show()
      await screen.findByLabelText('First name')
      await user.type(screen.getByLabelText('First name'), 'Grace')
      await password(user)
      await user.click(screen.getByRole('button', { name: /Set password and continue/ }))
      expect(await screen.findByText('Could not save your name.')).toBeInTheDocument()
      // Nothing half-done: they can simply try again.
      expect(updateUser).not.toHaveBeenCalled()
    })
  })

  describe('somebody who already has a name, resetting a password', () => {
    beforeEach(() => {
      profileRow = { first_name: 'Rohit', last_name: 'Kumar' }
    })

    it('says what it has always said', async () => {
      show()
      expect(await screen.findByText(/Choose a new password/)).toBeInTheDocument()
      expect(screen.queryByLabelText('First name')).not.toBeInTheDocument()
    })

    it('changes the password and touches nothing else', async () => {
      const user = show()
      await screen.findByText(/Choose a new password/)
      await password(user, false)
      await user.click(screen.getByRole('button', { name: 'Update password' }))
      await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'Str0ng!pass' }))
      expect(profileUpdate).not.toHaveBeenCalled()
      expect(await screen.findByText(/signed in with your new password/)).toBeInTheDocument()
    })
  })
})
