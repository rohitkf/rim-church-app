import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CelebrationsPanel } from './CelebrationsPanel'
import { DISPLAY_DEFAULTS, type Celebrations } from '../lib/display'

/*
 * The Dashboard's birthdays and anniversaries: what the church's settings
 * make of the same people (Settings › Display).
 */

const state = vi.hoisted(() => ({
  people: [] as unknown[],
  couples: [] as unknown[],
  eventsOpen: true,
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }))
vi.mock('../lib/monthGrid', () => ({ todayIso: () => '2026-10-25' }))
vi.mock('../lib/usePageAccess', () => ({ usePageAccess: () => ({ canOpen: () => state.eventsOpen }) }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve({ data: state.people, error: null }) }),
    rpc: () => Promise.resolve({ data: state.couples, error: null }),
  },
}))

const person = (id: string, first: string, dob: string | null, anniversary: string | null = null) => ({
  id,
  first_name: first,
  last_name: 'Mathew',
  dob,
  anniversary,
})

function show(over: Partial<Celebrations> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CelebrationsPanel settings={{ ...DISPLAY_DEFAULTS.celebrations, ...over }} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.people = [
    person('me', 'Rohit', '1990-10-25'),
    person('a', 'Asha', '1985-10-28', '2010-10-30'),
    person('b', 'Joel', '1979-10-30', '2010-10-30'),
    person('c', 'Cal', '2000-12-01'),
  ]
  state.couples = [{ a: 'a', b: 'b' }]
  state.eventsOpen = true
})

describe('birthdays and anniversaries on the Dashboard', () => {
  it('lists the week ahead, today first, with ages, and a couple once', async () => {
    show()
    const list = await screen.findByRole('list', { name: 'Birthdays & anniversaries' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Rohit Mathew'),
      expect.stringContaining('Asha Mathew'),
      expect.stringContaining('Asha Mathew & Joel Mathew'),
      expect.stringContaining('Joel Mathew'),
    ])
    expect(rows[0]).toHaveTextContent('You')
    expect(rows[0]).toHaveTextContent('Today')
    expect(rows[0]).toHaveTextContent('Turns 36')
    expect(rows[2]).toHaveTextContent('16 years')
    // December is outside the week.
    expect(screen.queryByText(/Cal Mathew/)).not.toBeInTheDocument()
  })

  it('gives names and days alone with ages off', async () => {
    show({ ages: false })
    await screen.findByText('Rohit Mathew')
    expect(screen.queryByText(/Turns/)).not.toBeInTheDocument()
    expect(screen.queryByText(/years/)).not.toBeInTheDocument()
  })

  it('lists only what the church switched on', async () => {
    show({ anniversaries: false })
    const list = await screen.findByRole('list', { name: 'Birthdays' })
    expect(within(list).queryByText(/&/)).not.toBeInTheDocument()
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })

  it('shows only today’s at 0 days', async () => {
    show({ days: 0 })
    const list = await screen.findByRole('list', { name: 'Birthdays & anniversaries' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Today', { selector: 'span.font-mono.text-label-sm.text-on-surface-variant' })).toBeInTheDocument()
  })

  it('stops at its limit and points to Events for the rest', async () => {
    show({ limit: 2 })
    const list = await screen.findByRole('list', { name: 'Birthdays & anniversaries' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('link', { name: '+2 more on Events' })).toHaveAttribute('href', '/events')
  })

  it('counts the rest without a link for somebody Events is closed to', async () => {
    state.eventsOpen = false
    show({ limit: 2 })
    await screen.findByRole('list', { name: 'Birthdays & anniversaries' })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('is not there at all when nobody has one', async () => {
    state.people = [person('c', 'Cal', '2000-12-01')]
    const { container } = show()
    // Give the query its turn, then expect nothing drawn.
    await new Promise((r) => setTimeout(r, 20))
    expect(container).toBeEmptyDOMElement()
  })
})
