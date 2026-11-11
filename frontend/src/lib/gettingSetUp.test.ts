import { describe, expect, it } from 'vitest'
import { MISSING_TEXT, VISA_TYPES } from './joining'
import { SETUP_COLUMNS, hasSomethingLeft, setupCardDue, setupTicksOf, type PersonSetup } from './gettingSetUp'

const migrations = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const person = (over: Partial<PersonSetup> = {}): PersonSetup => ({
  user_id: 'a',
  joined: true,
  gaps: [],
  notifications: true,
  ...over,
})
const toured = { seen: { welcome: '2026-10-02T10:00:00Z' }, pushed_at: null }
const phone = { state: 'granted' as const, installed: true }

describe('a person’s row of ticks', () => {
  it('ticks everything for somebody who has done everything', () => {
    const ticks = setupTicksOf(person(), toured, phone)
    expect(SETUP_COLUMNS.every((c) => ticks[c.key])).toBe(true)
    expect(hasSomethingLeft(ticks)).toBe(false)
  })

  it('leaves the detail blank that has no answer, and the profile with it', () => {
    const ticks = setupTicksOf(person({ gaps: ['dob'] }), toured, phone)
    expect(ticks.dob).toBe(false)
    expect(ticks.profile).toBe(false)
    expect(ticks.phone).toBe(true)
    expect(hasSomethingLeft(ticks)).toBe(true)
  })

  it('counts a missing anniversary against marital status, and a missing expiry against UK status', () => {
    expect(setupTicksOf(person({ gaps: ['anniversary'] }), toured, phone).marital).toBe(false)
    expect(setupTicksOf(person({ gaps: ['visaHasExpiry'] }), toured, phone).status).toBe(false)
    expect(setupTicksOf(person({ gaps: ['visaExpiry'] }), toured, phone).status).toBe(false)
  })

  it('does not call a profile complete before the joining form, or with a name missing', () => {
    expect(setupTicksOf(person({ joined: false }), toured, phone).profile).toBe(false)
    const nameless = setupTicksOf(person({ gaps: ['firstName'] }), toured, phone)
    expect(nameless.profile).toBe(false)
    expect(nameless.phone).toBe(true)
  })

  it('reads the tour, the phone and notifications each from its own record', () => {
    const none = setupTicksOf(person({ notifications: false }), undefined, undefined)
    expect(none).toMatchObject({ tour: false, location: false, notifications: false, installed: false })
    // Sent again since they last saw it: not taken until they do.
    const resent = { seen: { welcome: '2026-10-02T10:00:00Z' }, pushed_at: '2026-10-05T10:00:00Z' }
    expect(setupTicksOf(person(), resent, phone).tour).toBe(false)
    expect(setupTicksOf(person(), toured, { state: 'denied', installed: false })).toMatchObject({
      location: false,
      installed: false,
    })
  })

  it('ticks nothing for somebody it has no answer about', () => {
    const ticks = setupTicksOf(undefined, undefined, undefined)
    expect(SETUP_COLUMNS.some((c) => ticks[c.key])).toBe(false)
  })
})

describe('whether the card is due', () => {
  it('is not, for somebody never asked', () => {
    expect(setupCardDue(null)).toBe(false)
    expect(setupCardDue({ setup_asked_at: null, setup_closed_at: null })).toBe(false)
  })

  it('is, from the ask until they close it — and again when asked again', () => {
    expect(setupCardDue({ setup_asked_at: '2026-11-10T10:00:00Z', setup_closed_at: null })).toBe(true)
    expect(setupCardDue({ setup_asked_at: '2026-11-10T10:00:00Z', setup_closed_at: '2026-11-10T11:00:00Z' })).toBe(false)
    expect(setupCardDue({ setup_asked_at: '2026-11-11T09:00:00Z', setup_closed_at: '2026-11-10T11:00:00Z' })).toBe(true)
  })
})

/*
 * `profile_gaps()` is the database's copy of the joining form's rule, and
 * the door goes by it. Two lists there have to be this file's: the
 * statuses that do not run out, and the names of the questions.
 */
describe('the database’s copy of the joining form’s rule', () => {
  // The newest migration that defines it is the one in force.
  const sql = Object.entries(migrations)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => text)
    .filter((text) => text.includes('function public.profile_gaps('))
    .pop()!
  const body = sql.slice(sql.indexOf('function public.profile_gaps('), sql.indexOf('revoke all on function public.profile_gaps'))

  it('calls the same statuses settled', () => {
    const lists = [...body.matchAll(/visa_type not in \(([^)]*)\)/g)].map((m) =>
      [...m[1].matchAll(/'([a-z_]+)'/g)].map((v) => v[1]).sort(),
    )
    expect(lists.length).toBeGreaterThan(0)
    const settled = VISA_TYPES.filter((v) => v.settled).map((v) => v.value).sort()
    for (const list of lists) expect(list).toEqual(settled)
  })

  it('names each question as the form does', () => {
    const names = [...body.matchAll(/then '([A-Za-z]+)' end/g)].map((m) => m[1])
    expect(names).toEqual([
      'firstName', 'lastName', 'phone', 'dob', 'maritalStatus', 'anniversary', 'visaType', 'visaHasExpiry', 'visaExpiry',
    ])
    for (const name of names) expect(MISSING_TEXT).toHaveProperty(name)
  })
})
