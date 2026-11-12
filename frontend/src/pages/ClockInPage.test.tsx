import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClockInPage } from './ClockInPage'
import { pickTime } from '../test/pickers'

/*
 * The Clock In page: who arrived, when and where; the Owner and Admins
 * can put a clock-in right, with a reason, and every change is listed.
 */

const state = vi.hoisted(() => ({
  /** The day's clock-ins, when a test wants its own. */
  rows: null as unknown[] | null,
  teams: null as { user_id: string; department_id: string }[] | null,
  admin: false,
  changed: [] as unknown[],
  removed: [] as unknown[],
  lookups: 0,
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, isAdmin: state.admin, isSuperAdmin: false }),
}))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/appSettings', () => ({
  useAppSettings: () => ({ timezone: 'Europe/London', clock_in_radius_m: 100, clock_in_late_minutes: 30, clock_in_retention_days: 28 }),
}))
vi.mock('../components/ClockInPlaceCard', () => ({ ClockInPlaceCard: () => <p>Where the church is</p> }))
vi.mock('../lib/plannerControls', async (original) => ({
  ...(await original<typeof import('../lib/plannerControls')>()),
  fetchPeopleOptions: () => Promise.resolve([{ id: 'p2', first_name: 'Ama', last_name: 'Owusu' }]),
}))
vi.mock('../lib/queries', async (original) => ({
  ...(await original<typeof import('../lib/queries')>()),
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'd-media', name: 'Media' },
      { id: 'd-welcome', name: 'Welcome' },
    ]),
}))
vi.mock('../lib/clockIn', async (original) => ({
  ...(await original<typeof import('../lib/clockIn')>()),
  fetchStillOut: () =>
    Promise.resolve([{ user_id: 'p2', department_id: 'd-media', call_at: '2026-11-01T09:30:00Z', asked: false }]),
  fetchClockInRequestsToAnswer: () => Promise.resolve([]),
  fetchClockInTeams: () =>
    Promise.resolve(state.teams ?? [{ user_id: 'p1', department_id: 'd-welcome' }, { user_id: 'p3', department_id: 'd-media' }]),
  fetchArrivals: () =>
    Promise.resolve([
      { user_id: 'p3', on_date: '2026-11-01', clocked_at: '2026-11-01T09:50:00Z', call_at: '2026-11-01T09:00:00Z', person: { first_name: 'Grace', last_name: 'Mensah' } },
      { user_id: 'p1', on_date: '2026-11-01', clocked_at: '2026-11-01T09:41:00Z', call_at: '2026-11-01T09:45:00Z', person: { first_name: 'Joel', last_name: 'Skaria' } },
    ]),
  fetchClockIns: () =>
    Promise.resolve(state.rows ?? [
      {
        id: 'c1',
        user_id: 'p1',
        on_date: '2026-11-01',
        clocked_at: '2026-11-01T09:41:00Z',
        method: 'location',
        latitude: 51.5,
        longitude: -0.1,
        accuracy_m: 12,
        distance_m: 34,
        address: '12 High Street, Reading',
        address_tries: 1,
        person: { first_name: 'Joel', last_name: 'Skaria' },
      },
      {
        id: 'c2',
        user_id: 'p3',
        on_date: '2026-11-01',
        clocked_at: '2026-11-01T09:50:00Z',
        method: 'location',
        latitude: 51.5,
        longitude: -0.1,
        accuracy_m: 20,
        distance_m: 60,
        address: null,
        address_tries: 0,
        person: { first_name: 'Grace', last_name: 'Mensah' },
      },
    ]),
  fetchClockInHistory: () =>
    Promise.resolve([
      {
        id: 'h2',
        user_id: 'p1',
        on_date: '2026-11-01',
        kind: 'changed',
        clocked_at: '2026-11-01T09:41:00Z',
        previous_at: '2026-11-01T09:58:00Z',
        note: 'Phone died at the door',
        changed_by: 'me',
        changed_at: '2026-11-01T10:30:00Z',
        person: { first_name: 'Joel', last_name: 'Skaria' },
        changer: { first_name: 'Rohit', last_name: 'K' },
      },
    ]),
  changeClockInTime: (...args: unknown[]) => {
    state.changed.push(args)
    return Promise.resolve()
  },
  removeClockIn: (...args: unknown[]) => {
    state.removed.push(args)
    return Promise.resolve()
  },
  lookUpAddresses: () => {
    state.lookups += 1
  },
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ClockInPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/** The page's sections start shut; open the ones a test reads. */
async function open(user: ReturnType<typeof userEvent.setup>, ...names: RegExp[]) {
  for (const name of names) await user.click(await screen.findByRole('button', { name }))
}

beforeEach(() => {
  state.rows = null
  state.teams = null
  state.admin = false
  state.changed = []
  state.removed = []
  state.lookups = 0
})

describe('the Clock In page', () => {
  it('starts with every section shut, each saying what is in it', async () => {
    show()
    const clockIns = await screen.findByRole('button', { name: /^Clock-ins/ })
    expect(clockIns).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(clockIns).toHaveTextContent('2 clocked in · 1 still to arrive'))
    expect(screen.getByRole('button', { name: /^History/ })).toHaveTextContent('1 entry')
    expect(screen.queryByRole('list', { name: /^Who clocked in/ })).toBeNull()
  })

  it('shows who arrived, when, and where — and asks for the addresses still missing', async () => {
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    const table = await screen.findByRole('list', { name: /^Who clocked in/ })
    expect(within(table).getByText('Joel Skaria')).toBeInTheDocument()
    expect(within(table).getByText('09:41')).toBeInTheDocument()
    expect(within(table).getByText('12 High Street, Reading')).toBeInTheDocument()
    expect(within(table).getByText('Looking up the address…')).toBeInTheDocument()
    expect(state.lookups).toBe(1)
  })

  it('groups them by the team they were on that day', async () => {
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    await screen.findByRole('list', { name: /^Who clocked in/ })
    const media = screen.getByRole('listitem', { name: 'Media' })
    const welcome = screen.getByRole('listitem', { name: 'Welcome' })
    expect(within(media).getByText('1 in · 1 to come')).toBeInTheDocument()
    expect(within(welcome).getByText('1 in')).toBeInTheDocument()
    expect(within(media).getByText('Grace Mensah')).toBeInTheDocument()
    expect(within(welcome).getByText('Joel Skaria')).toBeInTheDocument()
  })

  it('says who on each team is still to arrive', async () => {
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    const waiting = await screen.findByRole('list', { name: 'Media: still to arrive' })
    expect(waiting).toHaveTextContent('Ama Owusu 09:30')
    expect(screen.getByText(/1 in · 1 to come/)).toBeInTheDocument()
  })

  it('gives nobody but the Owner and Admins the church’s spot or a way to change anything', async () => {
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    await screen.findByRole('list', { name: /^Who clocked in/ })
    expect(screen.queryByText('Where the church is')).toBeNull()
    expect(screen.queryByRole('button', { name: /Fix Joel/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add a clock-in' })).toBeNull()
  })

  it('lets an Admin change a time, with a reason', async () => {
    state.admin = true
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    expect(await screen.findByText('Where the church is')).toBeInTheDocument()
    const fix = await screen.findByRole('button', { name: 'Fix Joel Skaria’s clock-in' })
    await user.click(fix)
    // It opens right under Joel, not below every team's card.
    expect(fix.closest('li')!.querySelector('form[aria-label="Fix Joel Skaria’s clock-in"]')).not.toBeNull()
    await pickTime(user, screen.getByRole('button', { name: 'Arrived at' }), '09:30')
    await user.type(screen.getByRole('textbox', { name: 'Why' }), 'Arrived before the phone did')
    await user.click(screen.getByRole('button', { name: 'Save the time' }))
    expect(state.changed).toHaveLength(1)
    const [id, at, note] = state.changed[0] as [string, Date, string]
    expect(id).toBe('c1')
    expect(at.toISOString()).toBe('2026-11-01T09:30:00.000Z')
    expect(note).toBe('Arrived before the phone did')
  })

  it('lets an Admin remove one, with a reason', async () => {
    state.admin = true
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    await user.click(await screen.findByRole('button', { name: 'Fix Grace Mensah’s clock-in' }))
    await user.click(screen.getByRole('button', { name: 'Remove it instead' }))
    await user.type(screen.getByRole('textbox', { name: 'Why' }), 'Not here today')
    await user.click(screen.getByRole('button', { name: 'Remove it' }))
    expect(state.removed).toEqual([['c2', 'Not here today']])
  })

  it('marks a time fixed by hand, and Fix shows that person’s own history', async () => {
    state.admin = true
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    const joel = (await screen.findByRole('button', { name: 'Fix Joel Skaria’s clock-in' })).closest('li')!
    expect(joel).toHaveTextContent('time fixed')
    expect(screen.getByRole('button', { name: 'Fix Grace Mensah’s clock-in' }).closest('li')!).not.toHaveTextContent('time fixed')
    await user.click(screen.getByRole('button', { name: 'Fix Joel Skaria’s clock-in' }))
    const theirs = screen.getByRole('list', { name: 'Joel Skaria’s clock-in history' })
    expect(theirs).toHaveTextContent('09:58 → 09:41')
    expect(theirs).toHaveTextContent('Phone died at the door')
  })

  it('lists every change, with who made it and why', async () => {
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    const history = await screen.findByText('Phone died at the door', { exact: false })
    const line = history.closest('li')!
    expect(line).toHaveTextContent('Joel Skaria time fixed by hand')
    expect(line).toHaveTextContent('09:58 → 09:41')
    expect(line).toHaveTextContent('by Rohit K')
  })
})

/*
 * 0280: a clock-in is held against the call time it was for. Late is red
 * and first; who is still to come is above the list, not under it; and
 * each person's weeks are a section of their own.
 */
describe('the Clock In page, with call times', () => {
  const clockIn = (id: string, user_id: string, first: string, last: string, clocked: string, call: string | null) => ({
    id,
    user_id,
    on_date: '2026-11-01',
    clocked_at: `2026-11-01T${clocked}:00Z`,
    call_at: call ? `2026-11-01T${call}:00Z` : null,
    method: 'location',
    latitude: null,
    longitude: null,
    accuracy_m: null,
    distance_m: null,
    address: '12 High Street, Reading',
    address_tries: 1,
    person: { first_name: first, last_name: last },
  })

  beforeEach(() => {
    state.rows = [
      clockIn('c1', 'p1', 'Joel', 'Skaria', '08:55', '09:00'),
      clockIn('c2', 'p3', 'Grace', 'Mensah', '09:35', '09:00'),
      clockIn('c3', 'p4', 'Ben', 'Adu', '09:10', '09:00'),
      clockIn('c4', 'p5', 'Cara', 'Nti', '10:15', '09:00'),
      clockIn('c5', 'p6', 'Dan', 'Osei', '11:00', null),
    ]
    state.teams = ['p1', 'p3', 'p4', 'p5', 'p6'].map((user_id) => ({ user_id, department_id: 'd-media' }))
  })

  it('counts who is late in the section’s heading and on the team’s card', async () => {
    const user = show()
    const heading = await screen.findByRole('button', { name: /^Clock-ins/ })
    await waitFor(() => expect(heading).toHaveTextContent('5 clocked in · 2 late · 1 still to arrive'))
    await open(user, /^Clock-ins/)
    const media = await screen.findByRole('listitem', { name: 'Media' })
    expect(within(media).getByText('5 in · 2 late · 1 to come')).toBeInTheDocument()
  })

  it('puts whoever is late first, the latest at the top, then the rest as they arrived', async () => {
    const user = show()
    await open(user, /^Clock-ins/)
    const list = await screen.findByRole('list', { name: 'Media: clocked in' })
    const names = within(list)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')?.textContent)
    expect(names).toEqual(['Cara Nti', 'Grace Mensah', 'Joel Skaria', 'Ben Adu', 'Dan Osei'])
  })

  it('shows a late time in red and says how late in words, and leaves the others as they were', async () => {
    const user = show()
    await open(user, /^Clock-ins/)
    const list = await screen.findByRole('list', { name: 'Media: clocked in' })
    const late = within(list).getByText('10:15')
    expect(late).toHaveClass('text-error')
    expect(within(list).getByText('1 h 15 min late')).toHaveClass('text-error')
    expect(within(list).getByText('35 min late')).toBeInTheDocument()
    // Ten minutes after the call is not late, and neither is somebody with no call time.
    expect(within(list).getByText('09:10')).not.toHaveClass('text-error')
    expect(within(list).getByText('11:00')).not.toHaveClass('text-error')
    expect(within(list).getAllByText(/ late$/)).toHaveLength(2)
  })

  it('says each person’s call time on their line, where it is known', async () => {
    const user = show()
    await open(user, /^Clock-ins/)
    const list = await screen.findByRole('list', { name: 'Media: clocked in' })
    expect(within(list).getAllByText(/^Call 09:00 · Phone at church/)).toHaveLength(4)
    expect(within(list).getAllByText(/^Phone at church/)).toHaveLength(1)
  })

  it('lists who is still to arrive above who has clocked in, not under it', async () => {
    const user = show()
    await open(user, /^Clock-ins/)
    const waiting = await screen.findByRole('list', { name: 'Media: still to arrive' })
    const arrived = screen.getByRole('list', { name: 'Media: clocked in' })
    expect(waiting.compareDocumentPosition(arrived) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has a section for each person’s arrivals over the weeks kept, shut until opened', async () => {
    const user = show()
    const section = await screen.findByRole('button', { name: /^Arrivals, person by person/ })
    expect(section).toHaveAttribute('aria-expanded', 'false')
    expect(section).toHaveTextContent('over the last 4 weeks')
    expect(screen.queryByRole('list', { name: 'Arrivals, person by person' })).toBeNull()
    await user.click(section)
    const people = await screen.findByRole('list', { name: 'Arrivals, person by person' })
    expect(within(people).getByRole('button', { name: /^Grace Mensah/ })).toHaveTextContent('1 late of 1')
    expect(within(people).getByRole('button', { name: /^Joel Skaria/ })).toHaveTextContent('On time, 1 clock-in')
  })
})
