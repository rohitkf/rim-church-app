import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClockInPunctuality } from './ClockInPunctuality'

/*
 * Each person's clock-ins over the weeks kept (0280): who, how many, how
 * many late, what is usual — and the chart and the list when one is opened.
 */

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  asked: [] as string[],
  settings: { timezone: 'Europe/London', clock_in_retention_days: 28, clock_in_late_minutes: 30 },
}))

vi.mock('../lib/appSettings', () => ({ useAppSettings: () => state.settings }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))
vi.mock('../lib/monthGrid', async (original) => ({
  ...(await original<typeof import('../lib/monthGrid')>()),
  todayIso: () => '2026-11-11',
}))
vi.mock('../lib/clockIn', async (original) => ({
  ...(await original<typeof import('../lib/clockIn')>()),
  fetchArrivals: (since: string) => {
    state.asked.push(since)
    return Promise.resolve(state.rows)
  },
}))

const one = (user_id: string, first: string, last: string, day: string, clocked: string, call: string | null) => ({
  user_id,
  on_date: day,
  clocked_at: `${day}T${clocked}:00Z`,
  call_at: call ? `${day}T${call}:00Z` : null,
  person: { first_name: first, last_name: last },
})

const show = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ClockInPunctuality />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.asked = []
  state.settings = { timezone: 'Europe/London', clock_in_retention_days: 28, clock_in_late_minutes: 30 }
  state.rows = [
    one('joel', 'Joel', 'Skaria', '2026-10-25', '07:48', '08:00'),
    one('joel', 'Joel', 'Skaria', '2026-11-01', '07:55', '08:00'),
    one('joel', 'Joel', 'Skaria', '2026-11-08', '08:02', '08:00'),
    one('grace', 'Grace', 'Mensah', '2026-10-25', '08:47', '08:00'),
    one('grace', 'Grace', 'Mensah', '2026-11-01', '09:10', '08:00'),
    one('grace', 'Grace', 'Mensah', '2026-11-08', '08:10', '08:00'),
    one('ama', 'Ama', 'Owusu', '2026-11-08', '08:35', '08:00'),
  ]
})

describe('arrivals, person by person', () => {
  it('asks for the window the church keeps, counted back from today', async () => {
    show()
    await screen.findByRole('list', { name: 'Arrivals, person by person' })
    expect(state.asked).toEqual(['2026-10-14'])
  })

  it('says how many people, how many were ever late, what late is, and that older is deleted', async () => {
    show()
    const said = await screen.findByText(/3 people have clocked in over the last 4 weeks/)
    expect(said).toHaveTextContent('2 were late at least once')
    expect(said).toHaveTextContent('Late is 30 min or more after that person’s call time')
    expect(said).toHaveTextContent('Anything older is deleted')
  })

  it('lists whoever is late most often first, each with their record and what is usual for them', async () => {
    show()
    const list = await screen.findByRole('list', { name: 'Arrivals, person by person' })
    const people = within(list).getAllByRole('button')
    expect(people.map((p) => p.textContent)).toEqual([
      expect.stringMatching(/^Grace Mensah2 late of 3 · Usually 47 min after call/),
      expect.stringMatching(/^Ama Owusu1 late of 1 · Usually 35 min after call/),
      expect.stringMatching(/^Joel SkariaOn time, all 3 clock-ins · Usually 5 min before call/),
    ])
  })

  it('opens one person at a time: the chart, and every clock-in as a list', async () => {
    const user = show()
    const grace = await screen.findByRole('button', { name: /^Grace Mensah/ })
    expect(grace).toHaveAttribute('aria-expanded', 'false')
    await user.click(grace)
    expect(grace).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('figure', { name: 'Grace Mensah: clock-ins against call time' })).toBeInTheDocument()

    await user.click(screen.getByText('Every clock-in (3)'))
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    // Newest first, each with its call, its time and how it fell — late in words.
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/(8 Nov|Nov 8)08:0008:1010 min after call$/),
      expect.stringMatching(/(1 Nov|Nov 1)08:0009:101 h 10 min after call — late$/),
      expect.stringMatching(/(25 Oct|Oct 25)08:0008:4747 min after call — late$/),
    ])

    await user.click(screen.getByRole('button', { name: /^Joel Skaria/ }))
    expect(screen.queryByRole('figure', { name: 'Grace Mensah: clock-ins against call time' })).toBeNull()
    expect(screen.getByRole('figure', { name: 'Joel Skaria: clock-ins against call time' })).toBeInTheDocument()
  })

  it('moves with the church’s settings: a longer wait before late, a shorter window', async () => {
    state.settings = { timezone: 'Europe/London', clock_in_retention_days: 14, clock_in_late_minutes: 60 }
    show()
    const said = await screen.findByText(/have clocked in over the last 2 weeks/)
    expect(said).toHaveTextContent('1 was late at least once')
    expect(said).toHaveTextContent('Late is 60 min or more')
    expect(state.asked).toEqual(['2026-10-28'])
    expect(screen.getByRole('button', { name: /^Grace Mensah/ })).toHaveTextContent('1 late of 3')
  })

  it('says so when nobody has clocked in inside the window', async () => {
    state.rows = []
    show()
    expect(await screen.findByText('Nobody has clocked in in the last 4 weeks.')).toBeInTheDocument()
  })

  it('shows a dozen people and the rest when asked', async () => {
    state.rows = Array.from({ length: 15 }, (_, i) => one(`p${i}`, `Person`, String(i).padStart(2, '0'), '2026-11-08', '08:05', '08:00'))
    const user = show()
    const list = await screen.findByRole('list', { name: 'Arrivals, person by person' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(12)
    await user.click(screen.getByRole('button', { name: 'Show everybody (15)' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(15)
    expect(screen.queryByRole('button', { name: /Show everybody/ })).toBeNull()
  })
})
