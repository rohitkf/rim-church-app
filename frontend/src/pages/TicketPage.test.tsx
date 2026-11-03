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
 * any money moves; the attendee reports a payment, the church confirms it.
 */

const state = vi.hoisted(() => ({
  order: null as unknown,
  reported: [] as unknown[],
  cancelled: 0,
  mailed: [] as string[],
  mailAnswer: { ok: true, sent: true } as unknown,
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false, isSuperAdmin: false, session: null }) }))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'https://signed/logo.png' }, error: null }) }) } },
}))
vi.mock('../components/QrCode', () => ({
  QrCode: ({ text, label }: { text: string; label: string }) => <svg role="img" aria-label={label} data-text={text} />,
}))
vi.mock('../lib/registrations', async (original) => ({
  ...(await original<typeof import('../lib/registrations')>()),
  fetchOrder: () => Promise.resolve(state.order),
  reportPayment: (code: string, method: string, done: boolean) => {
    state.reported.push({ code, method, done })
    return Promise.resolve()
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

// jsdom cannot follow a link; the page's own click handler still runs.
window.addEventListener('click', (e) => e.preventDefault(), true)

beforeEach(() => {
  state.order = order()
  state.reported = []
  state.cancelled = 0
  state.mailed = []
  state.mailAnswer = { ok: true, sent: true }
})

describe('the ticket page', () => {
  it('shows the QR code, the code, every ticket and what is owed', async () => {
    show()
    expect(await screen.findByRole('img', { name: 'Ticket ABCDEFGHJKMN' })).toHaveAttribute('data-text', 'https://rim-church-app.vercel.app/ticket/ABCDEFGHJKMN')
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
    await waitFor(() => expect(state.reported).toEqual([{ code: 'ABCDEFGHJKMN', method: 'paypal', done: true }]))
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

  it('shows the bank details with the code as the reference, and takes their word', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Bank transfer' }))
    expect(screen.getByRole('heading', { name: 'Main account' })).toBeInTheDocument()
    expect(screen.getByText('20-00-00')).toBeInTheDocument()
    // The reference is the code, so the transfer can be matched to the ticket.
    expect(screen.getByRole('button', { name: 'Copy Reference' })).toBeInTheDocument()
    expect(screen.getAllByText('ABCDEFGHJKMN').length).toBeGreaterThanOrEqual(2)
    await user.click(screen.getByRole('button', { name: 'I’ve sent the transfer' }))
    const dialog = await screen.findByRole('dialog', { name: 'Did you complete the payment?' })
    await user.click(within(dialog).getByRole('button', { name: 'Yes, I’ve paid' }))
    await waitFor(() => expect(state.reported).toEqual([{ code: 'ABCDEFGHJKMN', method: 'bank', done: true }]))
  })

  it('lets them choose to pay at reception instead', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'I’ll pay at reception' }))
    await waitFor(() => expect(state.reported).toEqual([{ code: 'ABCDEFGHJKMN', method: 'reception', done: false }]))
  })

  it('says a reported payment waits to be confirmed, and offers nothing more to do', async () => {
    state.order = order({ payment_status: 'reported', payment_method: 'bank' })
    show()
    expect(await screen.findByRole('heading', { name: 'Thank you — your payment will be confirmed' })).toBeInTheDocument()
    expect(screen.getByText(/You said you paid by bank transfer/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Pay with PayPal/ })).toBeNull()
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
    await user.click(await screen.findByRole('button', { name: 'Email me this ticket' }))
    expect(await screen.findByRole('status')).toHaveTextContent('On its way to ama@example.org.')
    expect(state.mailed).toEqual(['ABCDEFGHJKMN'])
    state.mailAnswer = { ok: true, sent: false }
    await user.click(screen.getByRole('button', { name: 'Email me this ticket' }))
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

  it('says so when the link leads nowhere', async () => {
    state.order = null
    show()
    expect(await screen.findByRole('heading', { name: 'No such ticket' })).toBeInTheDocument()
  })
})
