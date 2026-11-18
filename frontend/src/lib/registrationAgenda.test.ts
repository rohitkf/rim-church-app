import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * An event's agenda (0303): the running order of the day. What matters is
 * that only a title is asked for, that the order is the order it was
 * written in, that an item on a day goes where that day goes — and that
 * saving writes exactly what the editor held, with each item naming its
 * day by the id the day was saved under.
 */

const db = vi.hoisted(() => ({
  /** Every write, in the order it was made. */
  calls: [] as { table: string; op: 'insert' | 'update' | 'delete'; values?: Record<string, unknown>; id?: string }[],
  /** The ids handed to newly inserted dates, in order. */
  nextDateIds: [] as string[],
}))

vi.mock('./supabaseClient', () => {
  const table = (name: string) => ({
    insert: (values: Record<string, unknown>) => {
      db.calls.push({ table: name, op: 'insert', values })
      const made = { id: name === 'registration_event_dates' ? (db.nextDateIds.shift() ?? 'd-new') : 'e-new' }
      const answer = Promise.resolve({ data: made, error: null })
      return Object.assign(answer, { select: () => ({ single: () => answer }) })
    },
    update: (values: Record<string, unknown>) => ({
      eq: (_column: string, id: string) => {
        db.calls.push({ table: name, op: 'update', values, id })
        return Promise.resolve({ error: null })
      },
    }),
    delete: () => ({
      eq: (_column: string, id: string) => {
        db.calls.push({ table: name, op: 'delete', id })
        return Promise.resolve({ error: null })
      },
    }),
    // "Is anything still registered on what is being taken away?" — nothing is.
    select: () => ({ in: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
  })
  return {
    supabase: {
      from: table,
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'me' } } }) },
    },
  }
})

import {
  AGENDA_LIMITS,
  agendaByDay,
  agendaDays,
  agendaForTicket,
  agendaInMode,
  agendaModeOf,
  agendaToSave,
  agendaItemSchema,
  draftFromEvent,
  draftProblems,
  emptyDraft,
  movedAgenda,
  newAgendaDraft,
  newDateDraft,
  publicEventSchema,
  saveRegistrationEvent,
  withoutDate,
  type AgendaDraft,
  type EventDraft,
  type PublicAgendaItem,
  type PublicDate,
  type RegistrationEventFull,
} from './registrations'

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()

const item = (over: Partial<AgendaDraft> = {}): AgendaDraft => ({ ...newAgendaDraft(), title: 'Worship', ...over })

/** A draft that can be saved; one given an agenda has one, kept as a single list unless it says otherwise. */
const good = (over: Partial<EventDraft> = {}): EventDraft => ({
  ...emptyDraft(),
  title: 'Leaders Conference',
  slug: 'leaders-conference',
  sameTimes: true,
  start: '09:00',
  end: '17:00',
  dates: [{ ...newDateDraft(), date: '2026-11-21' }],
  agendaMode: over.agenda?.length ? 'all' : 'none',
  ...over,
})

const agendaWrites = () => db.calls.filter((c) => c.table === 'registration_event_agenda')

beforeEach(() => {
  db.calls = []
  db.nextDateIds = []
})

describe('what an agenda asks for', () => {
  it('is nothing at all: an event needs no agenda', () => {
    expect(emptyDraft().agenda).toEqual([])
    expect(emptyDraft().agendaMode).toBe('none')
    expect(draftProblems(good())).toEqual([])
  })

  it('is only a title: the times and the detail are there when they are known', () => {
    expect(draftProblems(good({ agenda: [item()] }))).toEqual([])
    expect(draftProblems(good({ agenda: [item({ title: '  ' })] }))).toEqual(['Agenda item 1 needs a title, or remove it.'])
  })

  it('takes a start with no end, and refuses an end with no start', () => {
    expect(draftProblems(good({ agenda: [item({ start: '09:30' })] }))).toEqual([])
    expect(draftProblems(good({ agenda: [item({ end: '10:00' })] }))).toEqual(['Agenda item 1 has an end time and no start time.'])
  })

  it('refuses an item that ends when it starts, and lets one run past midnight', () => {
    expect(draftProblems(good({ agenda: [item({ start: '09:30', end: '09:30' })] }))).toEqual(['Agenda item 1 ends when it starts.'])
    // A watch night: 23:00 to half past midnight.
    expect(draftProblems(good({ agenda: [item({ start: '23:00', end: '00:30' })] }))).toEqual([])
  })

  it('names the item that is wrong by its place in the list', () => {
    const agenda = [item(), item({ title: '' }), item({ title: 'Lunch', end: '13:00' })]
    expect(draftProblems(good({ agenda }))).toEqual([
      'Agenda item 2 needs a title, or remove it.',
      'Agenda item 3 has an end time and no start time.',
    ])
  })

  it('holds as many items as a long day has, and no more', () => {
    const many = Array.from({ length: AGENDA_LIMITS.items + 1 }, () => item())
    expect(draftProblems(good({ agenda: many }))).toEqual([`An agenda holds ${AGENDA_LIMITS.items} items at most.`])
    expect(draftProblems(good({ agenda: many.slice(1) }))).toEqual([])
  })
})

describe('the order of an agenda', () => {
  const agenda = [item({ title: 'Doors' }), item({ title: 'Worship' }), item({ title: 'Lunch' })]
  const titles = (list: AgendaDraft[]) => list.map((a) => a.title)

  it('is the order it was written in, moved one place at a time', () => {
    expect(titles(movedAgenda(agenda, 2, -1))).toEqual(['Doors', 'Lunch', 'Worship'])
    expect(titles(movedAgenda(agenda, 0, 1))).toEqual(['Worship', 'Doors', 'Lunch'])
  })

  it('does nothing at either end', () => {
    expect(movedAgenda(agenda, 0, -1)).toBe(agenda)
    expect(movedAgenda(agenda, 2, 1)).toBe(agenda)
  })

  it('moves an item among the items of its own day, past whatever is on another', () => {
    const days = [item({ title: 'Fri A', day: 0 }), item({ title: 'Sat A', day: 1 }), item({ title: 'Fri B', day: 0 }), item({ title: 'Sat B', day: 1 })]
    // Fri B goes above Fri A, not above Sat A.
    expect(titles(movedAgenda(days, 2, -1))).toEqual(['Fri B', 'Sat A', 'Fri A', 'Sat B'])
    // Sat B is last on its day: there is nowhere down to go.
    expect(movedAgenda(days, 3, 1)).toBe(days)
    // Fri A is first on its day, though not first in the list after a move.
    expect(movedAgenda(days, 0, -1)).toBe(days)
  })

  it('is not rearranged by its times: an item with none has to sit where it was put', () => {
    const mixed = [item({ title: 'Lunch', start: '13:00' }), item({ title: 'Announcements' }), item({ title: 'Doors', start: '09:00' })]
    expect(draftProblems(good({ agenda: mixed }))).toEqual([])
    expect(titles(mixed)).toEqual(['Lunch', 'Announcements', 'Doors'])
  })
})

describe('an agenda over several days', () => {
  const threeDays = (): EventDraft =>
    good({
      agendaMode: 'days',
      dates: [
        { ...newDateDraft(), date: '2026-11-20' },
        { ...newDateDraft(), date: '2026-11-21' },
        { ...newDateDraft(), date: '2026-11-22' },
      ],
      agenda: [
        item({ title: 'Registration', day: null }),
        item({ title: 'Opening night', day: 0 }),
        item({ title: 'Workshops', day: 1 }),
        item({ title: 'Sending out', day: 2 }),
      ],
    })

  it('loses what was on a day when that day is removed, and keeps the rest on their own days', () => {
    const next = withoutDate(threeDays(), 1)
    expect(next.dates.map((d) => d.date)).toEqual(['2026-11-20', '2026-11-22'])
    expect(next.agenda.map((a) => [a.title, a.day])).toEqual([
      ['Registration', null],
      ['Opening night', 0],
      // The third day is the second now, and its item went with it.
      ['Sending out', 1],
    ])
  })

  it('refuses an item on a day that is not one of the dates', () => {
    const draft = good({ agendaMode: 'days', agenda: [item({ day: 3 })] })
    expect(draftProblems(draft)).toEqual(['Agenda item 1 is on a day that is no longer one of the dates.'])
  })

  it('becomes one agenda when only one day is left: a day at a time means nothing with a single day', () => {
    const two = good({
      agendaMode: 'days',
      dates: [{ ...newDateDraft(), date: '2026-11-20' }, { ...newDateDraft(), date: '2026-11-21' }],
      agenda: [item({ title: 'Opening night', day: 0 }), item({ title: 'Workshops', day: 1 })],
    })
    const next = withoutDate(two, 0)
    expect(next.agendaMode).toBe('all')
    expect(next.agenda.map((a) => [a.title, a.day])).toEqual([['Workshops', null]])
  })
})

/*
 * The agenda is optional altogether, and for an event over several days
 * there are two ways to keep one (the Owner's ask, November 2026): a single
 * agenda for the whole event, or one for each day — where a day may be
 * left with nothing.
 */
describe('how an agenda is kept', () => {
  const twoDates = [{ ...newDateDraft(), date: '2026-11-20' }, { ...newDateDraft(), date: '2026-11-21' }]
  const shape = (list: AgendaDraft[]) => list.map((a) => [a.title, a.day])

  it('is read back off a saved agenda: none, one for the event, or one a day', () => {
    expect(agendaModeOf([], 2)).toBe('none')
    expect(agendaModeOf([item()], 2)).toBe('all')
    expect(agendaModeOf([item({ day: 1 })], 2)).toBe('days')
    // One date: there is only the one agenda, whatever an item says.
    expect(agendaModeOf([item({ day: 0 })], 1)).toBe('all')
  })

  it('sets out an agenda a day at a time: what is on no day, then each day in turn, each as it stood', () => {
    const mixed = [item({ title: 'Sat A', day: 1 }), item({ title: 'Every', day: null }), item({ title: 'Fri A', day: 0 }), item({ title: 'Sat B', day: 1 })]
    expect(shape(agendaByDay(mixed))).toEqual([
      ['Every', null],
      ['Fri A', 0],
      ['Sat A', 1],
      ['Sat B', 1],
    ])
  })

  it('made one for each day, puts what was on no day onto the first day — nothing is dropped', () => {
    const next = agendaInMode({ dates: twoDates, agenda: [item({ title: 'Doors' }), item({ title: 'Workshops', day: 1 }), item({ title: 'Worship' })] }, 'days')
    expect(next.agendaMode).toBe('days')
    expect(shape(next.agenda)).toEqual([
      ['Doors', 0],
      ['Worship', 0],
      ['Workshops', 1],
    ])
  })

  it('made one for the whole event, takes every item off its day, in the order the days had them', () => {
    const next = agendaInMode({ dates: twoDates, agenda: [item({ title: 'Sat A', day: 1 }), item({ title: 'Fri A', day: 0 })] }, 'all')
    expect(next.agendaMode).toBe('all')
    expect(shape(next.agenda)).toEqual([
      ['Fri A', null],
      ['Sat A', null],
    ])
  })

  it('cannot be one for each day with a single date: it is the one agenda', () => {
    const next = agendaInMode({ dates: [twoDates[0]], agenda: [item({ title: 'Doors' })] }, 'days')
    expect(next.agendaMode).toBe('all')
    expect(shape(next.agenda)).toEqual([['Doors', null]])
  })

  it('put away with "No agenda", keeps what was written, untouched, and saves none of it', () => {
    const agenda = [item({ title: 'Fri A', day: 0 }), item({ title: 'Sat A', day: 1 })]
    const next = agendaInMode({ dates: twoDates, agenda }, 'none')
    expect(next.agenda).toBe(agenda)
    expect(agendaToSave(next)).toEqual([])
    // And choosing again brings it back as it was.
    expect(shape(agendaInMode({ dates: twoDates, agenda: next.agenda }, 'days').agenda)).toEqual(shape(agenda))
  })

  it('is not asked about while it is put away: a blank item in an agenda that will not be saved stops nothing', () => {
    const draft = good({ agendaMode: 'none', agenda: [item({ title: '' })] })
    expect(draftProblems(draft)).toEqual([])
  })

  it('leaves a day with nothing on it alone', () => {
    const draft = good({ agendaMode: 'days', dates: twoDates, agenda: [item({ title: 'Workshops', day: 1 })] })
    expect(draftProblems(draft)).toEqual([])
    expect(shape(agendaToSave(draft))).toEqual([['Workshops', 1]])
  })
})

describe('a saved agenda back in the editor', () => {
  const full = (): RegistrationEventFull => ({
    event: {
      id: 'e1',
      slug: 'leaders-conference',
      title: 'Leaders Conference',
      description: null,
      image_path: null,
      status: 'draft',
      date_mode: 'all',
      location_name: null,
      address: null,
      latitude: null,
      longitude: null,
      registration_opens_at: null,
      registration_closes_at: null,
      min_per_order: 1,
      max_per_order: 10,
      payment_links: [],
      payment_accounts: [],
      payment_use_church_giving: true,
      payment_note: null,
      allow_pay_at_reception: true,
      add_to_diary: false,
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-01T10:00:00Z',
    },
    dates: [
      { id: 'd1', event_id: 'e1', starts_at: at(2026, 11, 20, 9, 0), ends_at: null, label: 'Day 1', sort_order: 0, diary_event_id: null },
      { id: 'd2', event_id: 'e1', starts_at: at(2026, 11, 21, 9, 0), ends_at: null, label: 'Day 2', sort_order: 1, diary_event_id: null },
    ],
    ticketTypes: [{ id: 't1', event_id: 'e1', name: 'General', description: null, kind: 'free', price_pence: 0, min_donation_pence: null, quantity: null, sort_order: 0 }],
    promoCodes: [],
    agenda: [
      { id: 'a1', event_id: 'e1', date_id: null, sort_order: 0, title: 'Doors', details: null, starts: '09:00', ends: null },
      { id: 'a2', event_id: 'e1', date_id: 'd2', sort_order: 1, title: 'Workshops', details: 'Rooms 1 to 3', starts: '10:00', ends: '12:30' },
      // A day that is no longer one of the dates reads as each day.
      { id: 'a3', event_id: 'e1', date_id: 'gone', sort_order: 2, title: 'Lunch', details: null, starts: null, ends: null },
    ],
  })

  it('is as it was written — the times, the detail, each item on its day — and set out a day at a time', () => {
    const draft = draftFromEvent(full())
    expect(draft.agendaMode).toBe('days')
    expect(draft.agenda).toEqual([
      { id: 'a1', title: 'Doors', start: '09:00', end: '', details: '', day: null },
      // A day that is no longer one of the dates reads as on no day.
      { id: 'a3', title: 'Lunch', start: '', end: '', details: '', day: null },
      { id: 'a2', title: 'Workshops', start: '10:00', end: '12:30', details: 'Rooms 1 to 3', day: 1 },
    ])
  })

  it('is no agenda for an event that never had one', () => {
    const draft = draftFromEvent({ ...full(), agenda: undefined })
    expect(draft.agenda).toEqual([])
    expect(draft.agendaMode).toBe('none')
  })

  it('is one agenda for the whole event when no item names a day', () => {
    const one = { ...full(), agenda: full().agenda!.filter((a) => a.id === 'a1') }
    expect(draftFromEvent(one).agendaMode).toBe('all')
  })

  it('reads the database’s time, which carries seconds, as the minutes the form keeps', () => {
    const row = agendaItemSchema.parse({ id: 'a1', event_id: 'e1', date_id: null, sort_order: 0, title: 'Doors', details: null, starts: '09:00:00', ends: null })
    expect(row.starts).toBe('09:00')
    expect(row.ends).toBeNull()
  })

  describe('saved again', () => {
    it('writes each item in the order it stands, on the day it names', async () => {
      const existing = full()
      const draft = draftFromEvent(existing)
      const byId = (id: string) => draft.agenda.find((a) => a.id === id)!
      draft.agenda = [byId('a2'), byId('a1'), item({ title: 'Closing', start: '16:00', details: ' Main hall ', day: 0 })]
      await saveRegistrationEvent(draft, existing)

      expect(agendaWrites()).toEqual([
        // Lunch was taken out of the list.
        { table: 'registration_event_agenda', op: 'delete', id: 'a3' },
        { table: 'registration_event_agenda', op: 'update', id: 'a2', values: { event_id: 'e1', date_id: 'd2', sort_order: 0, title: 'Workshops', details: 'Rooms 1 to 3', starts: '10:00', ends: '12:30' } },
        { table: 'registration_event_agenda', op: 'update', id: 'a1', values: { event_id: 'e1', date_id: null, sort_order: 1, title: 'Doors', details: null, starts: '09:00', ends: null } },
        { table: 'registration_event_agenda', op: 'insert', values: { event_id: 'e1', date_id: 'd1', sort_order: 2, title: 'Closing', details: 'Main hall', starts: '16:00', ends: null } },
      ])
    })

    it('names a day that was only just added by the id the database gave it', async () => {
      db.nextDateIds = ['d-fresh']
      const existing = full()
      const draft = draftFromEvent(existing)
      draft.dates = [...draft.dates, { ...newDateDraft(), date: '2026-11-22' }]
      draft.agenda = [item({ title: 'Sending out', day: 2 })]
      draft.agendaMode = 'days'
      await saveRegistrationEvent(draft, existing)

      const made = agendaWrites().find((c) => c.op === 'insert')
      expect(made?.values).toMatchObject({ title: 'Sending out', date_id: 'd-fresh' })
      // The date was written before the item that names it.
      const order = db.calls.map((c) => `${c.op} ${c.table}`)
      expect(order.indexOf('insert registration_event_dates')).toBeLessThan(order.indexOf('insert registration_event_agenda'))
    })

    it('does not delete by hand what went with its day', async () => {
      const existing = full()
      const draft = draftFromEvent(existing)
      // Day 2 removed in the editor: Workshops goes with it.
      Object.assign(draft, withoutDate(draft, 1))
      await saveRegistrationEvent(draft, existing)

      expect(db.calls.filter((c) => c.table === 'registration_event_dates' && c.op === 'delete').map((c) => c.id)).toEqual(['d2'])
      // The database took Workshops with its date; asking again would be asking for a row that is not there.
      expect(agendaWrites().filter((c) => c.op === 'delete')).toEqual([])
      expect(agendaWrites().map((c) => c.id)).toEqual(['a1', 'a3'])
    })

    it('saves an end only with its start', async () => {
      const draft = good({ agenda: [item({ start: '', end: '10:00' })] })
      // The form cannot make this (the end is shut until there is a start); the save does not trust that.
      await expect(saveRegistrationEvent(draft, null)).rejects.toThrow('Agenda item 1 has an end time and no start time.')
      expect(db.calls).toEqual([])
    })

    it('saved with "No agenda", deletes what the event had and writes nothing', async () => {
      const existing = full()
      const draft = { ...draftFromEvent(existing), agendaMode: 'none' as const }
      await saveRegistrationEvent(draft, existing)
      expect(agendaWrites().map((c) => [c.op, c.id])).toEqual([
        ['delete', 'a1'],
        ['delete', 'a2'],
        ['delete', 'a3'],
      ])
    })

    it('saved as one for the whole event, takes every item off its day', async () => {
      const existing = full()
      const draft = draftFromEvent(existing)
      Object.assign(draft, agendaInMode(draft, 'all'))
      await saveRegistrationEvent(draft, existing)
      expect(agendaWrites().filter((c) => c.op === 'update').map((c) => [c.id, c.values?.date_id, c.values?.sort_order])).toEqual([
        ['a1', null, 0],
        ['a3', null, 1],
        ['a2', null, 2],
      ])
    })

    it('writes a new event’s agenda under the event it has just made', async () => {
      db.nextDateIds = ['d-one']
      await saveRegistrationEvent(good({ agenda: [item({ title: 'Doors', start: '09:00' })] }), null)
      expect(agendaWrites()).toEqual([
        { table: 'registration_event_agenda', op: 'insert', values: { event_id: 'e-new', date_id: null, sort_order: 0, title: 'Doors', details: null, starts: '09:00', ends: null } },
      ])
    })
  })
})

describe('the agenda as it is read', () => {
  const dates: PublicDate[] = [
    { id: 'd1', starts_at: at(2026, 11, 20, 9, 0), ends_at: null, label: 'Day 1' },
    { id: 'd2', starts_at: at(2026, 11, 21, 9, 0), ends_at: null, label: 'Day 2' },
  ]
  const line = (id: string, date_id: string | null): PublicAgendaItem => ({ id, date_id, title: id, details: null, starts: null, ends: null })

  it('is one block with no day, for an event that names none', () => {
    expect(agendaDays([line('a', null), line('b', null)], dates)).toEqual([{ date: null, items: [line('a', null), line('b', null)] }])
  })

  it('is a block a day, the days in their own order and what is on no day first', () => {
    const days = agendaDays([line('second', 'd2'), line('every', null), line('first', 'd1'), line('second-b', 'd2')], dates)
    expect(days.map((d) => [d.date?.id ?? null, d.items.map((i) => i.id)])).toEqual([
      [null, ['every']],
      ['d1', ['first']],
      ['d2', ['second', 'second-b']],
    ])
  })

  it('leaves out a day with nothing on it', () => {
    expect(agendaDays([line('a', 'd2')], dates).map((d) => d.date?.id)).toEqual(['d2'])
  })

  it('reads an item on a day that is gone as on no day, rather than lose it', () => {
    expect(agendaDays([line('a', 'gone')], dates)).toEqual([{ date: null, items: [line('a', 'gone')] }])
  })

  it('is nothing for an event with no agenda', () => {
    expect(agendaDays([], dates)).toEqual([])
  })

  it('is no agenda, not a failure, from a database that does not send one', () => {
    const event = publicEventSchema.parse({
      id: 'e1',
      slug: 's',
      title: 'T',
      description: null,
      image_path: null,
      status: 'published',
      date_mode: 'all',
      location: { name: null, address: null, latitude: null, longitude: null },
      opens_at: null,
      closes_at: null,
      open: true,
      closed_reason: null,
      min_per_order: 1,
      max_per_order: 10,
      allow_pay_at_reception: true,
      payment_note: null,
      dates: [],
      ticket_types: [],
      logo_path: null,
    })
    expect(event.agenda).toEqual([])
  })
})

/*
 * On a ticket: the whole agenda for a ticket to the whole event, and this
 * ticket's day for a ticket to one date.
 */
describe('the agenda on a ticket', () => {
  const dates: PublicDate[] = [
    { id: 'd1', starts_at: at(2026, 11, 20, 18, 30), ends_at: null, label: 'Opening night' },
    { id: 'd2', starts_at: at(2026, 11, 21, 9, 0), ends_at: null, label: 'Conference day' },
  ]
  const line = (id: string, date_id: string | null): PublicAgendaItem => ({ id, date_id, title: id, details: null, starts: null, ends: null })
  const agenda = [line('every', null), line('fri', 'd1'), line('sat-a', 'd2'), line('sat-b', 'd2')]

  it('is all of it, on its days, for a ticket to the whole event', () => {
    const ticket = agendaForTicket(agenda, { booked: null, all: dates })
    expect(ticket.agenda).toEqual(agenda)
    expect(ticket.dates).toEqual(dates)
    expect(agendaDays(ticket.agenda, ticket.dates).map((d) => d.date?.id ?? null)).toEqual([null, 'd1', 'd2'])
  })

  it('is one day for a ticket to one date: what is on every day and what is on that one, as a single list', () => {
    const ticket = agendaForTicket(agenda, { booked: dates[1], all: dates })
    expect(ticket.agenda.map((a) => a.id)).toEqual(['every', 'sat-a', 'sat-b'])
    expect(ticket.dates).toEqual([dates[1]])
    // One block, no day to head it: the ticket has already said which day.
    expect(agendaDays(ticket.agenda, ticket.dates)).toEqual([{ date: null, items: ticket.agenda }])
  })

  it('is nothing for a ticket to a day that has nothing on it', () => {
    const ticket = agendaForTicket([line('fri', 'd1')], { booked: dates[1], all: dates })
    expect(ticket.agenda).toEqual([])
    expect(agendaDays(ticket.agenda, ticket.dates)).toEqual([])
  })

  it('leaves the event’s own list alone', () => {
    const before = JSON.stringify(agenda)
    agendaForTicket(agenda, { booked: dates[0], all: dates })
    expect(JSON.stringify(agenda)).toBe(before)
  })
})
