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
  agendaDays,
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

const good = (over: Partial<EventDraft> = {}): EventDraft => ({
  ...emptyDraft(),
  title: 'Leaders Conference',
  slug: 'leaders-conference',
  sameTimes: true,
  start: '09:00',
  end: '17:00',
  dates: [{ ...newDateDraft(), date: '2026-11-21' }],
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

  it('is not rearranged by its times: an item with none has to sit where it was put', () => {
    const mixed = [item({ title: 'Lunch', start: '13:00' }), item({ title: 'Announcements' }), item({ title: 'Doors', start: '09:00' })]
    expect(draftProblems(good({ agenda: mixed }))).toEqual([])
    expect(titles(mixed)).toEqual(['Lunch', 'Announcements', 'Doors'])
  })
})

describe('an agenda over several days', () => {
  const threeDays = (): EventDraft =>
    good({
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
    const draft = good({ agenda: [item({ day: 3 })] })
    expect(draftProblems(draft)).toEqual(['Agenda item 1 is on a day that is no longer one of the dates.'])
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

  it('is as it was written: the times, the detail, and each item on its day', () => {
    expect(draftFromEvent(full()).agenda).toEqual([
      { id: 'a1', title: 'Doors', start: '09:00', end: '', details: '', day: null },
      { id: 'a2', title: 'Workshops', start: '10:00', end: '12:30', details: 'Rooms 1 to 3', day: 1 },
      { id: 'a3', title: 'Lunch', start: '', end: '', details: '', day: null },
    ])
  })

  it('is empty for an event that never had one', () => {
    expect(draftFromEvent({ ...full(), agenda: undefined }).agenda).toEqual([])
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
      draft.agenda = [draft.agenda[1], draft.agenda[0], item({ title: 'Closing', start: '16:00', details: ' Main hall ', day: 0 })]
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
