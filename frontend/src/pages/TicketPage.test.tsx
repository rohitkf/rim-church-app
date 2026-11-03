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
}))

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()

const order = (over: Partial<OrderView> = {}): OrderView => ({
  code: 'ABCDEFGHJKMN',
  status: 'confirmed',
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
})

describe('the ticket page', () => {
  it('shows the QR code, the code, every ticket and what is owed — a registration until it is paid', async () => {
    show()
    expect(await screen.findByRole('img', { name: 'Registration ABCDEFGHJKMN' })).toHaveAttribute('data-text', 'https://rim-church-app.vercel.app/ticket/ABCDEFGHJKMN')
    expect(screen.getByText(/Show this at reception to pay/)).toBeInTheDocument()
    expect(screen.getAllByText('ABCDEFGHJKMN').length).toBeGreaterThan(0)
    expect(screen.getByText('Registered')).toBeInTheDocument()
    expect(screen.getByText('Awaiting payment')).toBeInTheDocument()
    expect(screen.getByText(/Kofi Owusu/)).toBeInTheDocument()
    expect(screen.getByText('−£4.00')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'To pay: £36.00' })).toBeInTheDocument()
    expect(screen.getByText('Please pay within a week.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Pay with PayPal/ })).toHaveAttribute('href', 'https://paypal.me/rim')
    expect(screen.getByRole('link', { name: 'Event page' })).toHaveAttribute('href', '/register/pastors-2026')
  })

  it('asks, on coming back from the payment link, whether it went through', async () => {
    const user = show()
    await user.click(await screen.findByRole('link', { name: /Pay with PayPal/ }))
    await comeBack()
    const dialog = await screen.findByRole('dialog', { name: 'Did you complete the payment?' })
    await user.click(within(dialog).getByRole('button', { name: 'Yes, I’ve paid' }))
    // Then the receipt: here the reference alone.
    const proof = await screen.findByRole('dialog', { name: 'Your receipt' })
    await user.type(within(proof).getByRole('textbox', { name: /Payment reference/ }), 'PP-123')
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
    await user.click(screen.getByRole('button', { name: 'I’ve sent the transfer' }))
    const proof = await screen.findByRole('dialog', { name: 'Your receipt' })
    await user.upload(within(proof).getByLabelText('Screenshot or PDF'), new File(['png'], 'transfer.png', { type: 'image/png' }))
    expect(within(proof).getByText('transfer.png')).toBeInTheDocument()
    await user.click(within(proof).getByRole('button', { name: 'Send' }))
    // The file goes up under the order's own code, and its path is reported with the payment.
    await waitFor(() => expect(state.reported).toEqual([{ code: 'ABCDEFGHJKMN', method: 'bank', done: true, path: 'ABCDEFGHJKMN/receipt.png', reference: null }]))
    expect(state.uploaded).toEqual([['ABCDEFGHJKMN', 'transfer.png', 'image/png']])
  })

  it('wants the receipt or the reference, one at least, before it takes their word', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Bank transfer' }))
    await user.click(screen.getByRole('button', { name: 'I’ve sent the transfer' }))
    const proof = await screen.findByRole('dialog', { name: 'Your receipt' })
    await user.click(within(proof).getByRole('button', { name: 'Send' }))
    expect(within(proof).getByRole('alert')).toHaveTextContent(/Attach the receipt, or type the payment reference/)
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

  it('says a refund goes back the way it was paid, asking for nothing', async () => {
    state.order = order({ payment_status: 'received', payment_method: 'bank', refund_status: 'owed', refund_details_wanted: false })
    show()
    const refund = await screen.findByRole('region', { name: 'Your refund' })
    expect(refund).toHaveTextContent(/refund £36.00 to the bank account you paid from/)
    expect(within(refund).queryByRole('textbox')).toBeNull()
  })

  it('asks a cash payer where to send the refund, and takes UK details or an IBAN', async () => {
    state.order = order({ payment_status: 'received', payment_method: 'reception', refund_status: 'owed', refund_details_wanted: true, refund_details_sent: false })
    const user = show()
    const refund = await screen.findByRole('region', { name: 'Your refund' })
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
