import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppNoticeBanner } from './AppNoticeBanner'
import type { Notice } from '../lib/appNotices'

/*
 * The church's notices at the top of every page (0278).
 */

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }))

const rows = vi.hoisted(() => vi.fn<() => unknown[]>(() => []))
vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: rows(), error: null }) }) }) },
}))

const hour = 3_600_000
const at = (h: number) => new Date(Date.now() + h * hour).toISOString()
const notice = (over: Partial<Notice>): Notice => ({
  id: 'n1',
  kind: 'info',
  title: 'Carol service rehearsal moved to Friday',
  body: 'Seven o’clock, in the main hall.',
  starts_at: at(-1),
  ends_at: null,
  dismissible: true,
  closes_app: false,
  closed_from: null,
  closed_until: null,
  created_at: at(-1),
  updated_at: at(-1),
  ...over,
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AppNoticeBanner />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  window.localStorage.clear()
  rows.mockReturnValue([])
})

describe('the notices at the top of the page', () => {
  it('draws nothing when there is nothing to say', async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <AppNoticeBanner />
      </QueryClientProvider>,
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a line of information, which can be put away, and stays away', async () => {
    rows.mockReturnValue([notice({})])
    const user = show()
    const line = await screen.findByRole('note')
    expect(within(line).getByText('Carol service rehearsal moved to Friday')).toBeInTheDocument()
    expect(within(line).getByText('Seven o’clock, in the main hall.')).toBeInTheDocument()

    await user.click(within(line).getByRole('button', { name: /Dismiss/ }))
    expect(screen.queryByRole('note')).toBeNull()
    // Remembered on this device, so it does not come back on the next page.
    expect(window.localStorage.getItem('rim-notices-dismissed')).toContain('n1@')
  })

  it('announces a warning and gives no way to put it away', async () => {
    rows.mockReturnValue([notice({ id: 'w', kind: 'warning', title: 'The car park is closed this Sunday', body: '', dismissible: false })])
    show()
    const line = await screen.findByRole('alert')
    expect(within(line).getByText('Warning')).toBeInTheDocument()
    expect(within(line).queryByRole('button')).toBeNull()
  })

  it('says when the app will close, on a maintenance notice that closes it', async () => {
    rows.mockReturnValue([
      notice({ id: 'm', kind: 'maintenance', title: 'App maintenance', body: '', dismissible: false, closes_app: true, closed_from: at(24), closed_until: at(48) }),
    ])
    show()
    const line = await screen.findByRole('alert')
    expect(within(line).getByText(/The app will be closed from .+ until .+\./)).toBeInTheDocument()
  })

  it('tells somebody let in during a closure that everybody else is shut out', async () => {
    rows.mockReturnValue([
      notice({ id: 'm', kind: 'maintenance', title: 'App maintenance', body: '', dismissible: false, closes_app: true, closed_from: at(-1), closed_until: at(5) }),
    ])
    show()
    expect(await screen.findByText(/The app is closed to everybody else until/)).toBeInTheDocument()
  })

  it('leaves out what is scheduled and what is over, whatever the database sent', async () => {
    rows.mockReturnValue([notice({ id: 'later', title: 'Next week', starts_at: at(24 * 7) }), notice({ id: 'gone', title: 'Last week', ends_at: at(-1) }), notice({ id: 'now', title: 'Today' })])
    show()
    expect(await screen.findByText('Today')).toBeInTheDocument()
    expect(screen.queryByText('Next week')).toBeNull()
    expect(screen.queryByText('Last week')).toBeNull()
  })
})
