import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AvailabilityPage } from './AvailabilityPage'

/*
 * The three-week tracker.
 *
 * What matters here is not the answering — that has not changed — but
 * which services are on the page at all, and which of them are open when
 * it is first drawn. Those are the two things the split decides.
 */

const SUNDAY = '2026-09-06'
const NEXT = '2026-09-13'
const AFTER = '2026-09-20'
const MONTHS_OUT = '2026-12-06'

const state = vi.hoisted(() => ({
  finished: new Set<string>(),
  leads: false,
  admin: false,
  overwatch: false,
  /** The teams the signed-in person is on. */
  ownTeams: ['d1'] as string[],
  /** Every table the page read. */
  read: [] as string[],
  /** Rows the page reads straight from Postgres, by table. */
  rows: {} as Record<string, unknown[]>,
  /** When each service begins, ISO — absent when nothing is planned. */
  starts: {} as Record<string, string>,
  /** Everything the page wrote, in order. */
  written: [] as { table: string; row: unknown; id?: string }[],
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1' } },
    isAdmin: state.admin,
    isOverwatch: state.overwatch,
    seesAllTeams: state.admin || state.overwatch,
    isDepartmentHead: () => state.leads,
  }),
}))

vi.mock('../lib/monthGrid', () => ({ todayIso: () => SUNDAY }))
vi.mock('../lib/useTeamStyle', () => ({ useTeamStyle: () => ({ teamStyle: 'dot' }) }))
// The pages' display preferences, at the app's own defaults.
vi.mock('../lib/appSettings', async () => {
  const { DISPLAY_DEFAULTS } = await import('../lib/display')
  return {
    useDisplay: () => DISPLAY_DEFAULTS,
    useAppSettings: () => ({ rota_window_days: 7 }),
  }
})
vi.mock('../lib/useFinishedServices', () => ({
  useFinishedServices: () => ({
    isFinished: (id: string) => state.finished.has(id),
    startsAt: (id: string) => state.starts[id] ?? null,
    hasStarted: (id: string) =>
      state.starts[id] !== undefined && Date.now() >= new Date(state.starts[id]).getTime(),
  }),
}))
vi.mock('../components/NudgeButton', () => ({ NudgeButton: () => null }))

vi.mock('../lib/queries', () => ({
  fetchServices: () =>
    Promise.resolve([
      { id: 's1', date: SUNDAY, service_type: 'English Service' },
      // Two on one morning: the case the day headings exist for.
      { id: 's1b', date: SUNDAY, service_type: 'Malayalam Service' },
      { id: 's2', date: NEXT, service_type: 'English Service' },
      { id: 's3', date: AFTER, service_type: 'English Service' },
      { id: 's4', date: MONTHS_OUT, service_type: 'Carol Service' },
    ]),
  fetchDepartments: () =>
    Promise.resolve([{ id: 'd1', name: 'Media', color: '#3b82f6', is_worship: false }]),
  fetchOwnDepartmentIds: () => Promise.resolve(state.ownTeams),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        state.read.push(table)
        const rows = Promise.resolve({ data: state.rows[table] ?? [], error: null })
        // `.in(...)` is where every read on this page ends, except the
        // change requests, which also ask for an order.
        // The church's permission changes are read whole, with no filter.
        return {
          in: () => Object.assign(rows, { order: () => rows }),
          then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => rows.then(ok, fail),
        }
      },
      insert: (row: unknown) => {
        state.written.push({ table, row })
        return Promise.resolve({ error: null })
      },
      upsert: (row: unknown) => {
        state.written.push({ table, row })
        return Promise.resolve({ error: null })
      },
      update: (row: unknown) => ({
        eq: (_column: string, id: string) => {
          state.written.push({ table, row, id })
          return Promise.resolve({ error: null })
        },
      }),
      delete: () => ({
        eq: (_column: string, id: string) => {
          state.written.push({ table, row: null, id })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AvailabilityPage />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/*
 * A day's section, found by its heading, and a service's card within it.
 * The date is rendered through `toLocaleDateString`, so it is matched
 * loosely rather than pinned to whichever locale the runner is in.
 */
/*
 * A date can head two sections now: the next service sits alone on top,
 * and a second service that same morning is filed under Upcoming with its
 * own copy of the date. So a day is every section that date heads, and a
 * card is looked for across all of them.
 */
const daysFor = (day: string | RegExp) =>
  screen.getAllByRole('heading', { name: day, level: 2 }).map((h) => h.closest('section')!)

/** One service on a day, by the name on its own heading. */
const cardFor = (day: string | RegExp, service = 'English Service') => {
  for (const section of daysFor(day)) {
    const heading = within(section).queryByRole('heading', { name: service, level: 2 })
    if (heading) return heading.closest('section')!
  }
  throw new Error(`No ${service} card on ${String(day)}`)
}

const teamsOf = (card: HTMLElement) => card.querySelector('ul[id^="availability-teams-"]')!

beforeEach(() => {
  state.finished = new Set()
  state.leads = false
  state.admin = false
  state.overwatch = false
  state.ownTeams = ['d1']
  state.read = []
  state.rows = {}
  state.starts = {}
  state.written = []
})

/*
 * The register.
 *
 * Marking somebody present is a fact about a morning: before the team is
 * called in nobody has turned up, and nobody has failed to. The buttons
 * used to appear the moment somebody said yes — three weeks early, on a
 * service nobody had been to, which makes "no-show" a thing you can
 * record about next month.
 */
describe('present and no-show', () => {
  /** A head, looking at a team where one person has said yes. */
  const asHead = (callTime: string | null) => {
    state.leads = true
    state.rows = {
      department_members: [
        {
          id: 'm1',
          department_id: 'd1',
          user_id: 'u2',
          member_type: 'core',
          created_at: '2026-01-01T00:00:00Z',
          profiles: {
            id: 'u2',
            first_name: 'Joel',
            last_name: 'Skaria',
            email: 'joel@rehoboth.org',
            phone: null,
            avatar_url: null,
          },
        },
      ],
      availability: [
        {
          id: 'a1',
          service_id: 's1',
          department_id: 'd1',
          user_id: 'u2',
          status: 'available',
          note: null,
          attended: null,
          updated_at: '2026-09-01T00:00:00Z',
        },
      ],
      department_call_times: callTime
        ? [{ department_id: 'd1', on_date: SUNDAY, call_time: callTime }]
        : [],
    }
  }

  /** Stand at a wall-clock time on the morning of the service. */
  const standAt = (clock: string) => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(`${SUNDAY}T${clock}`))
  }

  /** Today's card, once the team's answers have arrived. The same member
   *  is listed under every service, so every check is scoped to one. */
  const todayCard = async () => {
    await screen.findAllByText('Joel Skaria')
    return cardFor(/Today/) as HTMLElement
  }

  afterEach(() => vi.useRealTimers())

  it('offers nothing to mark before the team is called in', async () => {
    asHead('09:00')
    standAt('06:30')
    show()
    const today = await todayCard()

    expect(within(today).queryByRole('button', { name: 'Present' })).toBeNull()
    expect(within(today).queryByRole('button', { name: 'No-show' })).toBeNull()
  })

  it('says when it will open rather than leaving a gap', async () => {
    asHead('09:00')
    standAt('06:30')
    show()
    const today = await todayCard()

    // Once for the team, not once per person: ten names each carrying the
    // same sentence is a wall.
    expect(within(today).getByText(/marked from 09:00/)).toBeInTheDocument()
  })

  it('offers them from the call time onwards', async () => {
    asHead('09:00')
    standAt('09:01')
    show()
    const today = await todayCard()

    expect(within(today).getByRole('button', { name: 'Present' })).toBeInTheDocument()
    expect(within(today).getByRole('button', { name: 'No-show' })).toBeInTheDocument()
    expect(within(today).queryByText(/marked from/)).toBeNull()
  })

  it('keeps them afterwards, because the register is filled in late', async () => {
    // Long after the service. Correcting the record is the common case, so
    // the window opens and stays open rather than closing at the end.
    asHead('09:00')
    standAt('22:00')
    show()
    const today = await todayCard()

    expect(within(today).getByRole('button', { name: 'Present' })).toBeInTheDocument()
  })

  it('falls back to seven o\u2019clock when the team has set no call time', async () => {
    asHead(null)
    standAt('06:30')
    show()
    const today = await todayCard()

    expect(within(today).queryByRole('button', { name: 'Present' })).toBeNull()
    expect(within(today).getByText(/marked from 07:00/)).toBeInTheDocument()
  })

  it('opens at that seven o\u2019clock too', async () => {
    asHead(null)
    standAt('07:30')
    show()
    const today = await todayCard()

    expect(within(today).getByRole('button', { name: 'Present' })).toBeInTheDocument()
  })

  it('says nothing about a team where nobody has said yes', async () => {
    asHead('09:00')
    state.rows.availability = [
      {
        id: 'a1',
        service_id: 's1',
        department_id: 'd1',
        user_id: 'u2',
        status: 'unavailable',
        note: null,
        attended: null,
        updated_at: '2026-09-01T00:00:00Z',
      },
    ]
    standAt('06:30')
    show()
    const today = await todayCard()

    expect(within(today).queryByText(/marked from/)).toBeNull()
  })
})

/*
 * The deadline on an answer.
 *
 * "Can you serve on Sunday?" is asked in advance so a rota can be built
 * from the answers. It stops being a question the moment the doors open:
 * somebody changing their yes to a no from the car park is not answering,
 * they are telling the head something — and the head has already built
 * the morning around it.
 */
describe('answering closes the night before', () => {
  /** The three answer buttons. `hidden` reaches into a folded card. */
  const answerGroup = (card: HTMLElement, hidden = false) =>
    within(card).queryByRole('group', { name: /Can you serve/, hidden })

  const standAt = (iso: string) => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(iso))
  }

  afterEach(() => vi.useRealTimers())

  /*
   * SUNDAY is 2026-09-06, so answers for it are due by 23:59 on
   * Saturday the 5th — 22:59Z, British Summer Time being in force.
   */
  it('takes answers right up to the night before', async () => {
    standAt('2026-09-05T22:58:00Z')
    show()
    await screen.findAllByRole('heading', { name: /Today/ })

    expect(answerGroup(cardFor(/Today/))).toBeInTheDocument()
  })

  it('stops taking them once that moment has gone', async () => {
    standAt('2026-09-05T22:59:00Z')
    show()
    await screen.findAllByRole('heading', { name: /Today/ })

    expect(answerGroup(cardFor(/Today/))).toBeNull()
  })

  /*
   * The whole point of the change: a no at 09:59 for a service at 10:00
   * used to be in time, which is not a deadline — it is the moment the
   * head is already in the hall counting heads.
   */
  it('is long shut by the morning itself', async () => {
    standAt(`${SUNDAY}T09:59:00`)
    show()
    await screen.findAllByRole('heading', { name: /Today/ })

    expect(answerGroup(cardFor(/Today/))).toBeNull()
  })

  it('says so, and offers the way through it', async () => {
    standAt(`${SUNDAY}T09:59:00`)
    show()
    await screen.findAllByRole('heading', { name: /Today/ })

    const today = cardFor(/Today/) as HTMLElement
    expect(within(today).getByText(/Answers have closed/)).toBeInTheDocument()
    // The door is shut, not walled up: a late change is asked for.
    expect(within(today).getByRole('button', { name: 'Ask to change it' })).toBeInTheDocument()
  })

  /*
   * The whole shape of the late change: the member asks, and nothing about
   * their answer moves until a head says yes. What is written here is a
   * request — never the availability row, which by now the database
   * refuses to take from them anyway.
   */
  it('sends a request rather than changing the answer', async () => {
    standAt(`${SUNDAY}T09:59:00`)
    show()
    await screen.findAllByRole('heading', { name: /Today/ })
    const today = cardFor(/Today/) as HTMLElement

    await userEvent.click(within(today).getByRole('button', { name: 'Ask to change it' }))
    await userEvent.click(within(today).getByRole('radio', { name: /No, I can't make it/ }))
    await userEvent.type(
      within(today).getByLabelText('Why you need to change your answer'),
      'My daughter is ill',
    )
    await userEvent.click(within(today).getByRole('button', { name: 'Send the request' }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0].table).toBe('availability_change_requests')
    expect(state.written[0].row).toMatchObject({
      service_id: 's1',
      department_id: 'd1',
      requested_status: 'unavailable',
      reason: 'My daughter is ill',
    })
  })

  it('shows the head the asks waiting on them, and approves one', async () => {
    state.leads = true
    state.rows.availability_change_requests = [
      {
        id: 'r1',
        user_id: 'u2',
        service_id: 's1',
        department_id: 'd1',
        requested_status: 'unavailable',
        reason: 'Car will not start',
        status: 'pending',
        decided_by: null,
        decided_at: null,
        decision_note: null,
        created_at: `${SUNDAY}T07:00:00Z`,
        asker: { id: 'u2', first_name: 'Blessy', last_name: 'Jijin' },
      },
    ]
    standAt(`${SUNDAY}T09:59:00`)
    show()
    await screen.findAllByRole('heading', { name: /Today/ })
    const today = cardFor(/Today/) as HTMLElement

    expect(within(today).getByText(/Blessy Jijin/)).toBeInTheDocument()
    expect(within(today).getByText(/Car will not start/)).toBeInTheDocument()

    await userEvent.click(within(today).getAllByRole('button', { name: 'Approve' })[0])

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0].id).toBe('r1')
    expect(state.written[0].row).toMatchObject({ status: 'approved' })
  })

  it('counts down to it, because a deadline nobody can see surprises people', async () => {
    // Half past nine on the Saturday evening: an hour and a half left.
    standAt('2026-09-05T21:29:00Z')
    show()
    await screen.findAllByRole('heading', { name: /Today/ })

    // The clock is drawn as separate elements — hours, colon, minutes —
    // so the sentence it reads out is what to check.
    const clock = within(cardFor(/Today/) as HTMLElement).getByLabelText(/left to answer/)
    // A second or two passes while the page renders, so the minute is
    // what is worth pinning rather than the second.
    expect(clock).toHaveAccessibleName(/^01:(29|30):\d{2} left to answer/)
  })

  /*
   * A clock says how long is left and never says when that is, so anybody
   * planning their Saturday around it has to do the arithmetic themselves
   * and then trust it.
   */
  it('names the moment it runs out, not only the time left', async () => {
    standAt('2026-09-05T21:29:00Z')
    show()
    await screen.findAllByRole('heading', { name: /Today/ })

    const clock = within(cardFor(/Today/) as HTMLElement).getByLabelText(/left to answer/)
    expect(clock).toHaveAccessibleName(/closes 10:59pm/)
  })

  it('drops the countdown once the deadline has gone', async () => {
    state.starts = { s1: `${SUNDAY}T10:00:00` }
    standAt(`${SUNDAY}T10:01:00`)
    show()
    await screen.findAllByRole('heading', { name: /Today/ })

    expect(within(cardFor(/Today/) as HTMLElement).queryByText(/left to answer/)).toBeNull()
  })

  /*
   * The quiet half of the old bug. The deadline used to come off the
   * running order, so a service nobody had planned had no start to have
   * passed and took answers for ever. It comes off the service's date
   * now, which every service has from the moment it exists.
   */
  it('closes a service nobody has planned yet, like any other', async () => {
    state.starts = {}
    standAt(`${SUNDAY}T09:00:00`)
    show()
    await screen.findAllByRole('heading', { name: /Today/ })

    expect(answerGroup(cardFor(/Today/))).toBeNull()
  })

  it('closes only the service whose night has gone, not the ones after it', async () => {
    state.starts = { s1: `${SUNDAY}T10:00:00`, s2: `${NEXT}T10:00:00` }
    standAt(`${SUNDAY}T10:01:00`)
    show()
    await screen.findAllByRole('heading', { name: /Today/ })

    expect(answerGroup(cardFor(/Today/))).toBeNull()
    // Folded, being further out — but the buttons are still in it.
    expect(answerGroup(cardFor(/September 13/), true)).toBeInTheDocument()
  })
})

describe('the availability tracker over three weeks', () => {
  it('reaches three Sundays out, not just this week', async () => {
    // The window used to be the rota's seven days, so the answer somebody
    // already knew about the third Sunday had nowhere to go.
    show()
    await screen.findAllByRole('heading', { name: /Today/ })
    expect(screen.getByText(/September 13/)).toBeInTheDocument()
    expect(screen.getByText(/September 20/)).toBeInTheDocument()
  })

  it('still stops at three weeks — a Carol service in December is not this', async () => {
    show()
    await screen.findAllByRole('heading', { name: /Today/ })
    expect(screen.queryByText(/December/)).not.toBeInTheDocument()
  })

  it('opens the soonest service and folds the rest', async () => {
    const user = userEvent.setup()
    show()
    await screen.findAllByRole('heading', { name: /Today/ })
    // Upcoming is folded too; opened, its cards are still shut.
    await user.click(screen.getByRole('button', { name: /Upcoming services/ }))
    expect(teamsOf(cardFor(/Today/))).not.toHaveAttribute('hidden')
    expect(teamsOf(cardFor(/September 13/))).toHaveAttribute('hidden')
    expect(teamsOf(cardFor(/September 20/))).toHaveAttribute('hidden')
  })

  it('files today, the next service day, and the rest under their own sections', async () => {
    show()
    await screen.findAllByRole('heading', { name: /Today/ })
    const todays = screen.getByRole('region', { name: 'Today’s services' })
    const next = screen.getByRole('region', { name: 'Next service' })
    const upcoming = screen.getByRole('region', { name: 'Upcoming services' })
    expect(todays).toContainElement(cardFor(/Today/, 'English Service'))
    expect(within(next).getByText(/September 13/)).toBeInTheDocument()
    expect(within(upcoming).getByText(/September 20/)).toBeInTheDocument()
    expect(upcoming).not.toContainElement(cardFor(/Today/, 'English Service'))
  })

  /*
   * One card open, one day together. The second service that morning was
   * once filed under Upcoming with its own copy of the date, so a Sunday
   * appeared twice. It stays under the day's one heading now — folded, so
   * only one long card of teams is open at the top.
   */
  it('keeps the whole next morning together, with only its first service open', async () => {
    show()
    await screen.findAllByRole('heading', { name: /Today/ })
    const later = screen.getByRole('region', { name: 'Upcoming services' })

    const english = cardFor(/Today/, 'English Service')
    const malayalam = cardFor(/Today/, 'Malayalam Service')
    expect(teamsOf(english)).not.toHaveAttribute('hidden')
    expect(teamsOf(malayalam)).toHaveAttribute('hidden')
    expect(later).not.toContainElement(english)
    expect(later).not.toContainElement(malayalam)
    // One heading for the day, not two.
    expect(screen.getAllByRole('heading', { name: /^Today ·/ })).toHaveLength(1)
  })

  /*
   * Which of two services on one morning is "next" is the running order's
   * to say. By name, English would always win, however early the
   * Malayalam service starts.
   */
  it('lets the start times decide which service that morning opens', async () => {
    state.rows.service_sessions = [
      { service_id: 's1b', start_time: `${SUNDAY}T08:00:00` },
      { service_id: 's1', start_time: `${SUNDAY}T10:30:00` },
    ]
    show()
    await screen.findAllByRole('heading', { name: /Today/ })
    await waitFor(() =>
      expect(teamsOf(cardFor(/Today/, 'Malayalam Service'))).not.toHaveAttribute('hidden'),
    )
    expect(teamsOf(cardFor(/Today/, 'English Service'))).toHaveAttribute('hidden')
  })

  it('opens a folded service on a touch', async () => {
    const user = show()
    await screen.findAllByRole('heading', { name: /Today/ })
    const later = cardFor(/September 13/)
    expect(teamsOf(later)).toHaveAttribute('hidden')
    await user.click(within(later).getByRole('button', { expanded: false }))
    await waitFor(() => expect(teamsOf(later)).not.toHaveAttribute('hidden'))
  })

  it('closes the open one on a touch, for somebody who wants it out of the way', async () => {
    const user = show()
    await screen.findAllByRole('heading', { name: /Today/ })
    const soonest = cardFor(/Today/)
    expect(teamsOf(soonest)).not.toHaveAttribute('hidden')
    await user.click(within(soonest).getByRole('button', { expanded: true }))
    await waitFor(() => expect(teamsOf(soonest)).toHaveAttribute('hidden'))
  })

  it('moves on to the next day once the whole of today has finished', async () => {
    // Both of this morning's services are a record now, so they leave the
    // page proper altogether and the 13th becomes the question.
    state.finished = new Set(['s1', 's1b'])
    show()
    await screen.findByRole('heading', { name: /September 13/ })
    expect(teamsOf(cardFor(/September 13/))).not.toHaveAttribute('hidden')
    expect(screen.queryByRole('heading', { name: /Today/ })).toBeNull()
  })

  describe('what is over', () => {
    it('files a finished service under Finished rather than on the page', async () => {
      state.finished = new Set(['s1', 's1b'])
      show()
      // Folded away: the day it was on is no longer reachable on the page,
      // which is what "out of the way" has to mean to be worth doing.
      expect(await screen.findByRole('button', { name: /Finished/ })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /Today/ })).toBeNull()
      expect(screen.queryByRole('heading', { name: 'Malayalam Service' })).toBeNull()
    })

    it('opens on a press, because last Sunday is still a real question', async () => {
      state.finished = new Set(['s1', 's1b'])
      const user = show()
      await user.click(await screen.findByRole('button', { name: /Finished/ }))
      await waitFor(() => expect(screen.getAllByRole('heading', { name: /Today/ })[0]).toBeInTheDocument())
      expect(screen.getByRole('heading', { name: 'Malayalam Service' })).toBeInTheDocument()
    })

    it('says so plainly when every service in the window is over', async () => {
      state.finished = new Set(['s1', 's1b', 's2', 's3', 's4'])
      show()
      expect(await screen.findByText(/Every service in the window is over/)).toBeInTheDocument()
    })
  })
})

/*
 * A note with the answer.
 *
 * "Yes" is true and still leaves the head guessing: somebody can serve
 * and not be there until half nine, or serve but not lift. That sentence
 * has been arriving by WhatsApp — reaching whoever happened to be looking
 * at their phone — while the tracker, which is where the morning actually
 * gets planned, said a confident "Yes".
 */
describe('the note beside an answer', () => {
  const standAt = (iso: string) => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(iso))
  }
  afterEach(() => vi.useRealTimers())

  const myAnswer = (over: Record<string, unknown> = {}) => ({
    id: 'a1',
    service_id: 's1',
    department_id: 'd1',
    user_id: 'u1',
    status: 'available',
    note: null,
    attended: null,
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  })

  /*
   * The card for today's service, which opens itself. Standing on the
   * Friday keeps its answers open: they close at 23:59 on the Saturday.
   */
  const openCard = async () => {
    await screen.findAllByRole('heading', { level: 2 })
    return cardFor(/Today/, 'English Service') as HTMLElement
  }
  const BEFORE_DEADLINE = '2026-09-04T09:00:00Z'
  const AFTER_DEADLINE = '2026-09-06T09:00:00Z'

  it('offers a note box, marked optional, once an answer has been given', async () => {
    state.rows.availability = [myAnswer()]
    standAt(BEFORE_DEADLINE)
    show()
    const card = await openCard()
    const box = within(card).getByLabelText('A note with your answer')
    expect(box).toHaveAttribute('placeholder', expect.stringContaining('8.30am'))
    expect(within(card).getByText('(optional)')).toBeInTheDocument()
    // Nothing to save until something is typed.
    expect(within(card).queryByRole('button', { name: 'Save note' })).toBeNull()
  })

  /*
   * A note is part of an answer, not a thing on its own: there is nothing
   * for it to hang off until somebody has said yes or no.
   */
  it('offers nothing to annotate before an answer is given', async () => {
    standAt(BEFORE_DEADLINE)
    show()
    expect(within(await openCard()).queryByLabelText('A note with your answer')).toBeNull()
  })

  it('writes the note onto the answer that is already there', async () => {
    state.rows.availability = [myAnswer()]
    standAt(BEFORE_DEADLINE)
    const user = show()
    const card = await openCard()

    await user.type(
      within(card).getByLabelText('A note with your answer'),
      'There, but not until 9.30',
    )
    await user.click(screen.getByRole('button', { name: 'Save note' }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0]).toMatchObject({ table: 'availability', id: 'a1' })
    expect(state.written[0].row).toMatchObject({ note: 'There, but not until 9.30' })
  })

  it('shows a note that is already there, and offers to change it', async () => {
    state.rows.availability = [myAnswer({ note: 'There, but not until 9.30' })]
    standAt(BEFORE_DEADLINE)
    show()
    const card = await openCard()

    expect(within(card).getByText(/There, but not until 9.30/)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Edit note' })).toBeInTheDocument()
  })

  // Clearing it is saving an empty one; null is how the database spells
  // "nothing said", and an empty string would read as a note of no words.
  it('clears the note rather than storing an empty one', async () => {
    state.rows.availability = [myAnswer({ note: 'There, but not until 9.30' })]
    standAt(BEFORE_DEADLINE)
    const user = show()
    const card = await openCard()

    await user.click(within(card).getByRole('button', { name: 'Edit note' }))
    await user.clear(screen.getByLabelText('A note with your answer'))
    await user.click(screen.getByRole('button', { name: 'Save note' }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0].row).toMatchObject({ note: null })
  })

  /*
   * The window that closes on the answer closes on the note with it —
   * but the note stays readable, because after the deadline the head is
   * exactly who needs it.
   */
  it('stops being editable when answers close, and stays readable', async () => {
    state.rows.availability = [myAnswer({ note: 'There, but not until 9.30' })]
    standAt(AFTER_DEADLINE)
    show()
    const today = await openCard()

    expect(within(today).getByText(/There, but not until 9.30/)).toBeInTheDocument()
    expect(within(today).queryByRole('button', { name: 'Edit note' })).toBeNull()
  })

  // The whole point: the head plans the morning from this page.
  it('shows the note to whoever runs the team', async () => {
    state.leads = true
    state.rows.availability = [
      myAnswer({ id: 'a2', user_id: 'u2', note: 'There, but not until 9.30' }),
    ]
    state.rows.department_members = [
      {
        id: 'm2',
        department_id: 'd1',
        user_id: 'u2',
        member_type: 'core',
        created_at: '2026-01-01T00:00:00Z',
        profiles: {
          id: 'u2',
          first_name: 'Grace',
          last_name: 'Mensah',
          email: 'grace@rehoboth.org',
          phone: null,
          avatar_url: null,
        },
      },
    ]
    standAt(BEFORE_DEADLINE)
    show()
    await screen.findAllByText('Grace Mensah')
    const card = cardFor(/Today/, 'English Service') as HTMLElement

    expect(within(card).getByText(/There, but not until 9.30/)).toBeInTheDocument()
  })
})

/*
 * The log behind an answer (0145).
 *
 * An Admin planning a rota needs to know that somebody said yes on
 * Monday and no at 23:40 on Saturday — which the answer itself, being
 * overwritten each time, cannot say. Who may read it is the church's to
 * set; out of the box the Owner and Admins, and nobody else.
 */
describe('the history of somebody’s answer', () => {
  const member = {
    id: 'm2',
    department_id: 'd1',
    user_id: 'u2',
    member_type: 'core',
    created_at: '2026-01-01T00:00:00Z',
    profiles: { id: 'u2', first_name: 'Joel', last_name: 'Skaria', avatar_url: null },
  }
  const line = (over: Record<string, unknown>) => ({
    id: 'h1',
    user_id: 'u2',
    service_id: 's1',
    department_id: 'd1',
    kind: 'answered',
    status: 'available',
    previous_status: null,
    note: null,
    changed_by: 'u2',
    by_request: false,
    after_close: false,
    changed_at: '2026-09-01T10:00:00Z',
    changer: { first_name: 'Joel', last_name: 'Skaria' },
    ...over,
  })

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-04T09:00:00Z'))
    state.rows = {
      department_members: [member],
      availability: [
        {
          id: 'a2',
          service_id: 's1',
          department_id: 'd1',
          user_id: 'u2',
          status: 'unavailable',
          note: null,
          attended: null,
          updated_at: '2026-09-05T23:40:00Z',
        },
      ],
      availability_history: [
        line({}),
        line({
          id: 'h2',
          kind: 'changed',
          status: 'unavailable',
          previous_status: 'available',
          changed_by: 'admin',
          changer: { first_name: 'Grace', last_name: 'Mensah' },
          after_close: true,
          changed_at: '2026-09-05T23:40:00Z',
        }),
      ],
    }
  })
  afterEach(() => vi.useRealTimers())

  it('lets an Admin open it under the person’s name: what, when, and who', async () => {
    state.admin = true
    show()
    await screen.findAllByText('Joel Skaria')
    const card = cardFor(/Today/) as HTMLElement
    await userEvent.click(within(card).getByText(/Team responses/))
    await userEvent.click(await within(card).findByRole('button', { name: 'History · 2' }))

    const log = within(card).getByRole('list', { name: 'History of Joel Skaria’s answer' })
    const lines = within(log).getAllByRole('listitem')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveTextContent('Answered Yes')
    expect(lines[1]).toHaveTextContent('Changed to No')
    expect(lines[1]).toHaveTextContent('was Yes')
    expect(lines[1]).toHaveTextContent('by Grace Mensah')
    expect(lines[1]).toHaveTextContent('After answers closed')
    expect(within(lines[1]).getByText((_, el) => el?.tagName === 'TIME')).toHaveAttribute(
      'datetime',
      '2026-09-05T23:40:00Z',
    )
  })

  it('shows Overwatch on no team the team’s answers and their history, and asks it nothing', async () => {
    state.overwatch = true
    state.ownTeams = []
    show()
    await screen.findAllByText('Joel Skaria')
    const card = cardFor(/Today/) as HTMLElement
    // Not a member of Media, so no Yes / Maybe / No of its own.
    expect(within(card).queryByRole('group', { name: /Can you serve/ })).not.toBeInTheDocument()
    await userEvent.click(within(card).getByText(/Team responses/))
    expect(within(card).getByText(/Team responses/)).toHaveTextContent('Team responses (1/1)')
    await userEvent.click(await within(card).findByRole('button', { name: 'History · 2' }))
    expect(within(card).getByRole('list', { name: 'History of Joel Skaria’s answer' })).toBeInTheDocument()
    // Reading is all it does: nobody's answer can be changed from here.
    expect(within(card).queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('still asks Overwatch about a team it is on', async () => {
    state.overwatch = true
    show()
    await screen.findAllByText('Joel Skaria')
    const card = cardFor(/Today/) as HTMLElement
    expect(within(card).getByRole('group', { name: /Can you serve/ })).toBeInTheDocument()
  })

  it('is closed to a Head by their own team’s rule, and not even asked for (0162)', async () => {
    state.leads = true
    state.rows.department_permissions = [{ department_id: 'd1', role_key: 'head', capability: 'avail.history', reach: 'none' }]
    show()
    await screen.findAllByText('Joel Skaria')
    expect(screen.queryByRole('button', { name: /^History/ })).toBeNull()
    expect(state.read).not.toContain('availability_history')
  })

  it('opens to a Head out of the box, for their own team (0162)', async () => {
    state.leads = true
    show()
    await screen.findAllByText('Joel Skaria')
    const card = cardFor(/Today/) as HTMLElement
    await userEvent.click(within(card).getByText(/Team responses/))
    expect(await within(card).findByRole('button', { name: 'History · 2' })).toBeInTheDocument()
  })

  it('closes to a Head again when the church says so', async () => {
    state.leads = true
    state.rows.role_permissions = [{ role_key: 'head', capability: 'avail.history', reach: 'none' }]
    show()
    await screen.findAllByText('Joel Skaria')
    expect(screen.queryByRole('button', { name: /^History/ })).toBeNull()
    expect(state.read).not.toContain('availability_history')
  })

  it('asks before changing an answer already given, and says a No takes you off the rota', async () => {
    state.rows = {
      department_members: [{ id: 'm1', department_id: 'd1', user_id: 'u1', member_type: 'core', created_at: 'x', profiles: { id: 'u1', first_name: 'Me', last_name: 'Self', avatar_url: null } }],
      availability: [{ id: 'mine', service_id: 's1', department_id: 'd1', user_id: 'u1', status: 'available', note: null, attended: null, updated_at: 'x' }],
    }
    show()
    const group = await screen.findAllByRole('group', { name: /Can you serve at English Service for Media/ })
    await userEvent.click(within(group[0]).getByRole('button', { name: 'No' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent("Change your answer to “Can't make it”?")
    expect(dialog).toHaveTextContent('takes you off any role')
    expect(state.written).toEqual([])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep “Available”' }))
    expect(state.written).toEqual([])
    await userEvent.click(within(group[0]).getByRole('button', { name: 'Maybe' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Change answer' }))
    await waitFor(() => expect(state.written).toContainEqual(expect.objectContaining({ table: 'availability', row: expect.objectContaining({ status: 'tentative' }) })))
  })

  it('lets a Head change an answer already given, as a change and not a re-add (0163)', async () => {
    state.leads = true
    show()
    await screen.findAllByText('Joel Skaria')
    const card = cardFor(/Today/) as HTMLElement
    await userEvent.click(within(card).getByText(/Team responses/))
    const pick = within(card).getByRole('combobox', { name: 'Availability for Joel Skaria' })
    await userEvent.click(pick)
    // Taking the answer away is the narrower "add or remove" right, which a Head is not given by default.
    expect(screen.queryByRole('option', { name: 'No answer' })).toBeNull()
    await userEvent.click(await screen.findByRole('option', { name: /Available|Yes/ }))
    await waitFor(() => expect(state.written).toContainEqual({ table: 'availability', row: { status: 'available' }, id: 'a2' }))
  })

  it('shows a Head no dropdown for somebody who has not answered, unless the church lets them answer for others', async () => {
    state.leads = true
    state.rows.availability = []
    show()
    await screen.findAllByText('Joel Skaria')
    const card = cardFor(/Today/) as HTMLElement
    await userEvent.click(within(card).getByText(/Team responses/))
    expect(within(card).queryByRole('combobox', { name: 'Availability for Joel Skaria' })).toBeNull()
  })

  it('shows somebody their own changes once the church allows their own', async () => {
    state.rows.role_permissions = [{ role_key: 'member', capability: 'avail.history', reach: 'own' }]
    state.rows.availability = [
      { id: 'a1', service_id: 's1', department_id: 'd1', user_id: 'u1', status: 'available', note: null, attended: null, updated_at: '2026-09-01T00:00:00Z' },
    ]
    state.rows.availability_history = [line({ user_id: 'u1', changed_by: 'u1' })]
    show()
    const card = await waitFor(() => cardFor(/Today/) as HTMLElement)
    await userEvent.click(await within(card).findByRole('button', { name: 'Your changes · 1' }))
    expect(within(card).getByRole('list', { name: 'History of your answer' })).toHaveTextContent('Answered Yes')
  })

  it('is not offered to somebody answering for themselves out of the box', async () => {
    state.rows.availability_history = [line({ user_id: 'u1', changed_by: 'u1' })]
    show()
    await screen.findAllByRole('heading', { level: 2 })
    expect(screen.queryByRole('button', { name: /Your changes/ })).toBeNull()
    expect(state.read).not.toContain('availability_history')
  })
})

describe('guests on a team', () => {
  const core = {
    id: 'm2',
    department_id: 'd1',
    user_id: 'u2',
    member_type: 'core',
    created_at: '2026-01-01T00:00:00Z',
    profiles: { id: 'u2', first_name: 'Joel', last_name: 'Skaria', avatar_url: null },
  }
  const accountGuest = {
    ...core,
    id: 'm3',
    user_id: 'u3',
    member_type: 'guest',
    profiles: { id: 'u3', first_name: 'Ann', last_name: 'Varghese', avatar_url: null },
  }
  const rollGuest = { id: 'dg1', department_id: 'd1', guest_id: 'g1', member_type: 'guest', guests: { name: 'Steve Tebb' } }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-04T09:00:00Z'))
    state.admin = true
    state.rows = { department_members: [core, accountGuest], department_guests: [rollGuest], availability: [] }
  })
  afterEach(() => vi.useRealTimers())

  const openResponses = async () => {
    show()
    await screen.findAllByText('Joel Skaria')
    const card = cardFor(/Today/) as HTMLElement
    await userEvent.click(within(card).getByText(/Team responses/))
    return card
  }

  it('lists every guest, answered or not, and somebody with no account too', async () => {
    const card = await openResponses()
    expect(within(card).getByText(/Team responses/)).toHaveTextContent('Team responses (0/1) + 2 guests')
    expect(within(card).getByText('Ann Varghese')).toBeInTheDocument()
    expect(within(card).getByText('Steve Tebb')).toBeInTheDocument()
    expect(within(card).getByText('no account')).toBeInTheDocument()
  })

  it('answers for a guest with no account, into their own answers', async () => {
    const card = await openResponses()
    await userEvent.click(within(card).getByRole('combobox', { name: 'Availability for Steve Tebb' }))
    await userEvent.click(await screen.findByRole('option', { name: /Yes/ }))
    await waitFor(() =>
      expect(state.written).toContainEqual({
        table: 'guest_availability',
        row: { guest_id: 'g1', service_id: 's1', department_id: 'd1', status: 'available' },
      }),
    )
    expect(state.written.some((w) => w.table === 'availability')).toBe(false)
  })

  it('shows and changes the answer already given for them, with its history', async () => {
    state.rows.guest_availability = [
      { id: 'ga1', guest_id: 'g1', service_id: 's1', department_id: 'd1', status: 'tentative', note: null, updated_at: '2026-09-03T10:00:00Z' },
    ]
    state.rows.guest_availability_history = [
      {
        id: 'gh1', guest_id: 'g1', service_id: 's1', department_id: 'd1', kind: 'answered', status: 'tentative',
        previous_status: null, note: null, changed_by: 'h', after_close: false, changed_at: '2026-09-03T10:00:00Z',
        changer: { first_name: 'Jobin', last_name: 'K' },
      },
    ]
    const card = await openResponses()
    const pick = within(card).getByRole('combobox', { name: 'Availability for Steve Tebb' })
    expect(pick).toHaveTextContent('Maybe')
    await userEvent.click(await within(card).findByRole('button', { name: 'History · 1' }))
    expect(within(card).getByRole('list', { name: 'History of Steve Tebb’s answer' })).toHaveTextContent('by Jobin K')
    await userEvent.click(pick)
    await userEvent.click(await screen.findByRole('option', { name: 'No' }))
    await waitFor(() =>
      expect(state.written).toContainEqual({ table: 'guest_availability', row: { status: 'unavailable' }, id: 'ga1' }),
    )
  })
})
