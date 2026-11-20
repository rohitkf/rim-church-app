import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DISPLAY_DEFAULTS, type CallTimesCard } from '../lib/display'
import { MyCallTimes } from './MyCallTimes'

const world = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  teamIds: ['sound'] as string[],
  led: [] as string[],
  viewAs: null as null | { as: string },
  rotaOpen: true,
  callTimes: [] as { department_id: string; on_date: string; call_time: string }[],
  rota: [] as { service_id: string; department_id: string }[],
  finished: [] as string[],
  asked: [] as string[],
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, ledDepartmentIds: world.led, viewAs: world.viewAs }),
}))
vi.mock('../lib/appSettings', () => ({ useDisplay: () => ({ callTimes: world.settings }) }))
vi.mock('../lib/useOwnMemberships', () => ({ useOwnMemberships: () => ({ teamIds: world.teamIds }) }))
vi.mock('../lib/useFinishedServices', () => ({ useFinishedServices: () => ({ isFinished: (id: string) => world.finished.includes(id) }) }))
vi.mock('../lib/usePageAccess', () => ({ usePageAccess: () => ({ canOpen: () => world.rotaOpen, settled: true }) }))
vi.mock('../lib/queries', () => ({
  fetchServices: () =>
    Promise.resolve([
      { id: 's-eng', date: '2026-11-22', service_type: 'English Service' },
      { id: 's-mal', date: '2026-11-22', service_type: 'Malayalam Service' },
      { id: 's-next', date: '2026-11-29', service_type: 'English Service' },
    ]),
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'sound', name: 'Sound', color: '#0066cc' },
      { id: 'worship', name: 'Worship', color: null },
    ]),
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      world.asked.push(table)
      const rows = table === 'department_call_times' ? world.callTimes : world.rota
      const q = { select: () => q, eq: () => q, in: () => q, then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok) }
      return q
    },
  },
}))

const set = (over: Partial<CallTimesCard> = {}) => (world.settings = { ...DISPLAY_DEFAULTS.callTimes, ...over })

function show() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <MyCallTimes />
        <p>the rest of the dashboard</p>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const at = (when: string) => vi.setSystemTime(new Date(when))
const settle = () => new Promise((r) => setTimeout(r, 60))

beforeEach(() => {
  // The clock is the test's, and it runs: a timer set for two seconds' time fires in two.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  at('2026-11-20T18:00:00')
  set()
  Object.assign(world, { teamIds: ['sound'], led: [], viewAs: null, rotaOpen: true, rota: [], asked: [], finished: [] })
  world.callTimes = [{ department_id: 'sound', on_date: '2026-11-22', call_time: '06:30:00' }]
})
afterEach(() => vi.useRealTimers())

describe('your call time, on the Dashboard', () => {
  it('says when my team is due, on which day, and what is on', async () => {
    show()
    const card = await screen.findByRole('region', { name: 'Your call time' })
    expect(within(card).getByText('Sound')).toBeInTheDocument()
    expect(within(card).getByText('06:30')).toBeInTheDocument()
    expect(within(card).getByText(/English Service · Malayalam Service/)).toBeInTheDocument()
    expect(within(card).getByText(/until your call/)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Every team' })).toHaveAttribute('href', '/rota')
  })

  it('gives a line to each time, when my teams are called at different times', async () => {
    world.led = ['worship']
    show()
    const card = await screen.findByRole('region', { name: 'Your call times' })
    const rows = within(card).getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatch(/^Sound06:30/)
    // Nobody set Worship's: the usual seven.
    expect(rows[1]).toMatch(/^Worship07:00/)
  })

  it('says the time once for teams called together', async () => {
    world.led = ['worship']
    world.callTimes = []
    show()
    const card = await screen.findByRole('region', { name: 'Your call time' })
    const rows = within(card).getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatch(/^SoundWorship07:00/)
  })

  it('shows the next service day only, never the ones after it', async () => {
    show()
    const card = await screen.findByRole('region', { name: 'Your call time' })
    // The Sunday after is inside the week ahead, and is not mentioned.
    expect(within(card).getAllByRole('listitem')).toHaveLength(1)
    expect(within(card).queryByText(/29 Nov|Nov 29/)).toBeNull()
  })

  it('says Tomorrow and Today rather than a date', async () => {
    at('2026-11-21T18:00:00')
    show()
    expect(await screen.findByText('Tomorrow')).toBeInTheDocument()
  })

  it('goes the moment the call time is reached', async () => {
    at('2026-11-22T06:29:58')
    show()
    expect(await screen.findByRole('region', { name: 'Your call time' })).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    // Gone, and next Sunday's does not take its place.
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull(), { timeout: 4000 })
  })

  it('is not there after the call time, while the day’s services are still to come or under way', async () => {
    at('2026-11-22T11:00:00')
    world.finished = ['s-eng']
    show()
    await settle()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('keeps it away until the next day where the church has asked for that', async () => {
    at('2026-11-22T13:30:00')
    world.finished = ['s-eng', 's-mal']
    set({ next: 'day' })
    show()
    await settle()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('shows the next service day’s once today’s last service has ended', async () => {
    at('2026-11-22T13:30:00')
    world.finished = ['s-eng', 's-mal']
    show()
    const card = await screen.findByRole('region', { name: 'Your call time' })
    expect(within(card).getByText(/29 Nov|Nov 29/)).toBeInTheDocument()
    // Nobody set next Sunday's: the usual seven.
    expect(within(card).getByText('07:00')).toBeInTheDocument()
  })

  it('stays past the call time for as long as the church set, saying it is due', async () => {
    at('2026-11-22T06:40:00')
    set({ stayMinutes: 15 })
    show()
    const card = await screen.findByRole('region', { name: 'Your call time' })
    expect(within(card).getByText('Due now')).toBeInTheDocument()
    expect(within(card).queryByText(/until your call/)).toBeNull()
  })

  it('appears only as far ahead as the church set', async () => {
    set({ days: 1 })
    show()
    await settle()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('runs no clock when the countdown is off', async () => {
    set({ countdown: false })
    show()
    const card = await screen.findByRole('region', { name: 'Your call time' })
    expect(within(card).queryByText(/until your call/)).toBeNull()
  })

  it('is switched off altogether, and then asks the database nothing', async () => {
    set({ show: false })
    show()
    await settle()
    expect(screen.queryByRole('region')).toBeNull()
    expect(world.asked).toEqual([])
  })

  it('has nothing for somebody on no team', async () => {
    world.teamIds = []
    show()
    await settle()
    expect(screen.queryByRole('region')).toBeNull()
    expect(world.asked).toEqual([])
  })

  it('offers no way to the rota to somebody who cannot open it', async () => {
    world.rotaOpen = false
    show()
    const card = await screen.findByRole('region', { name: 'Your call time' })
    expect(within(card).queryByRole('link')).toBeNull()
  })

  describe('when the church shows it only to whoever is on the rota', () => {
    beforeEach(() => set({ who: 'rota' }))

    it('is not there for somebody on the team who is not serving', async () => {
      show()
      await settle()
      expect(screen.queryByRole('region')).toBeNull()
      expect(world.asked).toContain('rota_assignments')
    })

    it('is there for somebody the rota put on', async () => {
      world.rota = [{ service_id: 's-mal', department_id: 'sound' }]
      show()
      const card = await screen.findByRole('region', { name: 'Your call time' })
      expect(within(card).getByText('06:30')).toBeInTheDocument()
    })

    it('shows a preview the team it picked: a preview has no rota of its own', async () => {
      world.viewAs = { as: 'member' }
      show()
      expect(await screen.findByRole('region', { name: 'Your call time' })).toBeInTheDocument()
      expect(world.asked).not.toContain('rota_assignments')
    })
  })
})
