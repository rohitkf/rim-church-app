import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TicketPage } from './TicketPage'
import type { OrderView } from '../lib/registrations'

/*
 * A ticket (0244): the QR code for the door, what was booked, and — for a
 * paid order — how to pay and where that stands. The order exists before
 * any money moves; the attendee reports a payment, with the receipt or its
 * reference (0247), and the church confirms it. Until then the page is a
 * registration, to show at reception; after, the ticket, for the door.
 */

const state = vi.hoisted(() => ({
  order: null as unknown,
  reported: [] as unknown[],
  uploaded: [] as unknown[],
  refundRequests: [] as unknown[],
  cancelled: 0,
  mailed: [] as string[],
  mailAnswer: { ok: true, sent: true } as unknown,
  // An address put right after a bounce (0283): what was asked, and whether the database took it.
  fixed: [] as unknown[],
  fixRefused: false,
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
vi.mock('../components/QrCode', () => ({
  QrCode: ({ text, label }: { text: string; label: string }) => <svg role="img" aria-label={label} data-text={text} />,
}))
vi.mock('../lib/registrations', async (original) => ({
  ...(await original<typeof import('../lib/registrations')>()),
  fetchOrder: () => Promise.resolve(state.order),
  reportPayment: (code: string, method: string, done: boolean, proof?: { path?: string | null; reference?: string | null }) => {
    state.reported.push({ code, method, done, ...(proof ?? {}) })
    return Promise.resolve()
  },
  requestRefund: (code: string, details: unknown) => {
    state.refundRequests.push([code, details])
    return Promise.resolve()
  },
  uploadProof: (code: string, file: File) => {
    state.uploaded.push([code, file.name, file.type])
    return Promise.resolve(`${code}/receipt.png`)
  },
  cancelOrder: () => {
    state.cancelled += 1
    return Promise.resolve()
  },
  sendTicketEmail: (code: string) => {
    state.mailed.push(code)
    return Promise.resolve(state.mailAnswer)
  },
  fixOrderEmail: (code: string, email: string) => {
    state.fixed.push([code, email])
    if (state.fixRefused) return Promise.reject(new Error('refused'))
    // As the database leaves it: the new address, with nothing known about it yet.
    state.order = { ...(state.order as object), email: email.trim().toLowerCase(), email_state: 'none', email_can_fix: false }
    return Promise.resolve()
  },
}))

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()

const order = (over: Partial<OrderView> = {}): OrderView => ({
  code: 'ABCDEFGHJKMN',
  status: 'confirmed',
  refund_details_wanted: false,
  refund_details_sent: false,
  email_state: 'none',
  email_can_fix: false,
  name: 'Ama Owusu',
  email: 'ama@example.org',
  phone: '07700 900123',
  quantity: 2,
  subtotal_pence: 4000,
  discount_pence: 400,
  total_pence: 3600,
  promo_code: 'EARLY',
  payment_status: 'awaiting',
  payment_method: null,
  checked_in_at: null,
  created_at: '2026-11-01T10:00:00Z',
  can_cancel: true,
  tickets: [
    { type_name: 'With lunch', kind: 'paid', attendee_name: 'Ama Owusu', unit_price_pence: 2000 },
    { type_name: 'With lunch', kind: 'paid', attendee_name: 'Kofi Owusu', unit_price_pence: 2000 },
  ],
  date: null,
  event: {
    slug: 'pastors-2026',
    title: 'Pastors & Leaders 2026',
    image_path: null,
    status: 'published',
    date_mode: 'all',
    location: { name: 'Church Hall', address: null, latitude: null, longitude: null },
    allow_pay_at_reception: true,
    payment_note: 'Please pay within a week.',
    dates: [{ id: 'd1', starts_at: at(2026, 11, 21, 18, 30), ends_at: at(2026, 11, 21, 21, 0), label: null }],
  },
  payment: {
    links: [{ label: 'Pay with PayPal', url: 'https://paypal.me/rim' }],
    accounts: [{ label: 'Main account', account_name: 'RIM Church', bank_name: 'Barclays', sort_code: '20-00-00', account_number: '12345678', iban: null, bic: null }],
  },
  logo_path: null,
  ...over,
})

/** The page, with a way to take it down again: for a test that shows it more than once. */
function showOnce() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/ticket/ABCDEFGHJKMN']}>
        <Routes>
          <Route path="/ticket/:code" element={<TicketPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/ticket/ABCDEFGHJKMN']}>
        <Routes>
          <Route path="/ticket/:code" element={<TicketPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/** The tab comes back into view, as it does after a payment page. */
const comeBack = async () => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
}

// jsdom cannot follow a link; the page's own click handler still runs. Only
// a link, mind — a submit button's click has to keep its default, or no form
// on the page ever submits.
window.addEventListener('click', (e) => {
  if ((e.target as Element | null)?.closest('a')) e.preventDefault()
}, true)

beforeEach(() => {
  state.order = order()
  state.reported = []
  state.uploaded = []
  state.refundRequests = []
  state.cancelled = 0
  state.mailed = []
  state.mailAnswer = { ok: true, sent: true }
  state.fixed = []
  state.fixRefused = false
})

describe('the ticket page', () => {
  /*
   * People registered, saw a QR code under a green "Registered" and took it
   * for a ticket (the Owner, November 2026). So an unpaid order leads with
   * what to pay, says in words that it is not a ticket, and has no
   * ticket-shaped QR card.
   */
  it('leads an unpaid order with what to pay, and says it is not a ticket yet', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'Pay £36.00 to get your ticket' })).toBeInTheDocument()
    expect(screen.getByText(/You are registered, but you do not have a ticket yet/)).toBeInTheDocument()
    expect(screen.getByText('Not a ticket yet')).toBeInTheDocument()
    expect(screen.queryByText('Registered')).toBeNull()
    expect(screen.getByText('Awaiting payment')).toBeInTheDocument()
    expect(screen.getByText('Not a ticket — not paid')).toBeInTheDocument()
    // Paying comes before the code, not under everything else.
    const paying = screen.getByRole('region', { name: 'Paying' })
    const registration = screen.getByRole('region', { name: 'Your registration' })
    expect(paying.compareDocumentPosition(registration) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Your ticket' })).toBeNull()

    expect(screen.getAllByText('ABCDEFGHJKMN').length).toBeGreaterThan(0)
    expect(screen.getByText(/Kofi Owusu/)).toBeInTheDocument()
    expect(screen.getByText('−£4.00')).toBeInTheDocument()
    expect(screen.getByText('Please pay within a week.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Pay with PayPal/ })).toHaveAttribute('href', 'https://paypal.me/rim')
    expect(screen.getByRole('link', { name: 'Event page' })).toHaveAttribute('href', '/register/pastors-2026')
  })

  /*
   * The reference and the screenshot were being missed (the Owner, November
   * 2026): numbered steps in the pay box, and a button for the screenshot
   * that is always there.
   */
  it('spells out paying online under the bar’s own numbers: 2 pay with the reference, 3 send a screenshot', async () => {
    const user = show()
    const steps = within(await screen.findByRole('list', { name: 'How to pay online' })).getAllByRole('listitem')
    // Two, not three: they carry the progress bar's numbers (2 Pay, 3
    // Receipt), so the page has one count of steps and not two.
    expect(steps).toHaveLength(2)
    expect(steps[0]).toHaveTextContent(/^2/)
    expect(steps[0]).toHaveTextContent('Pay £36.00')
    expect(steps[0]).toHaveTextContent('put this as the payment reference')
    expect(steps[0]).toHaveTextContent('ABCDEFGHJKMN')
    expect(within(steps[0]).getByRole('button', { name: 'Copy reference' })).toBeInTheDocument()
    expect(steps[1]).toHaveTextContent(/^3/)
    expect(steps[1]).toHaveTextContent('Come back here and send a screenshot')

    await user.click(screen.getByRole('button', { name: 'I’ve paid — send my screenshot' }))
    const dialog = screen.getByRole('dialog', { name: 'Your receipt' })
    expect(within(dialog).getByText(/The reference on your payment should be/)).toHaveTextContent('ABCDEFGHJKMN')
    expect(within(dialog).getByText('Screenshot of the payment — quickest')).toBeInTheDocument()
  })

  it('leaves the steps out when the event takes no payment online', async () => {
    state.order = order({ payment: { links: [], accounts: [] } })
    show()
    expect(await screen.findByRole('heading', { name: 'Pay £36.00 to get your ticket' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'How to pay online' })).toBeNull()
    expect(screen.queryByRole('button', { name: /send my screenshot/ })).toBeNull()
  })

  /*
   * The progress bar (lib/registrationSteps): where this registration has
   * got to, of Register, Pay, Receipt, Ticket.
   */
  const bar = async () => {
    const list = await screen.findByRole('list', { name: 'Your registration, step by step' })
    return within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
  }

  it('shows an unpaid order at step 2 of 4, Pay, with the receipt and the ticket still to come', async () => {
    show()
    expect(await bar()).toEqual(['✓Register — done', '2Pay — current step', '3Receipt — still to do', '4Ticket — still to do'])
    expect(screen.getByText('Step 2 of 4: pay £36.00, then send your receipt.')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').filter((li) => li.getAttribute('aria-current') === 'step')).toHaveLength(1)
  })

  it('keeps the bar on Pay for somebody who chose reception, and still offers paying online', async () => {
    state.order = order({ payment_method: 'reception' })
    show()
    expect((await bar())[1]).toBe('2Pay — current step')
    expect(screen.getByText('Step 2 of 4: pay £36.00 at reception — or pay online now, below.')).toBeInTheDocument()
  })

  it('is three steps, with no receipt, when the event takes no payment online', async () => {
    state.order = order({ payment: { links: [], accounts: [] } })
    show()
    expect(await bar()).toEqual(['✓Register — done', '2Pay — current step', '3Ticket — still to do'])
    expect(screen.getByText('Step 2 of 3: pay £36.00 at reception.')).toBeInTheDocument()
  })

  it('moves the bar to Ticket, waiting, once a receipt is in', async () => {
    state.order = order({ payment_status: 'reported', payment_method: 'bank', proof_reference: 'TR-77', proof_at: '2026-11-02T10:00:00Z' })
    show()
    expect(await bar()).toEqual(['✓Register — done', '✓Pay — done', '✓Receipt — done', '4Ticket — current step'])
    expect(screen.getByText(/^Step 4 of 4: your receipt is being checked\./)).toBeInTheDocument()
  })

  it('ticks all four steps on a ticket paid online, and says no more', async () => {
    state.order = order({ payment_status: 'received', payment_method: 'bank' })
    show()
    expect(await bar()).toEqual(['✓Register — done', '✓Pay — done', '✓Receipt — done', '✓Ticket — done'])
    expect(screen.queryByText(/^Step \d of \d/)).toBeNull()
  })

  it('ticks three steps on a ticket paid at reception', async () => {
    state.order = order({ payment_status: 'received', payment_method: 'reception' })
    show()
    expect(await bar()).toEqual(['✓Register — done', '✓Pay — done', '✓Ticket — done'])
  })

  it('shows no bar on a free order: registering was all of it', async () => {
    state.order = order({ total_pence: 0, subtotal_pence: 0, discount_pence: 0, promo_code: null, payment_status: 'not_needed' })
    show()
    await screen.findByRole('img', { name: 'Ticket ABCDEFGHJKMN' })
    expect(screen.queryByRole('list', { name: 'Your registration, step by step' })).toBeNull()
  })

  it('shows no bar on a cancelled registration', async () => {
    state.order = order({ status: 'cancelled', can_cancel: false })
    show()
    await screen.findByText('Cancelled')
    expect(screen.queryByRole('list', { name: 'Your registration, step by step' })).toBeNull()
  })

  it('shows no bar when the event itself is cancelled', async () => {
    const o = order()
    state.order = { ...o, event: { ...o.event, cancelled_at: '2026-11-04T10:00:00Z', cancel_note: null } }
    show()
    await screen.findByRole('region', { name: 'Event cancelled' })
    expect(screen.queryByRole('list', { name: 'Your registration, step by step' })).toBeNull()
  })

  it('keeps a small QR code for reception to take the payment, marked as not a ticket', async () => {
    show()
    const qr = await screen.findByRole('img', { name: 'Registration ABCDEFGHJKMN' })
    expect(qr).toHaveAttribute('data-text', 'https://rim-church-app.vercel.app/ticket/ABCDEFGHJKMN')
    expect(screen.getByText('This is not a ticket. Reception scans it to take your payment.')).toBeInTheDocument()
  })

  it('shows no QR code at all on an unpaid order when the event takes no payment at reception', async () => {
    state.order = order({ event: { ...order().event, allow_pay_at_reception: false } })
    show()
    expect(await screen.findByText('Not a ticket — not paid')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /ABCDEFGHJKMN/ })).toBeNull()
    expect(screen.getAllByText('ABCDEFGHJKMN').length).toBeGreaterThan(0)
  })

  it('asks, on coming back from the payment link, whether it went through', async () => {
    const user = show()
    await user.click(await screen.findByRole('link', { name: /Pay with PayPal/ }))
    await comeBack()
    const dialog = await screen.findByRole('dialog', { name: 'Did you complete the payment?' })
    await user.click(within(dialog).getByRole('button', { name: 'Yes, I’ve paid' }))
    // Then the receipt: here the reference alone.
    const proof = await screen.findByRole('dialog', { name: 'Your receipt' })
    await user.type(within(proof).getByRole('textbox', { name: /The payment’s own reference/ }), 'PP-123')
    await user.click(within(proof).getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(state.reported).toEqual([{ code: 'ABCDEFGHJKMN', method: 'paypal', done: true, path: null, reference: 'PP-123' }]))
    expect(state.uploaded).toEqual([])
  })

  it('keeps the other ways to pay when they say not yet', async () => {
    const user = show()
    await user.click(await screen.findByRole('link', { name: /Pay with PayPal/ }))
    await comeBack()
    const dialog = await screen.findByRole('dialog', { name: 'Did you complete the payment?' })
    await user.click(within(dialog).getByRole('button', { name: 'Not yet' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state.reported).toEqual([])
    // Coming back again asks nothing: the link was not opened again.
    await comeBack()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the bank details with the code as the reference, and takes the receipt', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Bank transfer' }))
    expect(screen.getByRole('heading', { name: 'Main account' })).toBeInTheDocument()
    expect(screen.getByText('20-00-00')).toBeInTheDocument()
    // The reference is the code, so the transfer can be matched to the ticket.
    expect(screen.getByRole('button', { name: 'Copy Reference' })).toBeInTheDocument()
    expect(screen.getAllByText('ABCDEFGHJKMN').length).toBeGreaterThanOrEqual(2)
    // One way to send the screenshot at a time: with the bank details open it is the button under them.
    expect(screen.queryByRole('button', { name: 'I’ve paid — send my screenshot' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'I’ve sent the transfer — send my screenshot' }))
    const proof = await screen.findByRole('dialog', { name: 'Your receipt' })
    await user.upload(within(proof).getByLabelText('Screenshot of the payment — quickest'), new File(['png'], 'transfer.png', { type: 'image/png' }))
    expect(within(proof).getByText('transfer.png')).toBeInTheDocument()
    await user.click(within(proof).getByRole('button', { name: 'Send' }))
    // The file goes up under the order's own code, and its path is reported with the payment.
    await waitFor(() => expect(state.reported).toEqual([{ code: 'ABCDEFGHJKMN', method: 'bank', done: true, path: 'ABCDEFGHJKMN/receipt.png', reference: null }]))
    expect(state.uploaded).toEqual([['ABCDEFGHJKMN', 'transfer.png', 'image/png']])
  })

  it('wants the receipt or the reference, one at least, before it takes their word', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Bank transfer' }))
    await user.click(screen.getByRole('button', { name: 'I’ve sent the transfer — send my screenshot' }))
    const proof = await screen.findByRole('dialog', { name: 'Your receipt' })
    await user.click(within(proof).getByRole('button', { name: 'Send' }))
    expect(within(proof).getByRole('alert')).toHaveTextContent(/Attach a screenshot of the payment, or type its reference/)
    expect(state.reported).toEqual([])
    await user.click(within(proof).getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lets them choose to pay at reception instead', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'I’ll pay at reception' }))
    await waitFor(() => expect(state.reported).toEqual([{ code: 'ABCDEFGHJKMN', method: 'reception', done: false }]))
  })

  it('says a reported payment is being checked, and offers only another receipt', async () => {
    state.order = order({ payment_status: 'reported', payment_method: 'bank', proof_reference: 'TR-77', proof_at: '2026-11-02T10:00:00Z' })
    const user = show()
    expect(await screen.findByRole('heading', { name: 'Thank you — your receipt is being checked' })).toBeInTheDocument()
    expect(screen.getByText(/You said you paid by bank transfer, reference TR-77/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Registration ABCDEFGHJKMN' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Pay with PayPal/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Send another receipt' }))
    expect(screen.getByRole('dialog', { name: 'Your receipt' })).toBeInTheDocument()
  })

  it('is the ticket once the payment is in', async () => {
    state.order = order({ payment_status: 'received', payment_method: 'bank' })
    show()
    expect(await screen.findByRole('img', { name: 'Ticket ABCDEFGHJKMN' })).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText(/Show this at the door/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Email me this ticket' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Paying' })).toBeNull()
  })

  it('shows a free order with nothing to pay', async () => {
    state.order = order({ total_pence: 0, subtotal_pence: 0, discount_pence: 0, promo_code: null, payment_status: 'not_needed' })
    show()
    await screen.findByRole('img', { name: 'Ticket ABCDEFGHJKMN' })
    expect(screen.queryByText('Awaiting payment')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Paying' })).toBeNull()
  })

  it('emails the ticket to its own address, and says when one just went', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Email me this registration' }))
    expect(await screen.findByRole('status')).toHaveTextContent('On its way to ama@example.org.')
    expect(state.mailed).toEqual(['ABCDEFGHJKMN'])
    state.mailAnswer = { ok: true, sent: false }
    await user.click(screen.getByRole('button', { name: 'Email me this registration' }))
    expect(await screen.findByText(/Already sent to ama@example.org/)).toBeInTheDocument()
  })

  it('cancels only after asking', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Cancel my registration' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel your registration?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel it' }))
    await waitFor(() => expect(state.cancelled).toBe(1))
  })

  it('shows a cancelled ticket without its QR code', async () => {
    state.order = order({ status: 'cancelled', can_cancel: false })
    show()
    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Ticket/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel my registration' })).toBeNull()
  })

  it('places the picture by its focal point (0248)', async () => {
    const o = order()
    state.order = { ...o, event: { ...o.event, image_path: 'events/x.jpg', image_focus: { x: 20, y: 80 } } }
    show()
    await screen.findByRole('img', { name: 'Registration ABCDEFGHJKMN' })
    expect(document.querySelector('img[src="https://public/events/x.jpg"]')).toHaveStyle({ objectPosition: '20% 80%' })
  })

  it('counts down to the event', async () => {
    const soon = new Date(Date.now() + 3 * 86400000 + 7200000 + 30000).toISOString()
    const o = order()
    state.order = { ...o, event: { ...o.event, dates: [{ id: 'd1', starts_at: soon, ends_at: null, label: null }] } }
    show()
    expect(await screen.findByRole('timer')).toHaveAccessibleName(/^Starts in 3 days 2 hrs/)
  })

  it('says the event is happening now while it is on', async () => {
    const o = order()
    state.order = { ...o, event: { ...o.event, dates: [{ id: 'd1', starts_at: new Date(Date.now() - 3600000).toISOString(), ends_at: new Date(Date.now() + 3600000).toISOString(), label: null }] } }
    show()
    expect(await screen.findByText('Happening now')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('shows no countdown once the event is over, or on a cancelled ticket', async () => {
    const o = order()
    state.order = { ...o, event: { ...o.event, dates: [{ id: 'd1', starts_at: new Date(Date.now() - 7200000).toISOString(), ends_at: new Date(Date.now() - 3600000).toISOString(), label: null }] } }
    show()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('timer')).toBeNull()
    expect(screen.queryByText('Happening now')).toBeNull()
  })

  it('gives a paid ticket to an online event its way in (0249)', async () => {
    const o = order({ payment_status: 'received', join: { url: 'https://zoom.us/j/8123', details: 'Passcode 2026' } })
    state.order = { ...o, event: { ...o.event, attendance: 'online' } }
    show()
    const join = await screen.findByRole('region', { name: 'Joining online' })
    expect(within(join).getByRole('link', { name: /Join online/ })).toHaveAttribute('href', 'https://zoom.us/j/8123')
    expect(within(join).getByText('Passcode 2026')).toBeInTheDocument()
    // Online only: no place, no directions.
    expect(screen.queryByRole('link', { name: /Open directions/ })).toBeNull()
  })

  it('holds the way in back until the payment is confirmed', async () => {
    const o = order({ payment_status: 'awaiting', join: null })
    state.order = { ...o, event: { ...o.event, attendance: 'both' } }
    show()
    const join = await screen.findByRole('region', { name: 'Joining online' })
    expect(within(join).getByText(/appears here once your payment is confirmed/)).toBeInTheDocument()
    expect(within(join).queryByRole('link')).toBeNull()
    // Both: the hall is still shown.
    expect(screen.getByText('Church Hall')).toBeInTheDocument()
  })

  it('says a cancelled event is off, with no QR code, nothing to pay and no way to cancel', async () => {
    const o = order()
    state.order = { ...o, event: { ...o.event, cancelled_at: '2026-11-04T10:00:00Z', cancel_note: 'The hall flooded.' } }
    show()
    const notice = await screen.findByRole('region', { name: 'Event cancelled' })
    expect(notice).toHaveTextContent('The hall flooded.')
    expect(screen.queryByRole('img', { name: /ABCDEFGHJKMN/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Paying' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel my registration' })).toBeNull()
  })

  it('says a refund goes back the way it was paid, asking for nothing — but takes bank details as a choice (0253)', async () => {
    state.order = order({ payment_status: 'received', payment_method: 'bank', refund_status: 'owed', refund_details_wanted: false })
    const user = show()
    const refund = await screen.findByRole('region', { name: 'Your refund' })
    expect(refund).toHaveTextContent(/refund £36.00 to the bank account you paid from/)
    expect(refund).toHaveTextContent(/5–7 working days/)
    expect(within(refund).queryByRole('textbox')).toBeNull()
    // Not back, or another account wanted: the form, and a way out of it.
    await user.click(within(refund).getByRole('button', { name: 'Give bank details to send it to' }))
    expect(within(refund).getByText('Where should the church send £36.00 instead?')).toBeInTheDocument()
    await user.click(within(refund).getByRole('button', { name: 'Not now' }))
    expect(within(refund).queryByRole('textbox')).toBeNull()
    await user.click(within(refund).getByRole('button', { name: 'Give bank details to send it to' }))
    await user.type(within(refund).getByRole('textbox', { name: 'Sort code' }), '20-00-00')
    await user.type(within(refund).getByRole('textbox', { name: 'Account number' }), '12345678')
    await user.click(within(refund).getByRole('button', { name: 'Send my bank details' }))
    await waitFor(() => expect(state.refundRequests).toEqual([['ABCDEFGHJKMN', { account_name: 'Ama Owusu', sort_code: '20-00-00', account_number: '12345678' }]]))
  })

  it('says a PayPal refund goes back through PayPal, with its details already sent', async () => {
    state.order = order({ payment_status: 'received', payment_method: 'paypal', refund_status: 'owed', refund_details_wanted: false, refund_details_sent: true })
    const user = show()
    const refund = await screen.findByRole('region', { name: 'Your refund' })
    expect(refund).toHaveTextContent(/has your bank details and will send £36.00 to that account/)
    await user.click(within(refund).getByRole('button', { name: 'Change the bank details' }))
    expect(within(refund).getByRole('textbox', { name: 'Sort code' })).toBeInTheDocument()
    expect(within(refund).getByRole('button', { name: 'Not now' })).toBeInTheDocument()
  })

  it('asks a cash payer where to send the refund, and takes UK details or an IBAN', async () => {
    state.order = order({ payment_status: 'received', payment_method: 'reception', refund_status: 'owed', refund_details_wanted: true, refund_details_sent: false })
    const user = show()
    const refund = await screen.findByRole('region', { name: 'Your refund' })
    // Cash has nowhere to go back to: the form is up, and there is no Not now.
    expect(within(refund).getByText(/You paid £36.00 at reception/)).toBeInTheDocument()
    expect(within(refund).queryByRole('button', { name: 'Not now' })).toBeNull()
    await user.type(within(refund).getByRole('textbox', { name: 'Sort code' }), '20-00-00')
    await user.type(within(refund).getByRole('textbox', { name: 'Account number' }), '12345678')
    await user.click(within(refund).getByRole('button', { name: 'Send my bank details' }))
    await waitFor(() => expect(state.refundRequests).toEqual([['ABCDEFGHJKMN', { account_name: 'Ama Owusu', sort_code: '20-00-00', account_number: '12345678' }]]))
    await user.click(within(refund).getByRole('button', { name: /Give an IBAN/ }))
    await user.type(within(refund).getByRole('textbox', { name: 'IBAN' }), 'de89370400440532013000')
    await user.click(within(refund).getByRole('button', { name: 'Send my bank details' }))
    await waitFor(() => expect(state.refundRequests[1]).toEqual(['ABCDEFGHJKMN', { account_name: 'Ama Owusu', iban: 'DE89370400440532013000' }]))
  })

  it('says when the refund has been sent', async () => {
    state.order = order({ status: 'cancelled', payment_status: 'received', refund_status: 'refunded', refund_at: '2026-11-05T10:00:00Z' })
    show()
    expect(await screen.findByRole('region', { name: 'Your refund' })).toHaveTextContent(/£36.00 was refunded on/)
  })

  it('offers no cancelling on a checked-in ticket', async () => {
    state.order = order({ checked_in_at: '2026-11-21T18:40:00Z' })
    show()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('button', { name: 'Cancel my registration' })).toBeNull()
  })

  it('says so when the link leads nowhere', async () => {
    state.order = null
    show()
    expect(await screen.findByRole('heading', { name: 'No such ticket' })).toBeInTheDocument()
  })
})

describe('an email that bounced, on the ticket page (0283)', () => {
  const bounced = (over: Partial<OrderView> = {}) => order({ email: 'jerry4chrost@example.org', email_state: 'bounced', email_can_fix: true, ...over })

  it('says the email came back, to which address, and takes the right one', async () => {
    state.order = bounced()
    const user = show()
    const section = within(await screen.findByRole('region', { name: 'Your email address' }))
    expect(section.getByRole('heading', { name: 'We could not email you' })).toBeInTheDocument()
    expect(section.getByText('jerry4chrost@example.org')).toBeInTheDocument()
    expect(section.getByText(/This page is your registration either way/)).toBeInTheDocument()
    // The address as they typed it, to mend rather than type again; the same one again is no correction.
    const field = section.getByRole('textbox', { name: 'Your email address' })
    expect(field).toHaveValue('jerry4chrost@example.org')
    expect(section.getByRole('button', { name: 'Send my registration' })).toBeDisabled()

    await user.clear(field)
    await user.type(field, ' Jerry4Christ@example.org ')
    await user.click(section.getByRole('button', { name: 'Send my registration' }))
    await waitFor(() => expect(state.fixed).toEqual([['ABCDEFGHJKMN', 'Jerry4Christ@example.org']]))
    // The ticket follows the address.
    await waitFor(() => expect(state.mailed).toEqual(['ABCDEFGHJKMN']))
    // The warning gives way to where it is going now.
    const thanks = await screen.findByRole('status')
    expect(thanks).toHaveTextContent('Your registration is on its way to jerry4christ@example.org')
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Your email address' })).toBeNull())
  })

  it('calls it a ticket once the order is paid', async () => {
    state.order = bounced({ payment_status: 'received' })
    show()
    const section = within(await screen.findByRole('region', { name: 'Your email address' }))
    expect(section.getByText(/your ticket has not reached your inbox/)).toBeInTheDocument()
    expect(section.getByRole('button', { name: 'Send my ticket' })).toBeInTheDocument()
  })

  it('offers a well-known provider’s right spelling', async () => {
    state.order = bounced({ email: 'jerry@gmial.com' })
    const user = show()
    const section = within(await screen.findByRole('region', { name: 'Your email address' }))
    await user.click(section.getByRole('button', { name: 'jerry@gmail.com' }))
    expect(section.getByRole('textbox', { name: 'Your email address' })).toHaveValue('jerry@gmail.com')
    expect(section.getByRole('button', { name: 'Send my registration' })).toBeEnabled()
  })

  it('will not send something that is not an address', async () => {
    state.order = bounced()
    const user = show()
    const section = within(await screen.findByRole('region', { name: 'Your email address' }))
    const field = section.getByRole('textbox', { name: 'Your email address' })
    await user.clear(field)
    await user.type(field, 'jerry4christ')
    expect(section.getByRole('button', { name: 'Send my registration' })).toBeDisabled()
    expect(state.fixed).toEqual([])
  })

  it('says so when the database refuses, and keeps what was typed', async () => {
    state.order = bounced()
    state.fixRefused = true
    const user = show()
    const section = within(await screen.findByRole('region', { name: 'Your email address' }))
    const field = section.getByRole('textbox', { name: 'Your email address' })
    await user.clear(field)
    await user.type(field, 'jerry4christ@example.org')
    await user.click(section.getByRole('button', { name: 'Send my registration' }))
    expect(await section.findByRole('alert')).toHaveTextContent('Could not change the address. Try again.')
    expect(field).toHaveValue('jerry4christ@example.org')
    expect(state.mailed).toEqual([])
  })

  it('sends them to the church once the page may change it no more', async () => {
    state.order = bounced({ email_can_fix: false })
    show()
    const section = within(await screen.findByRole('region', { name: 'Your email address' }))
    expect(section.getByText('Please contact the church to put your email address right.')).toBeInTheDocument()
    expect(section.queryByRole('textbox')).toBeNull()
  })

  it('says nothing while the email is on its way, once it has arrived, or when nothing is known', async () => {
    for (const email_state of ['waiting', 'delivered', 'none'] as const) {
      state.order = order({ email_state })
      const { unmount } = showOnce()
      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('region', { name: 'Your email address' }), email_state).toBeNull()
      unmount()
    }
  })

  it('says nothing on a cancelled registration', async () => {
    state.order = bounced({ status: 'cancelled' })
    show()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('region', { name: 'Your email address' })).toBeNull()
  })

  it('reads an order from a database that has not heard of any of this as nothing to say', async () => {
    const { email_state: _state, email_can_fix: _fix, ...old } = order()
    state.order = old as OrderView
    show()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('region', { name: 'Your email address' })).toBeNull()
  })
})
