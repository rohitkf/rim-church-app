import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EventsPage } from './EventsPage'
import { formatTimeValue } from '../lib/dateTimeFormat'

/*
 * The diary, and putting something right in it.
 *
 * An event could be added and removed but not changed, so a time that
 * moved by half an hour meant deleting the thing and typing it again —
 * which loses who added it and, for anybody who had already seen it, looks
 * like the event was cancelled.
 */

const TODAY = '2026-09-13'

const state = vi.hoisted(() => ({
  events: [] as Record<string, unknown>[],
  people: [] as Record<string, unknown>[],
  couples: [] as { a: string; b: string }[],
  written: [] as { table: string; op: string; row: unknown; id?: string }[],
  openSeries: [] as { id: string }[],
  rpcs: [] as unknown[],
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1' } },
    isAdmin: true,
    isDepartmentHead: () => false,
  }),
}))

vi.mock('../lib/monthGrid', async () => {
  const actual = await vi.importActual<typeof import('../lib/monthGrid')>('../lib/monthGrid')
  return { ...actual, todayIso: () => TODAY }
})

vi.mock('../lib/queries', () => ({
  fetchServices: () => Promise.resolve([]),
  fetchDepartments: () => Promise.resolve([{ id: 'd1', name: 'Media', color: '#3b82f6' }]),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      if (fn === 'extend_event_series') {
        state.rpcs.push([fn, args])
        return Promise.resolve({ data: 26, error: null })
      }
      return Promise.resolve(fn === 'married_couples' ? { data: state.couples, error: null } : { data: null, error: { message: 'no' } })
    },
    from: (table: string) => ({
      select: () => {
        const rows = Promise.resolve({
          data:
            table === 'church_events'
              ? state.events
              : table === 'profiles'
                ? state.people
                : table === 'church_event_series'
                  ? state.openSeries
                  : [],
          error: null,
        })
        return Object.assign(rows, { order: () => rows, is: () => rows })
      },
      insert: (row: unknown) => {
        state.written.push({ table, op: 'insert', row })
        return Promise.resolve({ error: null })
      },
      update: (row: unknown) => ({
        eq: (_column: string, id: string) => {
          state.written.push({ table, op: 'update', row, id })
          return Promise.resolve({ error: null })
        },
      }),
      delete: () => ({
        eq: (column: string, id: string) => {
          const done = Promise.resolve({ error: null })
          // A series goes from a date onward (0234): .eq('series_id').gte('event_date').
          if (column === 'series_id') {
            return {
              gte: (_c: string, from: string) => {
                state.written.push({ table, op: 'delete-series', row: { series: id, from }, id })
                return done
              },
            }
          }
          state.written.push({ table, op: 'delete', row: null, id })
          return done
        },
      }),
    }),
  },
}))

const meeting = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  title: 'Members meeting',
  details: null,
  event_date: '2026-09-18',
  ends_on: null,
  start_time: '19:30:00',
  location: 'Main hall',
  department_id: null,
  created_by: 'u9',
  creator: { first_name: 'Grace', last_name: 'Mensah' },
  department: null,
  ...over,
})

beforeEach(() => {
  state.events = [meeting()]
  state.written = []
  state.people = []
  state.couples = []
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/*
 * A diary row is one line, because twenty of them have to be scannable.
 * Everything else an event carries — where it is, whose it is, whatever
 * was typed under "anything else" — had nowhere to be read.
 */
describe('reading an event', () => {
  it('opens everything the event carries', async () => {
    state.events = [
      meeting({
        details: 'Ps K K Renjith speaking.',
        ends_on: '2026-09-20',
        department: { name: 'Media', color: '#3b82f6' },
        department_id: 'd1',
      }),
    ]
    show()

    // A run is drawn once per day it covers, so there are three of these;
    // any of them opens the same event.
    const rows = await screen.findAllByRole('button', {
      name: /Members meeting — see the details/,
    })
    expect(rows).toHaveLength(3)
    await userEvent.click(rows[2])

    const detail = screen.getByRole('dialog')
    expect(within(detail).getByText(/18–20 Sep/)).toBeInTheDocument()
    expect(within(detail).getByText(/3 days/)).toBeInTheDocument()
    expect(within(detail).getByText(/7:30pm/)).toBeInTheDocument()
    expect(within(detail).getByText('Main hall')).toBeInTheDocument()
    expect(within(detail).getByText('Media')).toBeInTheDocument()
    expect(within(detail).getByText('Ps K K Renjith speaking.')).toBeInTheDocument()
    expect(within(detail).getByText(/Grace Mensah/)).toBeInTheDocument()
  })

  it('says the event belongs to the church when no team owns it', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: /see the details/ }))
    expect(within(screen.getByRole('dialog')).getByText('The whole church')).toBeInTheDocument()
  })

  it('goes from reading to editing without a second trip', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: /see the details/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit' }))

    expect(screen.getByRole('heading', { name: 'Edit this event' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Members meeting')).toBeInTheDocument()
  })

  it('closes without changing anything', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: /see the details/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state.written).toHaveLength(0)
  })
})

describe('editing an event', () => {
  it('opens the same form, holding what the event already says', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByRole('heading', { name: 'Edit this event' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Members meeting')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Main hall')).toBeInTheDocument()
    // "19:30:00" in the database is "19:30" to a time field, or it shows blank.
    expect(screen.getByRole('button', { name: 'Start time' })).toHaveTextContent(formatTimeValue('19:30'))
    expect(screen.getByText(/18 Sep/)).toBeInTheDocument()
  })

  it('writes the change to the event that was open, and adds nothing', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    const title = screen.getByDisplayValue('Members meeting')
    await userEvent.clear(title)
    await userEvent.type(title, 'Members meeting (moved)')
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0]).toMatchObject({
      table: 'church_events',
      op: 'update',
      id: 'e1',
    })
    expect(state.written[0].row).toMatchObject({
      title: 'Members meeting (moved)',
      event_date: '2026-09-18',
      start_time: '19:30',
      location: 'Main hall',
    })
  })

  /*
   * The name on a diary row is a fact about who decided the thing, not
   * about who last corrected a typo in it.
   */
  it('leaves the name of whoever added it alone', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0].row).not.toHaveProperty('created_by')
  })

  it('can put an end date on an event that had none', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    await userEvent.click(screen.getByRole('button', { name: 'Add an end date' }))
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0].row).toMatchObject({ ends_on: '2026-09-19' })
  })

  // A run is drawn once per day it covers; every one of those rows is the
  // same event, and editing any of them has to reach the same row.
  it('edits the one event behind a multi-day run, from any of its days', async () => {
    state.events = [meeting({ id: 'e2', title: 'Fasting prayer', ends_on: '2026-09-20' })]
    show()

    const edits = await screen.findAllByRole('button', { name: 'Edit' })
    expect(edits).toHaveLength(3)

    await userEvent.click(edits[2])
    expect(screen.getByDisplayValue('Fasting prayer')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0].id).toBe('e2')
  })

  it('still adds a new one when nothing is being edited', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: /Add event/ }))
    await userEvent.type(screen.getByPlaceholderText(/Members' meeting/), 'Workday')

    const form = screen.getByRole('dialog')
    await userEvent.click(within(form).getByRole('button', { name: /Add event/ }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0]).toMatchObject({ op: 'insert' })
    expect(state.written[0].row).toMatchObject({ title: 'Workday', created_by: 'u1' })
  })
})

/*
 * An event used to leave the diary at midnight on the day it ended, which
 * made this page the only record of a thing and then lost it. It is kept
 * now, under its own heading, out of the way of what is still coming.
 */
describe('events that are over', () => {
  const sectionFor = async (name: RegExp) =>
    (await screen.findByRole('heading', { name })).closest('section') as HTMLElement

  /** Past events sit folded under their own heading; open it first. */
  const openPast = async () => {
    const toggle = await screen.findByRole('button', { name: /Past events/ })
    if (toggle.getAttribute('aria-expanded') !== 'true') await userEvent.click(toggle)
    return toggle.closest('section') as HTMLElement
  }

  it('are kept, under Past events rather than among what is coming', async () => {
    state.events = [
      meeting(),
      meeting({ id: 'e2', title: 'Church workday', event_date: '2026-08-22' }),
    ]
    show()

    await screen.findByText('Members meeting')
    const past = await openPast()
    expect(within(past).getByText('Church workday')).toBeInTheDocument()
    expect(within(past).queryByText('Members meeting')).toBeNull()

    const coming = await sectionFor(/Coming up/)
    expect(within(coming).getByText('Members meeting')).toBeInTheDocument()
    expect(within(coming).queryByText('Church workday')).toBeNull()
  })

  it('says how long a finished run was, not which day of it you are on', async () => {
    state.events = [meeting({ id: 'e2', title: 'Week of Prayer', event_date: '2026-08-22', ends_on: '2026-08-28' })]
    show()

    const past = await openPast()
    expect(within(past).getByText(/7 days/)).toBeInTheDocument()
    expect(within(past).queryByText(/Day 1 of 7/)).toBeNull()
    // One row for the whole run, not seven.
    expect(within(past).getAllByRole('listitem')).toHaveLength(1)
  })

  it('can still be corrected, because a record is worth being right', async () => {
    state.events = [meeting({ event_date: '2026-08-22' })]
    show()

    const past = await openPast()
    await userEvent.click(within(past).getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('heading', { name: 'Edit this event' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Members meeting')).toBeInTheDocument()
  })

  it('opens what it carried, same as any other row', async () => {
    state.events = [meeting({ event_date: '2026-08-22', details: 'Twelve of us came.' })]
    show()

    await openPast()
    await userEvent.click(await screen.findByRole('button', { name: /see the details/ }))
    expect(within(screen.getByRole('dialog')).getByText('Twelve of us came.')).toBeInTheDocument()
  })

  it('is not there at all for a church with nothing behind it', async () => {
    show()
    await screen.findByText('Members meeting')
    expect(screen.queryByRole('button', { name: /Past events/ })).toBeNull()
  })

  /*
   * Folded, like every page's finished services: the record is a real
   * question, but never the one this page is opened for. The count says
   * whether it is worth opening.
   */
  it('arrives folded, saying how many are inside', async () => {
    state.events = [
      meeting({ id: 'e2', title: 'Church workday', event_date: '2026-08-22' }),
      meeting({ id: 'e3', title: 'Harvest supper', event_date: '2026-07-04' }),
    ]
    show()

    const toggle = await screen.findByRole('button', { name: /Past events/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('2')
    expect(screen.queryByRole('button', { name: /Church workday — see the details/ })).toBeNull()

    await userEvent.click(toggle)
    expect(screen.getByRole('button', { name: /Church workday — see the details/ })).toBeInTheDocument()
  })

  it('keeps the last year, and lets anything older go', async () => {
    state.events = [
      meeting({ id: 'e2', title: 'Last spring', event_date: '2026-03-01' }),
      meeting({ id: 'e3', title: 'Two summers ago', event_date: '2025-06-01' }),
    ]
    show()

    const past = await openPast()
    expect(within(past).getByText('Last spring')).toBeInTheDocument()
    expect(within(past).queryByText('Two summers ago')).toBeNull()
  })
})

/*
 * A husband and wife were two rows on the same day, each with the same
 * number of years. Linked as each other's spouse, they are one.
 */
describe("a couple's anniversary", () => {
  const people = [
    { id: 'r', first_name: 'Rohit', last_name: 'Francis', dob: null, anniversary: '2025-09-20' },
    { id: 'j', first_name: 'Jolsna', last_name: 'Rohit', dob: null, anniversary: '2025-09-20' },
  ]

  it('is one row: the occasion, then both names', async () => {
    state.events = []
    state.people = people
    state.couples = [{ a: 'j', b: 'r' }]
    show()
    const title = await screen.findByText('Wedding anniversary')
    const row = title.closest('li') as HTMLElement
    expect(row.textContent).toContain('Jolsna Rohit & Rohit Francis')
    expect(row.textContent).toContain('1 year')
    expect(row.textContent).not.toContain('1 years')
    expect(screen.getAllByText('Wedding anniversary')).toHaveLength(1)
    expect(screen.queryByText('Rohit Francis')).toBeNull()
  })

  it('stays two rows for two people nobody has linked', async () => {
    state.events = []
    state.people = people
    show()
    expect(await screen.findByText('Rohit Francis')).toBeTruthy()
    expect(screen.getByText('Jolsna Rohit')).toBeTruthy()
    expect(screen.queryByText('Wedding anniversary')).toBeNull()
  })
})

describe('showing one kind at a time', () => {
  it('filters the diary to the kind pressed, and back to everything', async () => {
    show()
    expect(await screen.findAllByText('Members meeting')).not.toHaveLength(0)
    const filter = screen.getByRole('group', { name: 'Show' })
    expect(within(filter).getByRole('button', { name: 'Everything' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(within(filter).getByRole('button', { name: 'Birthdays' }))
    expect(within(filter).getByRole('button', { name: 'Birthdays' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Members meeting')).toBeNull()
    expect(screen.getByText('No birthdays coming up.')).toBeInTheDocument()

    await userEvent.click(within(filter).getByRole('button', { name: 'Events' }))
    expect(screen.getAllByText('Members meeting')).not.toHaveLength(0)

    await userEvent.click(within(filter).getByRole('button', { name: 'Everything' }))
    expect(screen.getAllByText('Members meeting')).not.toHaveLength(0)
  })
})

/*
 * Events that repeat (0234): every week, fortnight, month or year, each
 * occurrence its own row in the diary, joined by the series.
 */
describe('events that repeat', () => {
  beforeEach(() => {
    state.events = []
    state.written = []
  })

  it('adds one row for each time it happens, all of one series', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: /Add event/ }))
    await userEvent.type(screen.getByPlaceholderText(/Members' meeting/), 'Prayer meeting')
    const form = screen.getByRole('dialog')
    await userEvent.click(within(form).getByRole('combobox', { name: 'Repeats' }))
    await userEvent.click(screen.getByRole('option', { name: 'Every week on Sunday' }))
    expect(within(form).getByText(/14 events, each its own in the diary/)).toBeInTheDocument()
    await userEvent.click(within(form).getByRole('button', { name: /Add event/ }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    const rows = state.written[0].row as { event_date: string; series_id: string; repeat_rule: string; title: string }[]
    expect(rows).toHaveLength(14)
    expect(rows[0]).toMatchObject({ event_date: TODAY, repeat_rule: 'weekly', title: 'Prayer meeting' })
    expect(rows[1].event_date).toBe('2026-09-20')
    expect(new Set(rows.map((r) => r.series_id)).size).toBe(1)
  })

  it('asks which ones to remove, and can take this one and every one after it', async () => {
    state.events = [
      meeting({ id: 's1', title: 'Prayer meeting', event_date: '2026-09-20', series_id: 'S', repeat_rule: 'weekly' }),
      meeting({ id: 's2', title: 'Prayer meeting', event_date: '2026-09-27', series_id: 'S', repeat_rule: 'weekly' }),
    ]
    show()
    const remove = await screen.findAllByRole('button', { name: /Remove/ })
    await userEvent.click(remove[0])
    const dialog = screen.getByRole('dialog', { name: /Remove Prayer meeting/ })
    expect(within(dialog).getByRole('button', { name: 'Only this one' })).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'This one and every one after it' }))
    await waitFor(() => expect(state.written).toEqual([{ table: 'church_events', op: 'delete-series', row: { series: 'S', from: '2026-09-20' }, id: 'S' }]))
  })

  it('says how it repeats when it is opened', async () => {
    state.events = [meeting({ id: 's1', title: 'Prayer meeting', event_date: '2026-09-20', series_id: 'S', repeat_rule: 'weekly' })]
    show()
    await userEvent.click(await screen.findByRole('button', { name: /see the details/ }))
    expect(within(screen.getByRole('dialog')).getByText('Repeats every week on Sunday')).toBeInTheDocument()
  })

  it('changes this one and every one after it, leaving earlier ones', async () => {
    state.events = [
      meeting({ id: 's0', title: 'Prayer meeting', event_date: '2026-09-13', series_id: 'S', repeat_rule: 'weekly' }),
      meeting({ id: 's1', title: 'Prayer meeting', event_date: '2026-09-20', series_id: 'S', repeat_rule: 'weekly' }),
      meeting({ id: 's2', title: 'Prayer meeting', event_date: '2026-09-27', series_id: 'S', repeat_rule: 'weekly' }),
    ]
    show()
    const edits = await screen.findAllByRole('button', { name: 'Edit' })
    await userEvent.click(edits[1])
    const title = screen.getByDisplayValue('Prayer meeting')
    await userEvent.clear(title)
    await userEvent.type(title, 'Prayer evening')
    await userEvent.click(screen.getByRole('radio', { name: 'This one and every one after it' }))
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }))
    await waitFor(() => expect(state.written).toHaveLength(2))
    expect(state.written.map((w) => w.id).sort()).toEqual(['s1', 's2'])
    expect(state.written[0].row).toMatchObject({ title: 'Prayer evening' })
  })

  it('goes on with no end date: a series row, and the database makes the next six months', async () => {
    state.rpcs = []
    show()
    await userEvent.click(await screen.findByRole('button', { name: /Add event/ }))
    await userEvent.type(screen.getByPlaceholderText(/Members' meeting/), 'Prayer meeting')
    const form = screen.getByRole('dialog')
    await userEvent.click(within(form).getByRole('combobox', { name: 'Repeats' }))
    await userEvent.click(screen.getByRole('option', { name: 'Every week on Sunday' }))
    await userEvent.click(within(form).getByRole('checkbox', { name: 'No end date' }))
    expect(within(form).getByText(/goes on until you stop it/)).toBeInTheDocument()
    await userEvent.click(within(form).getByRole('button', { name: /Add event/ }))

    await waitFor(() => expect(state.rpcs).toHaveLength(1))
    expect(state.written).toHaveLength(1)
    expect(state.written[0]).toMatchObject({ table: 'church_event_series', op: 'insert' })
    const series = state.written[0].row as { id: string; rule: string; anchor_date: string; generated_through: string }
    expect(series).toMatchObject({ rule: 'weekly', anchor_date: TODAY, generated_through: '2026-09-12' })
    expect(state.rpcs[0]).toEqual(['extend_event_series', { only_series: series.id }])
  })

  it('stops an open-ended one when this and every one after it are removed', async () => {
    state.openSeries = [{ id: 'S' }]
    state.events = [meeting({ id: 's1', title: 'Prayer meeting', event_date: '2026-09-20', series_id: 'S', repeat_rule: 'weekly' })]
    show()
    await userEvent.click(await screen.findByRole('button', { name: /see the details/ }))
    expect(within(screen.getByRole('dialog')).getByText('Repeats every week on Sunday, with no end date')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
    await userEvent.click((await screen.findAllByRole('button', { name: /Remove/ }))[0])
    await userEvent.click(screen.getByRole('button', { name: 'This one and every one after it' }))
    await waitFor(() => expect(state.written.map((w) => w.op)).toEqual(['delete-series', 'update']))
    expect(state.written[1]).toMatchObject({ table: 'church_event_series', id: 'S' })
    state.openSeries = []
  })

  it('shows a Repeats chip on each one, not which day of a run it is', async () => {
    state.events = [
      meeting({ id: 's1', title: 'Prayer meeting', event_date: '2026-09-20', ends_on: '2026-09-22', series_id: 'S', repeat_rule: 'weekly' }),
    ]
    show()
    const row = (await screen.findAllByRole('button', { name: /Prayer meeting — see the details/ }))[0]
    expect(row).toHaveTextContent('Repeats every week')
    expect(row).not.toHaveTextContent(/Day \d of/)
  })
})
