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
  /** Rows the page reads straight from Postgres, by table. */
  rows: {} as Record<string, unknown[]>,
  /** When each service begins, ISO — absent when nothing is planned. */
  starts: {} as Record<string, string>,
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1' } },
    isAdmin: false,
    isDepartmentHead: () => state.leads,
  }),
}))

vi.mock('../lib/monthGrid', () => ({ todayIso: () => SUNDAY }))
vi.mock('../lib/useTeamStyle', () => ({ useTeamStyle: () => ({ teamStyle: 'dot' }) }))
vi.mock('../lib/appSettings', () => ({ useAppSettings: () => ({ rota_window_days: 7 }) }))
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
  fetchOwnDepartmentIds: () => Promise.resolve(['d1']),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: () => Promise.resolve({ data: state.rows[table] ?? [], error: null }),
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
const dayFor = (day: string | RegExp) =>
  screen.getByRole('heading', { name: day, level: 2 }).closest('section')!

/** One service inside a day, by the name on its own heading. */
const cardFor = (day: string | RegExp, service = 'English Service') =>
  within(dayFor(day)).getByRole('heading', { name: service, level: 2 }).closest('section')!

const teamsOf = (card: HTMLElement) => card.querySelector('ul[id^="availability-teams-"]')!

beforeEach(() => {
  state.finished = new Set()
  state.leads = false
  state.rows = {}
  state.starts = {}
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
    await screen.findByRole('heading', { name: /Today/ })

    expect(answerGroup(cardFor(/Today/))).toBeInTheDocument()
  })

  it('stops taking them once that moment has gone', async () => {
    standAt('2026-09-05T22:59:00Z')
    show()
    await screen.findByRole('heading', { name: /Today/ })

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
    await screen.findByRole('heading', { name: /Today/ })

    expect(answerGroup(cardFor(/Today/))).toBeNull()
  })

  it('says why, and who to ask', async () => {
    standAt(`${SUNDAY}T09:59:00`)
    show()
    await screen.findByRole('heading', { name: /Today/ })

    const today = cardFor(/Today/) as HTMLElement
    expect(within(today).getByText(/Answers closed the night before/)).toBeInTheDocument()
    // A change of plan after this is a conversation, not a button.
    expect(within(today).getByText(/team head or an Admin/)).toBeInTheDocument()
  })

  it('counts down to it, because a deadline nobody can see surprises people', async () => {
    // Half past nine on the Saturday evening: an hour and a half left.
    standAt('2026-09-05T21:29:00Z')
    show()
    await screen.findByRole('heading', { name: /Today/ })

    // The clock is drawn as separate elements — hours, colon, minutes —
    // so the sentence it reads out is what to check.
    const clock = within(cardFor(/Today/) as HTMLElement).getByLabelText(/left to answer/)
    // A second or two passes while the page renders, so the minute is
    // what is worth pinning rather than the second.
    expect(clock).toHaveAccessibleName(/^01:(29|30):\d{2} left to answer$/)
  })

  it('drops the countdown once the deadline has gone', async () => {
    state.starts = { s1: `${SUNDAY}T10:00:00` }
    standAt(`${SUNDAY}T10:01:00`)
    show()
    await screen.findByRole('heading', { name: /Today/ })

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
    await screen.findByRole('heading', { name: /Today/ })

    expect(answerGroup(cardFor(/Today/))).toBeNull()
  })

  it('closes only the service whose night has gone, not the ones after it', async () => {
    state.starts = { s1: `${SUNDAY}T10:00:00`, s2: `${NEXT}T10:00:00` }
    standAt(`${SUNDAY}T10:01:00`)
    show()
    await screen.findByRole('heading', { name: /Today/ })

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
    await screen.findByRole('heading', { name: /Today/ })
    expect(screen.getByText(/September 13/)).toBeInTheDocument()
    expect(screen.getByText(/September 20/)).toBeInTheDocument()
  })

  it('still stops at three weeks — a Carol service in December is not this', async () => {
    show()
    await screen.findByRole('heading', { name: /Today/ })
    expect(screen.queryByText(/December/)).not.toBeInTheDocument()
  })

  it('opens the soonest service and folds the rest', async () => {
    show()
    await screen.findByRole('heading', { name: /Today/ })
    expect(teamsOf(cardFor(/Today/))).not.toHaveAttribute('hidden')
    expect(teamsOf(cardFor(/September 13/))).toHaveAttribute('hidden')
    expect(teamsOf(cardFor(/September 20/))).toHaveAttribute('hidden')
  })

  it('files everything past the next occasion under its own heading', async () => {
    show()
    await screen.findByRole('heading', { name: /Today/ })
    const heading = screen.getByRole('heading', { name: 'Upcoming services availability' })
    const section = heading.closest('section')!
    expect(within(section).getByText(/September 13/)).toBeInTheDocument()
    expect(within(section).getByText(/September 20/)).toBeInTheDocument()
    // The one in front of you is not filed under "upcoming".
    expect(within(section).queryByText(/Today/)).not.toBeInTheDocument()
  })

  it('gathers a morning’s services under one date, said once', async () => {
    show()
    const today = await screen.findByRole('heading', { name: /Today/ })
    const day = today.closest('section')!
    // Both services on the morning, under the one heading…
    expect(within(day).getByRole('heading', { name: 'English Service' })).toBeInTheDocument()
    expect(within(day).getByRole('heading', { name: 'Malayalam Service' })).toBeInTheDocument()
    expect(within(day).getByText('2 services')).toBeInTheDocument()
    // …and the date is not repeated on the cards underneath it.
    expect(within(day).getAllByText(/September 6/)).toHaveLength(1)
  })

  it('opens a folded service on a touch', async () => {
    const user = show()
    await screen.findByRole('heading', { name: /Today/ })
    const later = cardFor(/September 13/)
    expect(teamsOf(later)).toHaveAttribute('hidden')
    await user.click(within(later).getByRole('button', { expanded: false }))
    await waitFor(() => expect(teamsOf(later)).not.toHaveAttribute('hidden'))
  })

  it('closes the open one on a touch, for somebody who wants it out of the way', async () => {
    const user = show()
    await screen.findByRole('heading', { name: /Today/ })
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
      await waitFor(() => expect(screen.getByRole('heading', { name: /Today/ })).toBeInTheDocument())
      expect(screen.getByRole('heading', { name: 'Malayalam Service' })).toBeInTheDocument()
    })

    it('says so plainly when every service in the window is over', async () => {
      state.finished = new Set(['s1', 's1b', 's2', 's3', 's4'])
      show()
      expect(await screen.findByText(/Every service in the window is over/)).toBeInTheDocument()
    })
  })
})
