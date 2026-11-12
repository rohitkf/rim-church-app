import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegisterPage } from './RegisterPage'
import type { PublicEvent } from '../lib/registrations'

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
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false, isSuperAdmin: false, session: null }) }))
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
    return state.refuse ? Promise.reject(new Error(state.refuse)) : Promise.resolve('ABCDEFGHJKMN')
  },
  sendTicketEmail: (code: string) => {
    state.mailed.push(code)
    return Promise.resolve({ ok: true, sent: true })
  },
  resendTickets: (slug: string, email: string) => {
    state.resent.push([slug, email])
    return Promise.resolve(state.resendAnswer)
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
  logo_path: null,
  ...over,
})

function TicketStub() {
  const { code } = useParams()
  return <p>ticket page {code}</p>
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/register/pastors-2026']}>
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
  state.event = event()
  state.promo = { ok: false }
  state.registered = []
  state.mailed = []
  state.resent = []
  state.resendAnswer = { ok: true, sent: true }
  state.refuse = null
})

/** The address is shown back before anything is sent (0283): say it is right. */
const confirmEmail = async (user: ReturnType<typeof userEvent.setup>, label = 'Register') => {
  const dialog = await screen.findByRole('dialog', { name: 'Is this your email address?' })
  await user.click(within(dialog).getByRole('button', { name: `Yes, it’s right — ${label}` }))
}

describe('the public register page', () => {
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
