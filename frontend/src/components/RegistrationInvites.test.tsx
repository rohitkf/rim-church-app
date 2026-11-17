import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegistrationInvites } from './RegistrationInvites'
import type { Invite, InviteDraft } from '../lib/registrationInvites'
import type { OrderRow, TicketType } from '../lib/registrations'

/*
 * An event's invitation links (0295), as the office sees them: what each
 * gives, how much of it is used and by whom, its link to copy; turning one
 * off, deleting one nobody came by, and the form that makes one.
 */

const state = vi.hoisted(() => ({
  invites: [] as unknown[],
  made: [] as unknown[],
  makeRefused: false,
  turned: [] as unknown[],
  deleted: [] as string[],
  toasts: [] as string[],
  copied: [] as string[],
  qr: [] as string[],
}))

vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/toast', () => ({ showToast: (text: string) => state.toasts.push(text) }))
vi.mock('../lib/qrPng', () => ({
  qrPngBlob: (text: string) => {
    state.qr.push(text)
    return Promise.resolve(new Blob())
  },
  downloadBlob: () => undefined,
}))
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../lib/registrationInvites', async (original) => ({
  ...(await original<typeof import('../lib/registrationInvites')>()),
  fetchInvites: () => Promise.resolve(state.invites),
  createInvite: (eventId: string, draft: InviteDraft) => {
    state.made.push({ eventId, draft })
    if (state.makeRefused) return Promise.reject(new Error('refused'))
    return Promise.resolve(invite({ id: 'new', token: 'NEWTKN234567', label: draft.label }))
  },
  setInviteActive: (id: string, active: boolean) => {
    state.turned.push([id, active])
    return Promise.resolve()
  },
  deleteInvite: (id: string) => {
    state.deleted.push(id)
    return Promise.resolve()
  },
}))

function invite(over: Partial<Invite> = {}): Invite {
  return {
    id: 'i-john',
    event_id: 'e1',
    token: 'K7QM2XPA9R4T',
    label: 'John Smith',
    kind: 'personal',
    locked_email: 'john@example.com',
    discount_kind: 'percent',
    discount_value: 100,
    ticket_type_ids: [],
    tickets_covered: 1,
    max_uses: 1,
    expires_at: null,
    active: true,
    anonymised_at: null,
    created_at: '2026-11-16T10:00:00Z',
    ...over,
  }
}
const youth = () => invite({ id: 'i-youth', token: 'W3HN8TQ2CEV6', label: 'Rim Youth WhatsApp', kind: 'group', locked_email: null, discount_kind: 'amount', discount_value: 1000, max_uses: 20 })

const order = (over: Partial<OrderRow>): OrderRow => ({
  id: 'o1',
  code: 'ABCDEFGHJKMN',
  date_id: null,
  name: 'Sarah Lee',
  email: 'sarah@example.org',
  phone: null,
  quantity: 1,
  subtotal_pence: 2000,
  discount_pence: 1000,
  total_pence: 1000,
  promo_code: null,
  invite_id: 'i-youth',
  payment_status: 'awaiting',
  payment_method: null,
  status: 'confirmed',
  checked_in_at: null,
  notes: null,
  anonymised_at: null,
  created_at: '2026-11-17T10:00:00Z',
  tickets: [],
  ...over,
})

const types: TicketType[] = [
  { id: 't-adult', event_id: 'e1', name: 'Adult', description: null, kind: 'paid', price_pence: 2500, min_donation_pence: null, quantity: null, sort_order: 0 },
  { id: 't-child', event_id: 'e1', name: 'Child', description: null, kind: 'paid', price_pence: 1000, min_donation_pence: null, quantity: null, sort_order: 1 },
  { id: 't-baby', event_id: 'e1', name: 'Baby', description: null, kind: 'free', price_pence: 0, min_donation_pence: null, quantity: null, sort_order: 2 },
]

function show(props: Partial<Parameters<typeof RegistrationInvites>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RegistrationInvites eventId="e1" slug="harvest-supper" eventTitle="Harvest Supper" published ticketTypes={types} orders={[]} ordersReady canEdit {...props} />
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  // After setup, which puts a clipboard of its own in the way.
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (state.copied.push(text), Promise.resolve()) },
  })
  return user
}

beforeEach(() => {
  state.invites = [invite(), youth()]
  state.made = []
  state.makeRefused = false
  state.turned = []
  state.deleted = []
  state.toasts = []
  state.copied = []
  state.qr = []
})

describe('an event’s invite links', () => {
  it('says what each link gives, who it is for and how much of it is used', async () => {
    show({
      orders: [
        order({}),
        order({ id: 'o2', name: 'Tom Brown' }),
        // Cancelled: its use came back, and it is not somebody who is coming.
        order({ id: 'o3', name: 'Gone Away', status: 'cancelled' }),
      ],
    })
    const john = await screen.findByRole('listitem', { name: 'John Smith' })
    expect(john).toHaveTextContent('john@example.com')
    expect(john).toHaveTextContent('Personal')
    expect(john).toHaveTextContent('1 free ticket')
    expect(john).toHaveTextContent('Not used yet')
    expect(within(john).getByLabelText('The link for John Smith')).toHaveTextContent('https://rim-church-app.vercel.app/register/harvest-supper?invite=K7QM2XPA9R4T')

    const group = screen.getByRole('listitem', { name: 'Rim Youth WhatsApp' })
    expect(group).toHaveTextContent('Group')
    expect(group).toHaveTextContent('£10.00 off')
    expect(group).toHaveTextContent('2 of 20 used')
    expect(group).toHaveTextContent('Registered: Sarah Lee, Tom Brown')
    expect(group).not.toHaveTextContent('Gone Away')
  })

  it('copies a link, and makes its QR code', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Copy the link for John Smith' }))
    expect(state.copied).toEqual(['https://rim-church-app.vercel.app/register/harvest-supper?invite=K7QM2XPA9R4T'])
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy the link for John Smith' })).toHaveTextContent('Copied'))

    await user.click(screen.getByRole('button', { name: 'Download a QR code for Rim Youth WhatsApp' }))
    await waitFor(() => expect(state.qr).toEqual(['https://rim-church-app.vercel.app/register/harvest-supper?invite=W3HN8TQ2CEV6']))
  })

  it('turns one link off, and back on, leaving the others alone', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Turn off the link for Rim Youth WhatsApp' }))
    await waitFor(() => expect(state.turned).toEqual([['i-youth', false]]))
    expect(state.toasts).toEqual(['Link turned off'])
  })

  it('marks a link that is off, ended or used up, and offers to turn an off one back on', async () => {
    state.invites = [
      invite({ id: 'a', label: 'Off link', active: false }),
      invite({ id: 'b', label: 'Old link', kind: 'group', locked_email: null, max_uses: 5, expires_at: '2026-01-01T23:59:00Z' }),
      invite({ id: 'c', label: 'Full link', kind: 'group', locked_email: null, max_uses: 1 }),
    ]
    show({ orders: [order({ invite_id: 'c' })] })
    expect(await screen.findByRole('listitem', { name: 'Off link' })).toHaveTextContent('Turned off')
    expect(screen.getByRole('button', { name: 'Turn on the link for Off link' })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Old link' })).toHaveTextContent('Ended')
    expect(screen.getByRole('listitem', { name: 'Old link' })).toHaveTextContent(/Works until .*1 Jan 2026/)
    expect(screen.getByRole('listitem', { name: 'Full link' })).toHaveTextContent('Used up')
  })

  it('deletes a link nobody came by, after asking — and only offers that for such a link', async () => {
    const user = show({ orders: [order({})] })
    await screen.findByRole('listitem', { name: 'John Smith' })
    // The group link has a registration: it can be turned off, not deleted.
    expect(screen.queryByRole('button', { name: 'Delete the link for Rim Youth WhatsApp' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Delete the link for John Smith' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete the link for John Smith?' })
    expect(state.deleted).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(state.deleted).toEqual(['i-john']))
  })

  it('says so when the browser would not copy the link, rather than “Copied”', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'John Smith' })
    // After setup, again: a clipboard that refuses, as a webview's or an insecure page's does.
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } })
    await user.click(screen.getByRole('button', { name: 'Copy the link for John Smith' }))
    const row = screen.getByRole('listitem', { name: 'John Smith' })
    expect(await within(row).findByText('This browser would not copy it. Select the link above and copy it by hand.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy the link for John Smith' })).toHaveTextContent('Not copied')
  })

  it('offers Delete for no link while the registrations have not been read: an empty list is not “nobody”', async () => {
    show({ orders: [], ordersReady: false })
    await screen.findByRole('listitem', { name: 'John Smith' })
    expect(screen.queryByRole('button', { name: /^Delete the link/ })).toBeNull()
    // Everything else about the row is there.
    expect(screen.getByRole('button', { name: 'Turn off the link for John Smith' })).toBeInTheDocument()
  })

  it('does not offer Delete for a link whose only registration was cancelled: it may yet be put back', async () => {
    show({ orders: [order({ invite_id: 'i-john', status: 'cancelled' })] })
    const row = await screen.findByRole('listitem', { name: 'John Smith' })
    // Its use came back…
    expect(row).toHaveTextContent('Not used yet')
    // …but the cancelled registration still names it.
    expect(screen.queryByRole('button', { name: 'Delete the link for John Smith' })).toBeNull()
  })

  it('shows a link whose details were removed with its event’s, with nothing left to copy', async () => {
    state.invites = [invite({ label: 'Anonymised', locked_email: null, active: false, anonymised_at: '2027-03-01T03:35:00Z' })]
    show({ orders: [order({ invite_id: 'i-john', name: 'Anonymised' })] })
    const row = await screen.findByRole('listitem', { name: 'Anonymised' })
    expect(row).toHaveTextContent('Details removed')
    expect(within(row).queryByRole('button')).toBeNull()
    expect(row).not.toHaveTextContent('invite=')
  })

  it('is a list to read for somebody who may not edit events', async () => {
    show({ canEdit: false })
    await screen.findByRole('listitem', { name: 'John Smith' })
    expect(screen.queryByRole('button', { name: 'New invite link' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Turn off/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
    // The link is still theirs to pass on.
    expect(screen.getByRole('button', { name: 'Copy the link for John Smith' })).toBeInTheDocument()
  })

  it('draws nothing for them while there are none', async () => {
    state.invites = []
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RegistrationInvites eventId="e1" slug="harvest-supper" eventTitle="Harvest Supper" published ticketTypes={types} orders={[]} ordersReady canEdit={false} />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('says the links wait for the event to be published', async () => {
    show({ published: false })
    expect(await screen.findByText(/takes registrations once it is published/)).toBeInTheDocument()
  })
})

describe('making an invite link', () => {
  const open = async (props: Partial<Parameters<typeof RegistrationInvites>[0]> = {}) => {
    const user = show(props)
    await user.click(await screen.findByRole('button', { name: 'New invite link' }))
    return { user, form: screen.getByRole('form', { name: 'New invite link' }) }
  }

  it('starts as one person’s free ticket, and makes it with a name and an address', async () => {
    const { user, form } = await open()
    expect(within(form).getByRole('radio', { name: 'One person' })).toBeChecked()
    expect(within(form).getByRole('textbox', { name: 'Percent off' })).toHaveValue('100')
    expect(within(form).getByRole('textbox', { name: 'Tickets covered' })).toHaveValue('1')

    await user.type(within(form).getByRole('textbox', { name: 'Who it is for' }), 'Mary Jones')
    await user.type(within(form).getByRole('textbox', { name: 'Their email' }), 'mary@example.com')
    await user.click(within(form).getByRole('button', { name: 'Make the link' }))

    await waitFor(() => expect(state.made).toHaveLength(1))
    expect(state.made[0]).toMatchObject({ eventId: 'e1', draft: { kind: 'personal', label: 'Mary Jones', email: 'mary@example.com', discount: 'percent', value: '100', ticketsCovered: '1' } })
    // Made, the link is on the clipboard, ready for a message.
    await waitFor(() => expect(state.copied).toEqual(['https://rim-church-app.vercel.app/register/harvest-supper?invite=NEWTKN234567']))
    expect(state.toasts).toEqual(['Link made and copied'])
    await waitFor(() => expect(screen.queryByRole('form', { name: 'New invite link' })).toBeNull())
  })

  it('pressed with things missing, says each by name and where, and makes nothing', async () => {
    const { user, form } = await open()
    // Nothing is called wrong before they have tried.
    expect(within(form).queryByRole('alert')).toBeNull()
    const make = within(form).getByRole('button', { name: 'Make the link' })
    // Never greyed out for something missing.
    expect(make).toBeEnabled()
    await user.click(make)

    const alert = within(form).getByRole('alert', { name: 'What to put right' })
    expect(within(alert).getByRole('button', { name: 'Say who it is for.' })).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Enter their email address: only that address can use the link.' })).toBeInTheDocument()
    expect(within(form).getByRole('textbox', { name: 'Who it is for' })).toHaveAttribute('aria-invalid', 'true')
    expect(within(form).getByRole('textbox', { name: 'Who it is for' })).toHaveFocus()
    expect(state.made).toEqual([])

    // Each line is a way to its field.
    await user.click(within(alert).getByRole('button', { name: /Enter their email address/ }))
    expect(within(form).getByRole('textbox', { name: 'Their email' })).toHaveFocus()
  })

  it('asks a group link for a limit, and holds a free one to twenty uses', async () => {
    const { user, form } = await open()
    await user.click(within(form).getByRole('radio', { name: 'A group' }))
    // No address for a group.
    expect(within(form).queryByRole('textbox', { name: 'Their email' })).toBeNull()
    await user.type(within(form).getByRole('textbox', { name: 'Name of the group' }), 'Youth')
    const uses = within(form).getByRole('textbox', { name: 'How many times it can be used' })
    await user.type(uses, '21')
    await user.click(within(form).getByRole('button', { name: 'Make the link' }))
    expect(within(form).getByRole('alert', { name: 'What to put right' })).toHaveTextContent('A link that makes tickets free can be used 20 times at most.')
    expect(state.made).toEqual([])

    await user.clear(uses)
    await user.type(uses, '20')
    await user.click(within(form).getByRole('button', { name: 'Make the link' }))
    await waitFor(() => expect(state.made).toHaveLength(1))
    expect(state.made[0]).toMatchObject({ draft: { kind: 'group', label: 'Youth', maxUses: '20', value: '100' } })
  })

  it('makes a link with no discount and no limit, to record who came by it', async () => {
    const { user, form } = await open()
    await user.click(within(form).getByRole('radio', { name: 'A group' }))
    await user.click(within(form).getByRole('radio', { name: 'No discount' }))
    expect(within(form).queryByRole('textbox', { name: 'Tickets covered' })).toBeNull()
    expect(within(form).getByRole('textbox', { name: 'How many times it can be used (optional)' })).toBeInTheDocument()
    await user.type(within(form).getByRole('textbox', { name: 'Name of the group' }), 'Pastor’s guests')
    await user.click(within(form).getByRole('button', { name: 'Make the link' }))
    await waitFor(() => expect(state.made).toHaveLength(1))
    expect(state.made[0]).toMatchObject({ draft: { kind: 'group', discount: 'none', maxUses: '' } })
  })

  it('keeps a discount to the ticket types ticked, and wants one ticked', async () => {
    const { user, form } = await open()
    await user.type(within(form).getByRole('textbox', { name: 'Who it is for' }), 'Mary Jones')
    await user.type(within(form).getByRole('textbox', { name: 'Their email' }), 'mary@example.com')
    await user.click(within(form).getByRole('radio', { name: 'Only these tickets' }))
    // Paid tickets only: there is nothing to take off a free one.
    expect(within(form).queryByRole('checkbox', { name: 'Baby' })).toBeNull()
    await user.click(within(form).getByRole('button', { name: 'Make the link' }))
    expect(within(form).getByRole('alert', { name: 'What to put right' })).toHaveTextContent('Tick at least one ticket, or choose every paid ticket.')

    await user.click(within(form).getByRole('checkbox', { name: 'Adult' }))
    await user.click(within(form).getByRole('button', { name: 'Make the link' }))
    await waitFor(() => expect(state.made).toHaveLength(1))
    expect(state.made[0]).toMatchObject({ draft: { limited: true, ticketTypeIds: ['t-adult'] } })
  })

  it('offers no discount on an event with no paid tickets, and says why', async () => {
    const { user, form } = await open({ ticketTypes: types.filter((t) => t.kind === 'free') })
    expect(within(form).getByText(/no paid tickets, so there is nothing for a link to take off/)).toBeInTheDocument()
    expect(within(form).queryByRole('radio', { name: 'Percent off' })).toBeNull()
    await user.type(within(form).getByRole('textbox', { name: 'Who it is for' }), 'Mary Jones')
    await user.type(within(form).getByRole('textbox', { name: 'Their email' }), 'mary@example.com')
    await user.click(within(form).getByRole('button', { name: 'Make the link' }))
    await waitFor(() => expect(state.made).toHaveLength(1))
    expect(state.made[0]).toMatchObject({ draft: { discount: 'none' } })
  })

  it('says so when the link could not be made, and keeps the form', async () => {
    state.makeRefused = true
    const { user, form } = await open()
    await user.type(within(form).getByRole('textbox', { name: 'Who it is for' }), 'Mary Jones')
    await user.type(within(form).getByRole('textbox', { name: 'Their email' }), 'mary@example.com')
    await user.click(within(form).getByRole('button', { name: 'Make the link' }))
    expect(await within(form).findByText('The link could not be made. Try again.')).toBeInTheDocument()
    expect(within(form).getByRole('textbox', { name: 'Who it is for' })).toHaveValue('Mary Jones')
  })
})
