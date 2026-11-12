import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppHealthCard } from './AppHealthCard'
import type { ClientError, HealthEvent, HealthOverview } from '../lib/appHealth'

/*
 * Settings › App Health (0284): what has gone wrong, read back — errors
 * from people's devices folded into things to look at, what failed in the
 * database's own work, and how it stands.
 */

const may = vi.hoisted(() => vi.fn(() => true))
vi.mock('../lib/usePermissions', () => ({ usePermissions: () => ({ can: (cap: string) => cap === 'settings.health' && may() }) }))

const errors = vi.hoisted(() => vi.fn<() => ClientError[]>(() => []))
const events = vi.hoisted(() => vi.fn<() => HealthEvent[]>(() => []))
const overview = vi.hoisted(() => vi.fn<() => Promise<HealthOverview>>())
const clearedErrors = vi.hoisted(() => vi.fn<(ids: string[]) => Promise<number>>((ids) => Promise.resolve(ids.length)))
const clearedEvents = vi.hoisted(() => vi.fn<(ids: number[]) => Promise<number>>((ids) => Promise.resolve(ids.length)))
vi.mock('../lib/appHealth', async (original) => ({
  ...(await original<typeof import('../lib/appHealth')>()),
  fetchClientErrors: () => Promise.resolve(errors()),
  fetchHealthEvents: () => Promise.resolve(events()),
  fetchHealthOverview: () => overview(),
  clearClientErrors: (ids: string[]) => clearedErrors(ids),
  clearHealthEvents: (ids: number[]) => clearedEvents(ids),
}))
vi.mock('../lib/supabaseClient', () => ({ supabase: {}, isSupabaseConfigured: true }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, isSuperAdmin: true }) }))

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const well: HealthOverview = {
  at: ago(0),
  jobs: [
    { name: 'apply-retention', schedule: '0 3 * * *', active: true, runs: 1, failed: 0, last_at: ago(540), last_ok: true },
    { name: 'clock-in-reminders', schedule: '* * * * *', active: true, runs: 1440, failed: 0, last_at: ago(1), last_ok: true },
  ],
  pushes: { asked: 12, answered: 12, failed: 0, hours: 6 },
  database: { bytes: 37 * 1024 ** 2, connections: 28, connections_max: 60 },
  errors: { day: 0, kept: 0 },
  schema: { version: 285, recorded: 285, latest: '0285_the_database_says_which_migrations_it_has', latest_at: null },
}

const report = (over: Partial<ClientError>): ClientError => ({
  id: '7f3c2d9a-1b2c-4d5e-8f90-123456789abc',
  created_at: ago(30),
  last_at: ago(30),
  times: 1,
  user_id: 'u1',
  source: 'page',
  message: "TypeError: Cannot read properties of undefined (reading 'name')",
  stack: 'TypeError: Cannot read…\n    at Row (Rota.tsx:10:3)',
  page: '/rota',
  build: '46269dac8f27',
  device: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1 · 390×844',
  installed: true,
  reporter: { first_name: 'Ada', last_name: 'Byron' },
  ...over,
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <AppHealthCard />
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  may.mockReturnValue(true)
  errors.mockReturnValue([])
  events.mockReturnValue([])
  overview.mockReset()
  overview.mockResolvedValue(well)
  clearedErrors.mockClear()
  clearedEvents.mockClear()
})

describe('who the room is for', () => {
  it('reads nothing and says so, for somebody without it', () => {
    may.mockReturnValue(false)
    show()
    expect(screen.getByText(/is not open to you/)).toBeInTheDocument()
    expect(overview).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
  })
})

describe('when nothing has gone wrong', () => {
  it('says so in a sentence and a word', async () => {
    show()
    expect(await screen.findByText('All well')).toBeInTheDocument()
    expect(screen.getByText('Nothing has gone wrong in the last 30 days that the app knows of.')).toBeInTheDocument()
    expect(screen.getByText('No device has reported an error.')).toBeInTheDocument()
    expect(screen.getByText('Nothing has failed.')).toBeInTheDocument()
  })

  it('shows how it stands: errors today, pushes, the database and its connections', async () => {
    show()
    expect(await screen.findByText('12 of 12 sent')).toBeInTheDocument()
    expect(screen.getByText('37 MB')).toBeInTheDocument()
    expect(screen.getByText('28 of 60')).toBeInTheDocument()
    expect(screen.getByText('In the last 6 hours')).toBeInTheDocument()
  })

  it('keeps the timed jobs folded, with their count in the heading', async () => {
    show()
    expect(await screen.findByText('2 jobs the database runs by the clock · none failed in the last day.')).toBeInTheDocument()
    expect(screen.queryByText('clock-in-reminders')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Timed jobs/ }))
    expect(await screen.findByText('clock-in-reminders')).toBeInTheDocument()
    expect(screen.getByText(`${(1440).toLocaleString()} runs, none failed`)).toBeInTheDocument()
  })
})

describe('the database’s own record of its migrations (0285)', () => {
  it('says where the database is against what this version of the app needs', async () => {
    show()
    expect(await screen.findByText(/The database is at migration 285/)).toBeInTheDocument()
    expect(screen.getByText('0285_the_database_says_which_migrations_it_has')).toBeInTheDocument()
  })

  it('warns when the database is behind the app', async () => {
    overview.mockResolvedValue({ ...well, schema: { version: 200, recorded: 200, latest: '0200_x', latest_at: null } })
    show()
    expect(await screen.findByText(/The database is at migration 200; this version of the app needs \d+\. Anything new will not work/)).toBeInTheDocument()
  })

  it('says nothing about it for a database that keeps no such record', async () => {
    overview.mockResolvedValue({ ...well, schema: null })
    show()
    await screen.findByText('37 MB')
    expect(screen.queryByText(/The database is at migration/)).not.toBeInTheDocument()
  })
})

describe('errors from people’s devices', () => {
  it('are one thing to look at when they say the same on the same version', async () => {
    errors.mockReturnValue([
      report({ id: 'a1111111-0000-4000-8000-000000000000', user_id: 'u1', times: 3 }),
      report({ id: 'b2222222-0000-4000-8000-000000000000', user_id: 'u2', page: '/songs', reporter: { first_name: 'Grace', last_name: 'Hopper' } }),
    ])
    show()
    const message = await screen.findByText("TypeError: Cannot read properties of undefined (reading 'name')")
    const group = message.closest('li') as HTMLElement
    expect(within(group).getByText('2 people · 4 times')).toBeInTheDocument()
    expect(within(group).getByText('Version 46269dac8f27')).toBeInTheDocument()
    expect(within(group).getByText('On /rota, /songs')).toBeInTheDocument()
    expect(screen.getByText('Wants a look')).toBeInTheDocument()
    expect(screen.getByText('1 kind of error from people’s devices.')).toBeInTheDocument()
  })

  it('say who, where, on what, and the reference the page showed them', async () => {
    errors.mockReturnValue([report({})])
    const user = show()
    await user.click(await screen.findByText('The report'))
    expect(screen.getByText('Ada Byron')).toBeInTheDocument()
    expect(screen.getByText('7F3C2D9A')).toBeInTheDocument()
    expect(screen.getByText(/A page could not be drawn on \/rota · iPhone · Safari · 390×844 · installed app/)).toBeInTheDocument()
    expect(screen.getByText(/at Row \(Rota\.tsx:10:3\)/)).toBeInTheDocument()
  })

  it('name a visitor as a visitor', async () => {
    errors.mockReturnValue([report({ user_id: null, reporter: null, page: '/ticket/…', installed: false })])
    const user = show()
    await user.click(await screen.findByText('The report'))
    expect(screen.getByText('A visitor, not signed in')).toBeInTheDocument()
    expect(screen.getByText('visitors · once')).toBeInTheDocument()
  })

  it('are put away only after being asked, all of a kind at once', async () => {
    // Each its own time, said outright. Left to the fixture both are "thirty
    // minutes ago" by the clock when each was made, which is the same
    // instant on a fast machine and a millisecond apart on a slow one — and
    // a group lists its newest report first, so the order asked of the
    // server turned on that millisecond. CI's first run on main for six
    // weeks failed on it.
    errors.mockReturnValue([
      report({ id: 'a1111111-0000-4000-8000-000000000000', last_at: ago(10) }),
      report({ id: 'b2222222-0000-4000-8000-000000000000', user_id: 'u2', last_at: ago(40) }),
    ])
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Put away' }))
    expect(clearedErrors).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/2 reports are removed/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Put away' }))
    await waitFor(() => expect(clearedErrors).toHaveBeenCalledWith(['a1111111-0000-4000-8000-000000000000', 'b2222222-0000-4000-8000-000000000000']))
  })
})

describe('what failed in the app’s own work', () => {
  const failures: HealthEvent[] = [
    { id: 2, kind: 'push', name: 'push-on-notification', at: ago(20), detail: 'It answered 500: boom' },
    { id: 1, kind: 'job', name: 'apply-retention', at: ago(600), detail: 'ERROR:  relation "gone" does not exist' },
  ]

  it('lists each with what it was, when, and what it said', async () => {
    events.mockReturnValue(failures)
    show()
    expect(await screen.findByText('push-on-notification')).toBeInTheDocument()
    expect(screen.getByText('Notification to phones')).toBeInTheDocument()
    expect(screen.getByText('Timed job')).toBeInTheDocument()
    expect(screen.getByText('It answered 500: boom')).toBeInTheDocument()
    expect(screen.getByText('2 failures in the app’s own work.')).toBeInTheDocument()
  })

  it('opens the timed jobs when one has failed, the failed one first', async () => {
    overview.mockResolvedValue({ ...well, jobs: [...well.jobs, { name: 'registration-anonymise', schedule: '35 3 * * *', active: true, runs: 1, failed: 1, last_at: ago(500), last_ok: false }] })
    show()
    expect(await screen.findByText('1 of 1 failed')).toBeInTheDocument()
    const names = screen.getAllByText(/^(apply-retention|clock-in-reminders|registration-anonymise)$/).map((el) => el.textContent)
    expect(names[0]).toBe('registration-anonymise')
  })

  it('are put away together, after being asked', async () => {
    events.mockReturnValue(failures)
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Put all away' }))
    expect(clearedEvents).not.toHaveBeenCalled()
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Put away' }))
    await waitFor(() => expect(clearedEvents).toHaveBeenCalledWith([2, 1]))
  })

  it('offers nothing to put away when there is nothing', async () => {
    show()
    await screen.findByText('Nothing has failed.')
    expect(screen.queryByRole('button', { name: 'Put all away' })).not.toBeInTheDocument()
  })
})

describe('when the room cannot be read', () => {
  it('says so, and the rest of it still draws', async () => {
    overview.mockRejectedValue({ code: '42501', message: 'You may not see the app’s health.' })
    show()
    expect(await screen.findByText('No device has reported an error.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Try again/ }).length).toBeGreaterThan(0))
  })
})
