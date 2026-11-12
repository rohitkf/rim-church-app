import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContactOrganisers } from './ContactOrganisers'

/*
 * "Need help?" on an event's public page and on a ticket (0287): a way to
 * reach the people running the event, for somebody with no account.
 */

const state = vi.hoisted(() => ({ calls: [] as { fn: string; args: Record<string, unknown> }[], answer: { ok: true } as unknown, error: null as unknown }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ fn, args })
      return Promise.resolve({ data: state.error ? null : state.answer, error: state.error })
    },
  },
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))

function show(props: Partial<Parameters<typeof ContactOrganisers>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ContactOrganisers slug="harvest-supper" eventTitle="Harvest Supper" {...props} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /Need help\? Message the organisers/ }))
  return screen.getByRole('dialog', { name: 'Message the organisers' })
}

beforeEach(() => {
  state.calls = []
  state.answer = { ok: true }
  state.error = null
})

describe('a message to the organisers', () => {
  it('is a button until it is pressed, and then says which event it is about', async () => {
    const user = show()
    expect(screen.queryByRole('dialog')).toBeNull()
    const dialog = await open(user)
    expect(dialog).toHaveTextContent('About Harvest Supper. They answer by email.')
  })

  it('sends who, where to answer and what, trimmed, and says it has gone', async () => {
    const user = show()
    const dialog = await open(user)
    await user.type(within(dialog).getByRole('textbox', { name: 'Your name' }), '  Vera Visitor ')
    await user.type(within(dialog).getByRole('textbox', { name: 'Your email' }), 'vera@example.org')
    await user.type(within(dialog).getByRole('textbox', { name: 'Your message' }), 'Is there parking? ')
    await user.click(within(dialog).getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(state.calls).toHaveLength(1))
    expect(state.calls[0]).toEqual({
      fn: 'registration_contact',
      args: { p_slug: 'harvest-supper', p_name: 'Vera Visitor', p_email: 'vera@example.org', p_message: 'Is there parking?', p_code: null },
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Your message has been sent. They will answer by email.')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('from a ticket, knows who is writing and takes the ticket with it', async () => {
    const user = show({ code: 'AAAAAAAAAAA1', name: 'Ann Awaiting', email: 'ann@example.org' })
    const dialog = await open(user)
    expect(within(dialog).getByRole('textbox', { name: 'Your name' })).toHaveValue('Ann Awaiting')
    expect(within(dialog).getByRole('textbox', { name: 'Your email' })).toHaveValue('ann@example.org')
    await user.type(within(dialog).getByRole('textbox', { name: 'Your message' }), 'I paid twice')
    await user.click(within(dialog).getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(state.calls).toHaveLength(1))
    expect(state.calls[0].args).toMatchObject({ p_code: 'AAAAAAAAAAA1', p_name: 'Ann Awaiting', p_message: 'I paid twice' })
  })

  it('is never greyed out for something missing: pressed, it says what, in red, and sends nothing', async () => {
    const user = show()
    const dialog = await open(user)
    const send = within(dialog).getByRole('button', { name: 'Send message' })
    expect(send).toBeEnabled()
    expect(within(dialog).queryByRole('alert')).toBeNull()

    await user.click(send)
    const wrong = within(dialog).getByRole('alert', { name: 'What to put right' })
    expect(within(wrong).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Your name is missing.',
      'Your email address is missing — it is how they answer you.',
      'Your message is empty.',
    ])
    expect(state.calls).toHaveLength(0)

    // Each box is marked, and says why to a screen reader.
    const name = within(dialog).getByRole('textbox', { name: 'Your name' })
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveClass('field-error')
    expect(document.getElementById(name.getAttribute('aria-describedby')!)).toHaveTextContent('Your name is missing.')
    // The first of them is where the cursor goes, and each line goes to its box.
    expect(name).toHaveFocus()
    await user.click(within(wrong).getByRole('button', { name: 'Your message is empty.' }))
    expect(within(dialog).getByRole('textbox', { name: 'Your message' })).toHaveFocus()
  })

  it('will not take an address that is not one', async () => {
    const user = show()
    const dialog = await open(user)
    await user.type(within(dialog).getByRole('textbox', { name: 'Your name' }), 'Vera')
    await user.type(within(dialog).getByRole('textbox', { name: 'Your email' }), 'vera at example')
    await user.type(within(dialog).getByRole('textbox', { name: 'Your message' }), 'Hello')
    await user.click(within(dialog).getByRole('button', { name: 'Send message' }))
    expect(within(dialog).getByRole('alert', { name: 'What to put right' })).toHaveTextContent('That email address doesn’t look right. It should be like name@example.com.')
    expect(state.calls).toHaveLength(0)

    // Put right, the red goes and it sends.
    await user.clear(within(dialog).getByRole('textbox', { name: 'Your email' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Your email' }), 'vera@example.org')
    expect(within(dialog).queryByRole('alert', { name: 'What to put right' })).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(state.calls).toHaveLength(1))
  })

  it('says what the database said when it would not take it, and keeps what was typed', async () => {
    state.answer = { ok: false, reason: 'too_many' }
    const user = show()
    const dialog = await open(user)
    await user.type(within(dialog).getByRole('textbox', { name: 'Your name' }), 'Sam')
    await user.type(within(dialog).getByRole('textbox', { name: 'Your email' }), 'sam@example.org')
    await user.type(within(dialog).getByRole('textbox', { name: 'Your message' }), 'again')
    await user.click(within(dialog).getByRole('button', { name: 'Send message' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Several messages have just been sent. Please wait a few minutes before sending another.')
    expect(within(dialog).getByRole('textbox', { name: 'Your message' })).toHaveValue('again')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('closes on Cancel, having sent nothing', async () => {
    const user = show()
    const dialog = await open(user)
    await user.type(within(dialog).getByRole('textbox', { name: 'Your message' }), 'never mind')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state.calls).toHaveLength(0)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
