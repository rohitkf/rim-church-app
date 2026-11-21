import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SignupPage } from './SignupPage'
import { setConfirmEmailWaitForTests } from '../lib/emailDelivery'

const auth = vi.hoisted(() => ({
  calls: [] as { email: string; data: unknown }[],
  error: null as { message: string } | null,
  // What the service hands back: a new account has an identity, an existing one has none.
  user: { identities: [{}] } as { identities: unknown[] } | null,
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: null }) }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      signUp: (a: { email: string; options: { data: unknown } }) => {
        auth.calls.push({ email: a.email, data: a.options.data })
        return Promise.resolve({ data: { user: auth.error ? null : auth.user }, error: auth.error })
      },
      resend: () => Promise.resolve({ error: null }),
    },
  },
}))

beforeEach(() => {
  // "Yes" waits five seconds on the page; a test has no reason to.
  setConfirmEmailWaitForTests(0)
  auth.calls = []
  auth.error = null
  auth.user = { identities: [{}] }
})

/**
 * Fill the form in and press Sign up. `again` is the second email box
 * (the same as the first unless said). With `confirm`, the address is
 * then said to be theirs in the dialog that asks, if it came up.
 */
async function fillIn(email = '  ada@gmail.com ', name: [string, string] = ['Ada', 'Grace'], { again = email, confirm = true } = {}) {
  render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
  )
  const user = userEvent.setup()
  const [first, last] = screen.getAllByRole('textbox')
  await user.type(first, name[0])
  await user.type(last, name[1])
  await user.type(screen.getByRole('textbox', { name: 'Email' }), email)
  await user.type(screen.getByRole('textbox', { name: 'Confirm email' }), again)
  const passwords = document.querySelectorAll('input[type="password"]')
  await user.type(passwords[0] as HTMLElement, 'Sunday-Rota-9')
  await user.type(passwords[1] as HTMLElement, 'Sunday-Rota-9')
  await user.click(screen.getByRole('button', { name: 'Sign up' }))
  const asked = screen.queryByRole('dialog', { name: 'Is this your email address?' })
  if (confirm && asked) await user.click(await screen.findByRole('button', { name: 'Yes, it’s right — Sign up' }))
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
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('ada@gmail.com')
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('Ada')
  })

  it('saves a name the way a name is written, however it was typed', async () => {
    await fillIn(undefined, ['aDA', 'o’NEIL-smith '])
    await screen.findByRole('dialog', { name: 'Check your email' })
    expect(auth.calls[0].data).toEqual({ first_name: 'Ada', last_name: "O'Neil-Smith" })
  })

  it('will not make an account for a name that is not one, and says what to take out', async () => {
    await fillIn(undefined, ['y@cht_234', 'Grace'])
    expect(screen.getByText('First name can only have letters in it. Take out @, _, 2, 3 and 4.')).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')[0]).toHaveAttribute('aria-invalid', 'true')
    expect(auth.calls).toHaveLength(0)
    expect(screen.queryByRole('dialog', { name: 'Check your email' })).toBeNull()
  })

  // There is no .con: the confirmation could never arrive, and the account could never be confirmed.
  it('makes no account for an address that cannot be one, and says the one that was meant', async () => {
    const user = await fillIn('ada@gmail.con')
    expect(auth.calls).toEqual([])
    expect(screen.getByText('Email addresses do not end in “.con”. Check the end of yours.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    // One press puts both boxes right.
    await user.click(screen.getByRole('button', { name: 'ada@gmail.com' }))
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('ada@gmail.com')
    expect(screen.getByRole('textbox', { name: 'Confirm email' })).toHaveValue('ada@gmail.com')
    expect(screen.queryByText(/do not end in/)).toBeNull()
  })

  /*
   * As registering for an event does (November 2026): the address is
   * typed twice, then shown on its own and asked about, and only then is
   * the account made. An account made with a slip in its address can
   * never be confirmed.
   */
  describe('the address, confirmed twice over', () => {
    it('wants it typed twice, the same', async () => {
      await fillIn('ada@gmail.com', undefined, { again: 'ada@gmial.com' })
      expect(auth.calls).toEqual([])
      expect(screen.getByText('The two email addresses are different. They have to be the same.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('does not call capitals or a trailing space a difference', async () => {
      await fillIn('Ada@Gmail.com', undefined, { again: 'ada@gmail.com ' })
      expect(await screen.findByRole('dialog', { name: 'Check your email' })).toBeInTheDocument()
      expect(auth.calls[0].email).toBe('Ada@Gmail.com')
    })

    it('says the two agree once they do', async () => {
      await fillIn(undefined, undefined, { confirm: false })
      expect(screen.getByText('The same as the one above.')).toBeInTheDocument()
    })

    it('asks whether the address is theirs before anything is made, and says where the link goes', async () => {
      await fillIn(undefined, undefined, { confirm: false })
      const dialog = screen.getByRole('dialog', { name: 'Is this your email address?' })
      expect(dialog).toHaveTextContent('ada@gmail.com')
      expect(dialog).toHaveTextContent('The link to confirm your account is sent here, and nowhere else.')
      expect(auth.calls).toEqual([])
    })

    it('goes back to the form, everything as it was, on No', async () => {
      const user = await fillIn(undefined, undefined, { confirm: false })
      await user.click(screen.getByRole('button', { name: 'No, change it' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(auth.calls).toEqual([])
      expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('ada@gmail.com')
      expect(screen.getAllByRole('textbox')[0]).toHaveValue('Ada')
    })

    it('makes the account on Yes, and only then', async () => {
      const user = await fillIn(undefined, undefined, { confirm: false })
      await user.click(await screen.findByRole('button', { name: 'Yes, it’s right — Sign up' }))
      expect(await screen.findByRole('dialog', { name: 'Check your email' })).toBeInTheDocument()
      expect(auth.calls).toHaveLength(1)
      expect(screen.queryByRole('dialog', { name: 'Is this your email address?' })).toBeNull()
    })

    it('holds Yes back while the address is read', async () => {
      setConfirmEmailWaitForTests(5)
      await fillIn(undefined, undefined, { confirm: false })
      expect(screen.getByRole('button', { name: /Check the address/ })).toBeDisabled()
      expect(auth.calls).toEqual([])
    })

    it('offers the spelling of a well-known domain typed nearly right, and takes it for both boxes', async () => {
      const user = await fillIn('ada@gmial.com', undefined, { confirm: false })
      const dialog = screen.getByRole('dialog', { name: 'Is this your email address?' })
      expect(dialog).toHaveTextContent('Did you mean ada@gmail.com?')
      await user.click(screen.getByRole('button', { name: 'Yes, use that one' }))
      await user.click(await screen.findByRole('button', { name: 'Yes, it’s right — Sign up' }))
      await screen.findByRole('dialog', { name: 'Check your email' })
      expect(auth.calls[0].email).toBe('ada@gmail.com')
    })
  })

  it('shows no such dialog when sign-up failed', async () => {
    auth.error = { message: 'Password is too weak' }
    await fillIn()
    expect(await screen.findByText('Password is too weak')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Check your email' })).toBeNull()
  })

  it('says so when the address already has an account, instead of "check your email"', async () => {
    // The service answers as if it had made the account, and sends nothing.
    auth.user = { identities: [] }
    await fillIn()
    expect(await screen.findByRole('alert')).toHaveTextContent('already an account for ada@gmail.com')
    expect(screen.queryByRole('dialog', { name: 'Check your email' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Reset my password' })).toHaveAttribute('href', '/forgot-password')
  })
})
