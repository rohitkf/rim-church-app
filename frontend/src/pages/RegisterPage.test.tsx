import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegisterPage } from './RegisterPage'
import type { PublicEvent } from '../lib/registrations'
import { setConfirmEmailWaitForTests } from '../lib/emailDelivery'

/*
 * An event's public page (0244): what it is and when, the tickets with how
 * many are left, the form, the sum — and then their ticket. Nobody signs in.
 */

const state = vi.hoisted(() => ({
  event: null as unknown,
  promo: { ok: false } as unknown,
  registered: [] as unknown[],
  mailed: [] as string[],
  resent: [] as unknown[],
  resendAnswer: { ok: true, sent: true } as unknown,
  refuse: null as string | null,
  /** What registering answers: the order's code, or — for a personal invitation (0297) — that the ticket went by email. */
  answer: { code: 'ABCDEFGHJKMN', byEmail: false } as { code: string | null; byEmail: boolean },
  /** What the database says of the invitation link (0295); an Error is a check that could not be made. */
  invite: { ok: false, reason: 'not_found' } as unknown,
  inviteChecks: [] as string[],
  // Whoever is signed in on this device, and the pages they may open: nobody, for somebody registering.
  session: null as unknown,
  opens: [] as string[],
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false, isSuperAdmin: false, session: state.session }) }))
// Who may open which page: asked only about somebody signed in (components/StaffBackBar).
vi.mock('../lib/usePageAccess', () => ({
  usePageAccess: () => ({ standing: 'member', settled: true, canOpen: (path: string) => state.opens.includes(path) }),
}))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'https://signed/logo.png' }, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://public/${path}` } }),
      }),
    },
  },
}))
vi.mock('../components/PlaceMap', () => ({
  PlaceMap: ({ lat, lng }: { lat: number; lng: number }) => <p>map at {lat.toFixed(2)},{lng.toFixed(2)}</p>,
}))
vi.mock('../lib/registrations', async (original) => ({
  ...(await original<typeof import('../lib/registrations')>()),
  fetchPublicEvent: () => Promise.resolve(state.event),
  checkPromoCode: () => Promise.resolve(state.promo),
  registerForEvent: (slug: string, order: unknown) => {
    state.registered.push({ slug, order })
    return state.refuse ? Promise.reject(new Error(state.refuse)) : Promise.resolve(state.answer)
  },
  sendTicketEmail: (code: string) => {
    state.mailed.push(code)
    return Promise.resolve({ ok: true, sent: true })
  },
  resendTickets: (slug: string, email: string) => {
    state.resent.push([slug, email])
    return state.resendAnswer instanceof Error ? Promise.reject(state.resendAnswer) : Promise.resolve(state.resendAnswer)
  },
}))

vi.mock('../lib/registrationInvites', async (original) => ({
  ...(await original<typeof import('../lib/registrationInvites')>()),
  checkInvite: (_slug: string, token: string) => {
    state.inviteChecks.push(token)
    // An Error is a check that could not be made; a promise is one still on its way.
    return state.invite instanceof Error ? Promise.reject(state.invite) : Promise.resolve(state.invite)
  },
}))

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()

const event = (over: Partial<PublicEvent> = {}): PublicEvent => ({
  id: 'e1',
  slug: 'pastors-2026',
  title: 'Pastors & Leaders 2026',
  description: 'Two evenings. Details at https://example.org/plc',
  image_path: null,
  status: 'published',
  date_mode: 'all',
  location: { name: 'Church Hall', address: '12 High Street\nReading', latitude: 51.45, longitude: -0.97 },
  opens_at: null,
  closes_at: null,
  open: true,
  closed_reason: null,
  min_per_order: 1,
  max_per_order: 4,
  allow_pay_at_reception: true,
  payment_note: null,
  dates: [{ id: 'd1', starts_at: at(2026, 11, 21, 18, 30), ends_at: at(2026, 11, 21, 21, 0), label: null, open: true }],
  ticket_types: [
    { id: 't-std', name: 'Standard', description: null, kind: 'free', price_pence: 0, min_donation_pence: null, quantity: 10, remaining: 3, remaining_by_date: {} },
    { id: 't-lunch', name: 'With lunch', description: 'Includes lunch', kind: 'paid', price_pence: 2000, min_donation_pence: null, quantity: null, remaining: null, remaining_by_date: {} },
  ],
  agenda: [],
  logo_path: null,
  ...over,
})

function TicketStub() {
  const { code } = useParams()
  return <p>ticket page {code}</p>
}

function show(search = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/register/pastors-2026${search}`]}>
        <Routes>
          <Route path="/register/:slug" element={<RegisterPage />} />
          <Route path="/ticket/:code" element={<TicketStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const fillWho = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama Owusu')
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ama@example.org')
  await user.type(screen.getByRole('textbox', { name: 'Confirm email' }), 'ama@example.org')
  // A GB number by default, kept as its international form. (07700 900xxx is
  // the drama range, which the phone library rightly refuses.)
  await user.type(screen.getByRole('textbox', { name: 'Phone' }), '07911 123456')
}

beforeEach(() => {
  state.session = null
  state.opens = []
  // "Yes, it’s right" counts down five seconds before it can be pressed
  // (ConfirmEmailDialog.test.tsx holds that); the form's tests do not wait for it.
  setConfirmEmailWaitForTests(0)
  state.event = event()
  state.promo = { ok: false }
  state.registered = []
  state.mailed = []
  state.resent = []
  state.resendAnswer = { ok: true, sent: true }
  state.refuse = null
  state.answer = { code: 'ABCDEFGHJKMN', byEmail: false }
  state.invite = { ok: false, reason: 'not_found' }
  state.inviteChecks = []
})

/** The address is shown back before anything is sent (0283): say it is right. */
const confirmEmail = async (user: ReturnType<typeof userEvent.setup>, label = 'Register') => {
  const dialog = await screen.findByRole('dialog', { name: 'Is this your email address?' })
  await user.click(within(dialog).getByRole('button', { name: `Yes, it’s right — ${label}` }))
}

describe('the public register page', () => {
  it('gives whoever runs registrations a way back to them, and somebody registering none', async () => {
    // The Owner, November 2026: the same bar a ticket has, on the registration link — for the office alone.
    show()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('navigation', { name: 'For the team' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Back to/ })).toBeNull()
  })

  it('shows the way back above the event, to this event’s registrations', async () => {
    state.session = { user: { id: 'u1' } }
    state.opens = ['/registrations']
    show()
    const bar = await screen.findByRole('navigation', { name: 'For the team' })
    expect(within(bar).getByRole('link', { name: 'Back to registrations' })).toHaveAttribute('href', '/registrations/e1')
    const title = screen.getByRole('heading', { level: 1 })
    expect(bar.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not show it to somebody who only works the door', async () => {
    state.session = { user: { id: 'u1' } }
    state.opens = ['/door']
    show()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('navigation', { name: 'For the team' })).toBeNull()
  })

  it('does not leave whoever runs registrations on a dead link either', async () => {
    state.session = { user: { id: 'u1' } }
    state.opens = ['/registrations']
    state.event = null
    show()
    expect(await screen.findByRole('heading', { name: 'No such event' })).toBeInTheDocument()
    // The event is not known, so the way back is to the list of events.
    expect(await screen.findByRole('link', { name: 'Back to registrations' })).toHaveAttribute('href', '/registrations')
  })

  it('says what, when, where and what is left, with a way to get there', async () => {
    show()
    expect(await screen.findByRole('heading', { level: 1, name: 'Pastors & Leaders 2026' })).toBeInTheDocument()
    expect(screen.getByText('Church Hall')).toBeInTheDocument()
    expect(screen.getByText('map at 51.45,-0.97')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open directions/ })).toHaveAttribute('href', expect.stringContaining('google.com/maps'))
    expect(screen.getByRole('link', { name: /example\.org\/plc/ })).toHaveAttribute('href', 'https://example.org/plc')
    // The paid type has no limit, so there is no number to show.
    expect(screen.queryByText(/tickets left/)).toBeNull()
    expect(within(screen.getByRole('listitem', { name: 'Standard' })).getByText(/3 left/)).toBeInTheDocument()
  })

  it('counts what is left when every type has a limit, and says sold out', async () => {
    const e = event()
    e.ticket_types[1] = { ...e.ticket_types[1], quantity: 20, remaining: 2 }
    state.event = e
    show()
    expect(await screen.findByText('5 tickets left')).toBeInTheDocument()
  })

  it('is sold out when nothing is left of any type', async () => {
    const e = event()
    e.ticket_types = [{ ...e.ticket_types[0], remaining: 0 }]
    state.event = e
    const user = show()
    expect(await screen.findByText('Sold out')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'One more Standard' })).toBeDisabled()
    await fillWho(user)
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled()
  })

  it('takes an order, names and all, and goes to the ticket', async () => {
    const user = show()
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'One more Standard' }))
    await user.click(screen.getByRole('button', { name: 'One more Standard' }))
    await user.type(screen.getByRole('textbox', { name: 'Standard 2 name' }), 'Kofi Owusu')
    await fillWho(user)
    expect(screen.getByText('2 tickets')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Register' }))
    await confirmEmail(user)

    expect(await screen.findByText('ticket page ABCDEFGHJKMN')).toBeInTheDocument()
    // The ticket goes by email too, without anything waiting on it.
    expect(state.mailed).toEqual(['ABCDEFGHJKMN'])
    expect(state.registered).toEqual([
      {
        slug: 'pastors-2026',
        order: {
          name: 'Ama Owusu',
          email: 'ama@example.org',
          phone: '+447911123456',
          date_id: null,
          promo_code: '',
          lines: [{ ticket_type_id: 't-std', quantity: 2, attendee_names: ['', 'Kofi Owusu'], donation_pence: undefined }],
          website: '',
        },
      },
    ])
  })

  it('shows the steps ahead once there is something to pay, and none on a free order', async () => {
    const user = show()
    await screen.findByRole('heading', { level: 1 })
    // Nothing chosen, nothing to pay: registering is all of it.
    expect(screen.queryByRole('list', { name: 'What happens next' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'One more With lunch' }))
    const steps = within(screen.getByRole('list', { name: 'What happens next' })).getAllByRole('listitem')
    expect(steps.map((li) => li.textContent)).toEqual(['1Register — current step', '2Pay — still to do', '3Ticket — still to do'])
    expect(screen.getByText('Step 1 of 3: register. Next you pay £20.00, and then it is your ticket.')).toBeInTheDocument()
  })

  it('does not call an order with nothing in it free', async () => {
    const user = show()
    await screen.findByRole('heading', { level: 1 })
    // As the page opens: no tickets picked, so no price — "Free" here read
    // as what a ticket costs.
    const order = screen.getByLabelText('Your order')
    expect(order).toHaveTextContent('No tickets chosen yet')
    expect(order).not.toHaveTextContent('Free')
    expect(order).not.toHaveTextContent('0 tickets')

    // Free is said of a free ticket once somebody has picked one…
    await user.click(screen.getByRole('button', { name: 'One more Standard' }))
    expect(order).toHaveTextContent('1 ticket')
    expect(order).toHaveTextContent('TotalFree')

    // …and a paid one says its price.
    await user.click(screen.getByRole('button', { name: 'One more With lunch' }))
    expect(order).toHaveTextContent('2 tickets')
    expect(order).toHaveTextContent('Total£20.00')
  })

  it('prices the order, with a promo code, before anything is sent', async () => {
    state.promo = { ok: true, code: 'EARLY', kind: 'percent', value: 10, ticket_type_ids: [] }
    const user = show()
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'One more With lunch' }))
    expect(screen.getByRole('button', { name: 'Register, then pay £20.00' })).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: /Promo code/ }), 'early')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText('10% off')).toBeInTheDocument()
    expect(screen.getByText('−£2.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register, then pay £18.00' })).toBeInTheDocument()

    await fillWho(user)
    await user.click(screen.getByRole('button', { name: 'Register, then pay £18.00' }))
    await confirmEmail(user, 'Register, then pay £18.00')
    await waitFor(() => expect(state.registered).toHaveLength(1))
    expect(state.registered[0]).toMatchObject({ order: { promo_code: 'EARLY', lines: [{ ticket_type_id: 't-lunch', quantity: 1 }] } })
  })

  it('says so when a code covers only so many tickets, and prices the rest in full (0296)', async () => {
    state.promo = { ok: true, code: 'ONE', kind: 'percent', value: 100, ticket_type_ids: [], tickets_covered: 1 }
    const user = show()
    await screen.findByRole('heading', { level: 1 })
    const more = screen.getByRole('button', { name: 'One more With lunch' })
    await user.click(more)
    await user.click(more)
    await user.type(screen.getByRole('textbox', { name: /Promo code/ }), 'one')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText('100% off, on one ticket of your order')).toBeInTheDocument()
    // Two tickets at £20: one free, one to pay.
    expect(screen.getByLabelText('Your order')).toHaveTextContent('Promo code−£20.00')
    expect(screen.getByRole('button', { name: 'Register, then pay £20.00' })).toBeInTheDocument()
  })

  it('keeps an order within what is left and what one order may hold', async () => {
    const user = show()
    await screen.findByRole('heading', { level: 1 })
    const more = screen.getByRole('button', { name: 'One more Standard' })
    await user.click(more)
    await user.click(more)
    await user.click(more)
    expect(more).toBeDisabled()
    // Three Standard and one With lunch fill an order of four.
    await user.click(screen.getByRole('button', { name: 'One more With lunch' }))
    expect(screen.getByRole('button', { name: 'One more With lunch' })).toBeDisabled()
    expect(screen.getByText('4 tickets')).toBeInTheDocument()
  })

  it('asks which date when people pick one, and sends it', async () => {
    const e = event({
      date_mode: 'choose',
      dates: [
        { id: 'd1', starts_at: at(2026, 11, 21, 18, 30), ends_at: null, label: 'Friday', open: true },
        { id: 'd2', starts_at: at(2026, 11, 22, 18, 30), ends_at: null, label: 'Saturday', open: true },
      ],
    })
    state.event = e
    const user = show()
    await screen.findByRole('heading', { level: 1 })
    const dates = screen.getByRole('radiogroup', { name: 'Which date' })
    await user.click(within(dates).getByRole('radio', { name: /Saturday/ }))
    await user.click(screen.getByRole('button', { name: 'One more Standard' }))
    await fillWho(user)
    await user.click(screen.getByRole('button', { name: 'Register' }))
    await confirmEmail(user)
    await waitFor(() => expect(state.registered).toHaveLength(1))
    expect(state.registered[0]).toMatchObject({ order: { date_id: 'd2' } })
  })

  describe('asks whether the email address is right before registering (0283)', () => {
    const ready = async (email: string) => {
      const user = show()
      await screen.findByRole('heading', { level: 1 })
      await user.click(screen.getByRole('button', { name: 'One more Standard' }))
      await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama Owusu')
      await user.type(screen.getByRole('textbox', { name: 'Email' }), email)
      await user.type(screen.getByRole('textbox', { name: 'Confirm email' }), email)
      await user.type(screen.getByRole('textbox', { name: 'Phone' }), '07911 123456')
      await user.click(screen.getByRole('button', { name: 'Register' }))
      return { user, dialog: await screen.findByRole('dialog', { name: 'Is this your email address?' }) }
    }

    it('shows the address on its own, and registers nothing until it is said to be right', async () => {
      const { user, dialog } = await ready('  ama@example.org ')
      expect(within(dialog).getByTestId('email-to-confirm')).toHaveTextContent(/^ama@example\.org$/)
      expect(within(dialog).getByText(/Your ticket is sent here, and nowhere else/)).toBeInTheDocument()
      expect(state.registered).toHaveLength(0)

      await user.click(within(dialog).getByRole('button', { name: 'Yes, it’s right — Register' }))
      expect(await screen.findByText('ticket page ABCDEFGHJKMN')).toBeInTheDocument()
      expect(state.registered).toHaveLength(1)
      expect(state.registered[0]).toMatchObject({ order: { email: 'ama@example.org' } })
    })

    it('goes back to the form on No, with everything as it was and the email field to hand', async () => {
      const { user, dialog } = await ready('ama@exmaple.org')
      await user.click(within(dialog).getByRole('button', { name: 'No, change it' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(state.registered).toHaveLength(0)
      const field = screen.getByRole('textbox', { name: 'Email' })
      await waitFor(() => expect(field).toHaveFocus())
      expect(field).toHaveValue('ama@exmaple.org')
      expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveValue('Ama Owusu')
      expect(screen.getByText('1 ticket')).toBeInTheDocument()

      // Put right in the one box only: the second still holds the slip, and the form says so.
      await user.clear(field)
      await user.type(field, 'ama@example.org')
      await user.click(screen.getByRole('button', { name: 'Register' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      const second = screen.getByRole('textbox', { name: 'Confirm email' })
      expect(second).toHaveAccessibleDescription('The two email addresses are different. They have to be the same.')

      // Put right in both, and asked again with the new address.
      await user.clear(second)
      await user.type(second, 'ama@example.org')
      await user.click(screen.getByRole('button', { name: 'Register' }))
      const again = await screen.findByRole('dialog', { name: 'Is this your email address?' })
      expect(within(again).getByTestId('email-to-confirm')).toHaveTextContent('ama@example.org')
    })

    it('closes on Escape without registering', async () => {
      const { user } = await ready('ama@example.org')
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(state.registered).toHaveLength(0)
    })

    it('offers the right spelling of a well-known provider, and registers with it', async () => {
      const { user, dialog } = await ready('ama@gmial.com')
      expect(within(dialog).getByText('ama@gmail.com')).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Yes, use that one' }))
      expect(within(dialog).getByTestId('email-to-confirm')).toHaveTextContent(/^ama@gmail\.com$/)
      expect(within(dialog).queryByRole('button', { name: 'Yes, use that one' })).toBeNull()
      await user.click(within(dialog).getByRole('button', { name: 'Yes, it’s right — Register' }))
      await waitFor(() => expect(state.registered).toHaveLength(1))
      expect(state.registered[0]).toMatchObject({ order: { email: 'ama@gmail.com' } })
    })

    it('takes the spelling offered for both boxes: it is one address', async () => {
      const { user, dialog } = await ready('ama@gmial.com')
      await user.click(within(dialog).getByRole('button', { name: 'Yes, use that one' }))
      await user.click(within(dialog).getByRole('button', { name: 'No, change it' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('ama@gmail.com')
      expect(screen.getByRole('textbox', { name: 'Confirm email' })).toHaveValue('ama@gmail.com')
      expect(screen.queryByRole('alert', { name: 'What to put right' })).toBeNull()
    })

    it('says nothing about spelling when there is nothing to say', async () => {
      const { dialog } = await ready('ama@owusu.family')
      expect(within(dialog).queryByText(/Did you mean/)).toBeNull()
    })

    it('goes back to the form, with the reason, when the database refuses the order', async () => {
      state.refuse = 'Registration has closed.'
      const { user, dialog } = await ready('ama@example.org')
      await user.click(within(dialog).getByRole('button', { name: 'Yes, it’s right — Register' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not register. Try again.')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('ama@example.org')
    })

    it('does not open for a form with something still wrong', async () => {
      const user = show()
      await screen.findByRole('heading', { level: 1 })
      await user.click(screen.getByRole('button', { name: 'One more Standard' }))
      await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama Owusu')
      await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ama@example')
      await user.click(screen.getByRole('button', { name: 'Register' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(state.registered).toHaveLength(0)
    })
  })

  /*
   * The address typed twice, and a button that says what is wrong (November
   * 2026). Before this the button was greyed out while anything was
   * missing, with a faint line beneath: pressed, it did nothing, and did
   * not say why.
   */
  describe('asks for the email address twice, and says what is wrong when Register is pressed', () => {
    const open = async () => {
      const user = show()
      await screen.findByRole('heading', { level: 1 })
      return user
    }
    const summary = () => screen.getByRole('alert', { name: 'What to put right' })
    const said = () => within(summary()).getAllByRole('listitem').map((li) => li.textContent)

    it('has a second box for the address, typed and not filled in for them', async () => {
      await open()
      const second = screen.getByRole('textbox', { name: 'Confirm email' })
      expect(second).toHaveAttribute('type', 'email')
      expect(second).toHaveAttribute('autocomplete', 'off')
      expect(screen.getByText('Type it again, so a slip in either shows.')).toBeInTheDocument()
    })

    it('says nothing is wrong until they have tried', async () => {
      await open()
      expect(screen.queryByRole('alert', { name: 'What to put right' })).toBeNull()
      expect(screen.getByRole('textbox', { name: 'Email' })).not.toHaveAttribute('aria-invalid')
      // And the button is there to be pressed, not greyed out.
      expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled()
    })

    it('lists everything wrong, top to bottom, when Register is pressed on an empty form', async () => {
      const user = await open()
      await user.click(screen.getByRole('button', { name: 'Register' }))
      expect(within(summary()).getByText('5 things to put right before you can register')).toBeInTheDocument()
      expect(said()).toEqual([
        'Choose at least one ticket.',
        'Enter your name.',
        'Enter your email address.',
        'Enter your email address a second time.',
        'Enter your phone number.',
      ])
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(state.registered).toHaveLength(0)
    })

    it('rings each field that is wrong and says why beneath it', async () => {
      const user = await open()
      await user.click(screen.getByRole('button', { name: 'Register' }))
      for (const [name, why] of [
        ['Your name', 'Enter your name.'],
        ['Email', 'Enter your email address.'],
        ['Confirm email', 'Enter your email address a second time.'],
        ['Phone', 'Enter your phone number.'],
      ] as const) {
        const field = screen.getByRole('textbox', { name })
        expect(field, name).toHaveClass('field-error')
        if (name !== 'Phone') {
          expect(field, name).toHaveAttribute('aria-invalid', 'true')
          expect(field, name).toHaveAccessibleDescription(why)
        }
      }
      // The reason is not part of the field's name: it is still found by its label.
      expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument()
      // Said twice each: in the list and at the field.
      expect(screen.getAllByText('Enter your phone number.')).toHaveLength(2)
      expect(screen.getAllByText('Choose at least one ticket.')).toHaveLength(2)
    })

    it('goes to the first thing wrong', async () => {
      const user = await open()
      await user.click(screen.getByRole('button', { name: 'One more Standard' }))
      await user.click(screen.getByRole('button', { name: 'Register' }))
      expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveFocus()
    })

    it('goes to a field from its line in the list', async () => {
      const user = await open()
      await user.click(screen.getByRole('button', { name: 'Register' }))
      await user.click(within(summary()).getByRole('button', { name: 'Enter your email address a second time.' }))
      expect(screen.getByRole('textbox', { name: 'Confirm email' })).toHaveFocus()
      await user.click(within(summary()).getByRole('button', { name: 'Choose at least one ticket.' }))
      expect(screen.getByRole('button', { name: 'One more Standard' })).toHaveFocus()
    })

    it('will not go on while the two addresses differ, and says so', async () => {
      const user = await open()
      await user.click(screen.getByRole('button', { name: 'One more Standard' }))
      await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama Owusu')
      await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ama@example.org')
      await user.type(screen.getByRole('textbox', { name: 'Confirm email' }), 'ama@exmaple.org')
      await user.type(screen.getByRole('textbox', { name: 'Phone' }), '07911 123456')
      await user.click(screen.getByRole('button', { name: 'Register' }))

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(state.registered).toHaveLength(0)
      expect(within(summary()).getByText('One thing to put right before you can register')).toBeInTheDocument()
      expect(said()).toEqual(['The two email addresses are different. They have to be the same.'])
      const second = screen.getByRole('textbox', { name: 'Confirm email' })
      expect(second).toHaveFocus()
      expect(second).toHaveClass('field-error')
      // The first box is not the one marked: nothing says which of the two holds the slip, but one mark is enough.
      expect(screen.getByRole('textbox', { name: 'Email' })).not.toHaveClass('field-error')

      // Put right: the list goes, and Register goes on to the question.
      await user.clear(second)
      await user.type(second, 'ama@example.org')
      expect(screen.queryByRole('alert', { name: 'What to put right' })).toBeNull()
      expect(screen.getByText('The same as the one above.')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Register' }))
      await confirmEmail(user)
      expect(await screen.findByText('ticket page ABCDEFGHJKMN')).toBeInTheDocument()
      expect(state.registered[0]).toMatchObject({ order: { email: 'ama@example.org' } })
    })

    it('says two addresses differ as soon as the second box is left, without waiting for Register', async () => {
      const user = await open()
      await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ama@example.org')
      const second = screen.getByRole('textbox', { name: 'Confirm email' })
      await user.type(second, 'ama@example.con')
      // Still typing: nothing yet.
      expect(second).not.toHaveClass('field-error')
      await user.tab()
      expect(second).toHaveClass('field-error')
      expect(second).toHaveAccessibleDescription('The two email addresses are different. They have to be the same.')
      // Only that: nothing else on the form has been judged.
      expect(screen.queryByRole('alert', { name: 'What to put right' })).toBeNull()
      expect(screen.getByRole('textbox', { name: 'Your name' })).not.toHaveClass('field-error')
    })

    it('does not call capitals or a trailing space a difference', async () => {
      const user = await open()
      await user.click(screen.getByRole('button', { name: 'One more Standard' }))
      await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama Owusu')
      await user.type(screen.getByRole('textbox', { name: 'Email' }), 'Ama@Example.org')
      await user.type(screen.getByRole('textbox', { name: 'Confirm email' }), 'ama@example.org ')
      await user.type(screen.getByRole('textbox', { name: 'Phone' }), '07911 123456')
      await user.click(screen.getByRole('button', { name: 'Register' }))
      const dialog = await screen.findByRole('dialog', { name: 'Is this your email address?' })
      // What is sent is the first box, as typed.
      expect(within(dialog).getByTestId('email-to-confirm')).toHaveTextContent(/^Ama@Example\.org$/)
    })

    it('says an address that cannot be one, and a phone number that cannot be one', async () => {
      const user = await open()
      await user.click(screen.getByRole('button', { name: 'One more Standard' }))
      await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama Owusu')
      await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ama@example')
      await user.type(screen.getByRole('textbox', { name: 'Confirm email' }), 'ama@example')
      await user.type(screen.getByRole('textbox', { name: 'Phone' }), '123')
      await user.click(screen.getByRole('button', { name: 'Register' }))
      expect(said()).toEqual([
        'That email address doesn’t look right. It should be like name@example.com.',
        'That phone number doesn’t look right.',
      ])
      expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus()
    })

    /*
     * For an hour this form refused an ending that does not exist (".con").
     * The Owner then had registration and Reception left alone for email
     * issues (21 November 2026): the address is taken as it is typed,
     * twice, and read back; whether it can be one is not this form's to say.
     */
    it('takes an address whatever its ending, and asks only whether it is theirs', async () => {
      const user = await open()
      await user.click(screen.getByRole('button', { name: 'One more Standard' }))
      await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama Owusu')
      await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ama@gmail.con')
      await user.tab()
      expect(screen.queryByText(/do not end in/)).toBeNull()
      expect(screen.getByRole('textbox', { name: 'Email' })).not.toHaveAttribute('aria-invalid')
      await user.type(screen.getByRole('textbox', { name: 'Confirm email' }), 'ama@gmail.con')
      await user.type(screen.getByRole('textbox', { name: 'Phone' }), '07911 123456')
      await user.click(screen.getByRole('button', { name: 'Register' }))
      const dialog = await screen.findByRole('dialog', { name: 'Is this your email address?' })
      expect(within(dialog).getByTestId('email-to-confirm')).toHaveTextContent(/^ama@gmail\.con$/)
    })

    it('says which date and how much, when those are what is missing', async () => {
      state.event = event({
        date_mode: 'choose',
        dates: [{ id: 'd1', starts_at: at(2026, 11, 21, 18, 30), ends_at: null, label: null, open: false }, { id: 'd2', starts_at: at(2026, 11, 22, 18, 30), ends_at: null, label: null, open: false }],
        ticket_types: [{ id: 't-gift', name: 'Gift', description: null, kind: 'donation', price_pence: 0, min_donation_pence: 500, quantity: null, remaining: null, remaining_by_date: {} }],
      })
      const user = await open()
      await user.click(screen.getByRole('button', { name: 'One more Gift' }))
      await user.click(screen.getByRole('button', { name: 'Register' }))
      expect(said().slice(0, 2)).toEqual(['Choose a date.', 'Say how much for “Gift”.'])
      const amount = screen.getByRole('textbox', { name: 'How much for Gift, each' })
      expect(amount).toHaveClass('field-error')
      await user.type(amount, '2')
      expect(said()[1]).toBe('The least for “Gift” is £5.00.')
      expect(amount).toHaveAccessibleDescription('The least for “Gift” is £5.00.')
    })

    it('keeps the list up to date as things are put right, and takes it away when nothing is left', async () => {
      const user = await open()
      await user.click(screen.getByRole('button', { name: 'Register' }))
      expect(said()).toHaveLength(5)
      await user.click(screen.getByRole('button', { name: 'One more Standard' }))
      await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama Owusu')
      expect(said()).toEqual(['Enter your email address.', 'Enter your email address a second time.', 'Enter your phone number.'])
      await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ama@example.org')
      await user.type(screen.getByRole('textbox', { name: 'Confirm email' }), 'ama@example.org')
      await user.type(screen.getByRole('textbox', { name: 'Phone' }), '07911 123456')
      expect(screen.queryByRole('alert', { name: 'What to put right' })).toBeNull()
    })

    it('still greys the button out when there is nothing to register for', async () => {
      state.event = event({
        ticket_types: [{ id: 't-std', name: 'Standard', description: null, kind: 'free', price_pence: 0, min_donation_pence: null, quantity: 10, remaining: 0, remaining_by_date: {} }],
      })
      await open()
      expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled()
    })

    it('says so when the lost-ticket form is sent with an address that cannot be one', async () => {
      const user = await open()
      await user.click(screen.getByRole('button', { name: 'Get your ticket again' }))
      const form = screen.getByRole('form', { name: 'Get your ticket again' })
      const field = within(form).getByRole('textbox', { name: 'Email' })
      await user.type(field, 'ama@example')
      await user.click(within(form).getByRole('button', { name: 'Send my ticket' }))
      expect(within(form).getByRole('alert')).toHaveTextContent('That email address doesn’t look right. It should be like name@example.com.')
      expect(field).toHaveClass('field-error')
      expect(state.resent).toHaveLength(0)
      // Typing again takes the mark away; a right one is sent.
      await user.type(field, '.org')
      expect(within(form).queryByRole('alert')).toBeNull()
      await user.click(within(form).getByRole('button', { name: 'Send my ticket' }))
      expect(await within(form).findByRole('status')).toBeInTheDocument()
      expect(state.resent).toEqual([['pastors-2026', 'ama@example.org']])
    })
  })

  it('says when registration is not open, and shows no form', async () => {
    state.event = event({ open: false, closed_reason: 'not_yet', opens_at: at(2026, 11, 10, 9, 0) })
    show()
    expect(await screen.findByText(/^Registration opens /)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Register' })).toBeNull()
  })

  it('sends a lost ticket to the address that registered, and says the same whatever it found', async () => {
    const user = show()
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'Get your ticket again' }))
    const form = screen.getByRole('form', { name: 'Get your ticket again' })
    await user.type(within(form).getByRole('textbox', { name: 'Email' }), 'ama@example.org')
    await user.click(within(form).getByRole('button', { name: 'Send my ticket' }))
    expect(await within(form).findByRole('status')).toHaveTextContent(/If that address has a registration for this event/)
    expect(state.resent).toEqual([['pastors-2026', 'ama@example.org']])

    state.resendAnswer = { ok: false, reason: 'not configured' }
    await user.click(within(form).getByRole('button', { name: 'Send my ticket' }))
    expect(await within(form).findByText(/Tickets cannot be emailed just now/)).toBeInTheDocument()
  })

  it('offers the lost-ticket form even when registration has closed', async () => {
    state.event = event({ open: false, closed_reason: 'closed' })
    show()
    expect(await screen.findByText('Registration has closed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get your ticket again' })).toBeInTheDocument()
  })

  it('places the picture by its focal point (0248)', async () => {
    state.event = event({ image_path: 'events/x.jpg', image_focus: { x: 20, y: 80 } })
    show()
    await screen.findByRole('textbox', { name: 'Your name' })
    expect(document.querySelector('img[src="https://public/events/x.jpg"]')).toHaveStyle({ objectPosition: '20% 80%' })
  })

  it('counts down to registration closing', async () => {
    state.event = event({ closes_at: new Date(Date.now() + 2 * 86400000 + 3600000 + 30000).toISOString() })
    show()
    expect(await screen.findByRole('timer')).toHaveAccessibleName(/^Registration closes in 2 days 1 hrs/)
  })

  it('shows no closing countdown on an event that is not taking registrations', async () => {
    state.event = event({ open: false, closed_reason: 'closed', closes_at: new Date(Date.now() + 86400000).toISOString() })
    show()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('says an online event is online, with no place, and keeps the way in for the ticket (0249)', async () => {
    state.event = event({ attendance: 'online', location: { name: null, address: null, latitude: null, longitude: null } })
    show()
    expect(await screen.findByText('This event is online.')).toBeInTheDocument()
    expect(screen.getByText(/link to join is on your ticket once you register/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open directions/ })).toBeNull()
  })

  it('says a cancelled event is cancelled', async () => {
    state.event = event({ open: false, closed_reason: 'cancelled', cancel_note: 'The hall flooded.' })
    show()
    expect(await screen.findByText('This event has been cancelled. The hall flooded.')).toBeInTheDocument()
  })

  it('says so when the link leads nowhere', async () => {
    state.event = null
    show()
    expect(await screen.findByRole('heading', { name: 'No such event' })).toBeInTheDocument()
  })
})

/*
 * Opened from an invitation link (0295): /register/<slug>?invite=<token>.
 * The discount is the link's; nothing is typed and no code is shown.
 */
describe('the register page opened from an invitation link', () => {
  const LINK = '?invite=K7QM2XPA9R4T'
  const free = (over: object = {}) => ({ ok: true, email_locked: false, discount: { kind: 'percent', value: 100, ticket_type_ids: [], tickets_covered: 1 }, ...over })

  it('takes the invitation off without anything typed, and sends the token with the order', async () => {
    state.invite = free()
    const user = show(LINK)
    const invitation = await screen.findByRole('status', { name: 'Your invitation' })
    expect(invitation).toHaveTextContent('You’re invited')
    expect(invitation).toHaveTextContent('1 free ticket, taken off for you below. There is no code to type.')
    expect(state.inviteChecks).toEqual(['K7QM2XPA9R4T'])
    // No box for a code beside an invitation: the two are never both taken.
    expect(screen.queryByRole('textbox', { name: /Promo code/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'One more With lunch' }))
    const order = screen.getByLabelText('Your order')
    expect(order).toHaveTextContent('Invitation−£20.00')
    expect(order).toHaveTextContent('TotalFree')
    expect(order).not.toHaveTextContent('Promo code')

    await fillWho(user)
    await user.click(screen.getByRole('button', { name: 'Register' }))
    await confirmEmail(user)
    expect(await screen.findByText('ticket page ABCDEFGHJKMN')).toBeInTheDocument()
    expect(state.registered[0]).toMatchObject({ order: { invite: 'K7QM2XPA9R4T', promo_code: '', lines: [{ ticket_type_id: 't-lunch', quantity: 1 }] } })
  })

  it('covers only as many tickets as the invitation says; the rest are at full price', async () => {
    state.invite = free()
    const user = show(LINK)
    await screen.findByRole('status', { name: 'Your invitation' })
    const more = screen.getByRole('button', { name: 'One more With lunch' })
    await user.click(more)
    await user.click(more)
    expect(screen.getByLabelText('Your order')).toHaveTextContent('Invitation−£20.00')
    expect(screen.getByRole('button', { name: 'Register, then pay £20.00' })).toBeInTheDocument()
  })

  it('reads the token in whatever case the link arrived', async () => {
    state.invite = free()
    show('?invite=k7qm2xpa9r4t')
    await screen.findByRole('status', { name: 'Your invitation' })
    expect(state.inviteChecks).toEqual(['K7QM2XPA9R4T'])
  })

  it('asks a personal invitation’s holder for the address it was sent to, without showing it', async () => {
    state.invite = free({ email_locked: true })
    show(LINK)
    const invitation = await screen.findByRole('status', { name: 'Your invitation' })
    expect(invitation).toHaveTextContent('This invitation is for one person: register with the email address it was sent to.')
    expect(screen.getByText('The address your invitation was sent to. Your ticket is sent here.')).toBeInTheDocument()
    // Nothing is filled in for them: a forwarded link must not hand over somebody's address.
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('')
  })

  it('lets somebody the invitation is not for register without it, at the usual price', async () => {
    state.invite = free({ email_locked: true })
    const user = show(LINK)
    const invitation = await screen.findByRole('status', { name: 'Your invitation' })
    await user.click(within(invitation).getByRole('button', { name: 'Register without it' }))
    expect(screen.queryByRole('status', { name: 'Your invitation' })).toBeNull()
    expect(screen.getByRole('textbox', { name: /Promo code/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'One more With lunch' }))
    await fillWho(user)
    await user.click(screen.getByRole('button', { name: 'Register, then pay £20.00' }))
    await confirmEmail(user, 'Register, then pay £20.00')
    await waitFor(() => expect(state.registered).toHaveLength(1))
    expect((state.registered[0] as { order: object }).order).not.toHaveProperty('invite')
  })

  it.each([
    ['used', 'This invitation has already been used.'],
    ['ended', 'This invitation is no longer open.'],
    ['not_found', 'This invitation link isn’t one we know.'],
  ])('says a link that is %s is no use, and leaves the form at its usual price', async (reason, title) => {
    state.invite = { ok: false, reason }
    const user = show(LINK)
    const invitation = await screen.findByRole('status', { name: 'Your invitation' })
    expect(invitation).toHaveTextContent(title)
    expect(invitation).toHaveTextContent(/still register here at the usual price/)
    expect(screen.getByRole('textbox', { name: /Promo code/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'One more With lunch' }))
    await fillWho(user)
    await user.click(screen.getByRole('button', { name: 'Register, then pay £20.00' }))
    await confirmEmail(user, 'Register, then pay £20.00')
    await waitFor(() => expect(state.registered).toHaveLength(1))
    expect((state.registered[0] as { order: object }).order).not.toHaveProperty('invite')
  })

  it('does not ask the database about something that is not a token', async () => {
    state.invite = free()
    show('?invite=nonsense')
    expect(await screen.findByRole('status', { name: 'Your invitation' })).toHaveTextContent('This invitation link isn’t one we know.')
    expect(state.inviteChecks).toEqual([])
  })

  it('says so when the invitation could not be checked, and checks again when asked', async () => {
    state.invite = new Error('no answer')
    const user = show(LINK)
    const alert = await screen.findByRole('alert', { name: 'Your invitation' })
    expect(alert).toHaveTextContent('Your invitation could not be checked.')
    expect(alert).toHaveTextContent('Registering now would be at the usual price.')

    state.invite = free()
    await user.click(within(alert).getByRole('button', { name: 'Check it again' }))
    expect(await screen.findByRole('status', { name: 'Your invitation' })).toHaveTextContent('You’re invited')
  })

  it('asks again when registering is refused, so an invitation used a moment ago stops being offered', async () => {
    state.invite = free()
    const user = show(LINK)
    await screen.findByRole('status', { name: 'Your invitation' })
    await user.click(screen.getByRole('button', { name: 'One more With lunch' }))
    await fillWho(user)

    state.refuse = 'This invitation has already been used.'
    state.invite = { ok: false, reason: 'used' }
    await user.click(screen.getByRole('button', { name: 'Register' }))
    await confirmEmail(user)
    expect(await screen.findByText('This invitation has already been used.')).toBeInTheDocument()
    // The form is back at the usual price, and says so on its button.
    expect(await screen.findByRole('button', { name: 'Register, then pay £20.00' })).toBeInTheDocument()
  })

  it('holds the button while the invitation is being checked again after a failure', async () => {
    state.invite = new Error('no answer')
    const user = show(LINK)
    const alert = await screen.findByRole('alert', { name: 'Your invitation' })
    await user.click(screen.getByRole('button', { name: 'One more With lunch' }))
    // Not checked: the form can go on at the usual price, and says that it would.
    expect(screen.getByRole('button', { name: 'Register, then pay £20.00' })).toBeEnabled()

    // Checking again, and slow to answer: registering now would send no invitation.
    let answer: (value: unknown) => void = () => undefined
    state.invite = new Promise((resolve) => (answer = resolve))
    await user.click(within(alert).getByRole('button', { name: 'Check it again' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Register, then pay £20.00' })).toBeDisabled())
    expect(screen.queryByRole('alert', { name: 'Your invitation' })).toBeNull()

    answer(free())
    expect(await screen.findByRole('status', { name: 'Your invitation' })).toHaveTextContent('You’re invited')
    expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled()
  })

  it('never says “invited” and “could not be checked” at once: an answer in hand stands when a later ask fails', async () => {
    state.invite = free()
    const user = show(LINK)
    await screen.findByRole('status', { name: 'Your invitation' })
    await user.click(screen.getByRole('button', { name: 'One more With lunch' }))
    await fillWho(user)

    // Registering is refused for something else, and asking about the invitation again gets no answer.
    state.refuse = 'Only 0 of "With lunch" left.'
    state.invite = new Error('no answer')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    await confirmEmail(user)
    expect(await screen.findByText('Could not register. Try again.')).toBeInTheDocument()
    await waitFor(() => expect(state.inviteChecks.length).toBeGreaterThan(1))
    expect(screen.getByRole('status', { name: 'Your invitation' })).toHaveTextContent('You’re invited')
    expect(screen.queryByRole('alert', { name: 'Your invitation' })).toBeNull()
    // And the order still carries it: the database has the last word.
    expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled()
  })

  it('says nothing about invitations on a plain link, and asks nothing', async () => {
    show()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByLabelText('Your invitation')).toBeNull()
    expect(state.inviteChecks).toEqual([])
  })

  /*
   * A personal invitation's ticket goes to its address and nowhere else
   * (0297): the database answers with no code, and the page says where
   * the ticket went instead of going to it.
   */
  const registerByEmail = async (user: ReturnType<typeof userEvent.setup>, tickets = 1) => {
    await screen.findByRole('status', { name: 'Your invitation' })
    for (let i = 0; i < tickets; i++) await user.click(screen.getByRole('button', { name: 'One more With lunch' }))
    await fillWho(user)
    const label = tickets > 1 ? `Register, then pay £${(20 * (tickets - 1)).toFixed(2)}` : 'Register'
    await user.click(screen.getByRole('button', { name: label }))
    await confirmEmail(user, label)
  }

  it('ends a personal invitation on “check your email”, sends the ticket there, and goes to no ticket page', async () => {
    state.invite = free({ email_locked: true })
    state.answer = { code: null, byEmail: true }
    const user = show(LINK)
    expect(await screen.findByRole('status', { name: 'Your invitation' })).toHaveTextContent('Your ticket is emailed there.')
    await registerByEmail(user)

    const done = await screen.findByRole('status', { name: 'You’re registered' })
    // "On its way", not "has been sent": the function no longer says whether an
    // address had a ticket to send (0336's release), so the page cannot know more.
    await waitFor(() => expect(done).toHaveTextContent('Your ticket is on its way to ama@example.org.'))
    expect(done).toHaveTextContent('Open that email and press Open ticket: that page is your ticket.')
    expect(done).toHaveTextContent('This invitation is for one person, so the ticket goes to their email address rather than onto this screen.')
    // Asked for through the kind that only ever writes to the address an order is under.
    expect(state.resent).toEqual([['pastors-2026', 'ama@example.org']])
    expect(state.mailed).toEqual([])
    expect(screen.queryByText(/ticket page/)).toBeNull()
    // The form has gone; "Get your ticket again" is still there.
    expect(screen.queryByRole('form', { name: 'Register' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Get your ticket again' })).toBeInTheDocument()
  })

  it('says where to pay when the invitation did not cover everything', async () => {
    state.invite = free({ email_locked: true })
    state.answer = { code: null, byEmail: true }
    const user = show(LINK)
    await registerByEmail(user, 2)
    const done = await screen.findByRole('status', { name: 'You’re registered' })
    await waitFor(() => expect(done).toHaveTextContent('that page shows how to pay £20.00, and is your ticket once it is paid.'))
  })

  it.each([
    ['was refused', { ok: false, reason: 'not configured' }],
    ['could not be asked for', new Error('no answer')],
  ])('says so when the email %s, with the way to get it', async (_how, answer) => {
    state.invite = free({ email_locked: true })
    state.answer = { code: null, byEmail: true }
    state.resendAnswer = answer
    const user = show(LINK)
    await registerByEmail(user)
    const done = await screen.findByRole('status', { name: 'You’re registered' })
    await waitFor(() => expect(done).toHaveTextContent('Your ticket goes to ama@example.org, but the email could not be sent just now.'))
    expect(done).toHaveTextContent('In about ten minutes, use “Get your ticket again” below with that address; the church office can send it too.')
  })

  it('still goes straight to the ticket for a group invitation', async () => {
    state.invite = free()
    const user = show(LINK)
    await registerByEmail(user)
    expect(await screen.findByText('ticket page ABCDEFGHJKMN')).toBeInTheDocument()
    expect(state.mailed).toEqual(['ABCDEFGHJKMN'])
    expect(state.resent).toEqual([])
  })
})

/*
 * The agenda (0303): what happens on the day, on the event's own page.
 */
describe('an event’s agenda on its public page', () => {
  it('is not there for an event with none', async () => {
    show()
    await screen.findByRole('heading', { level: 1, name: 'Pastors & Leaders 2026' })
    expect(screen.queryByText('Agenda')).toBeNull()
  })

  it('sets out the day under About, before the form', async () => {
    state.event = event({
      agenda: [
        { id: 'a1', date_id: null, title: 'Doors open', details: null, starts: '18:00', ends: null },
        { id: 'a2', date_id: null, title: 'Teaching', details: 'Pastor Ama', starts: '18:30', ends: '19:45' },
        { id: 'a3', date_id: null, title: 'Refreshments', details: null, starts: null, ends: null },
      ],
    })
    show()
    const agenda = (await screen.findByText('Agenda')).parentElement!
    expect(within(agenda).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Doors open'),
      expect.stringContaining('Teaching'),
      expect.stringContaining('Refreshments'),
    ])
    expect(within(agenda).getByText('Pastor Ama')).toBeInTheDocument()
    // After the words about the event, and before the form to register.
    const about = screen.getByText('About')
    const register = screen.getByRole('heading', { name: 'Register' })
    expect(about.compareDocumentPosition(agenda) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(agenda.compareDocumentPosition(register) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

