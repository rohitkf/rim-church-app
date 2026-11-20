import { describe, expect, it } from 'vitest'
import { JOINING_FORM, MISSING_TEXT, VISA_TYPES, missingAnswers } from './joining'
import { SETUP_COLUMNS, completedAt, hasSomethingLeft, setupCardDue, setupTicksOf, type PersonSetup } from './gettingSetUp'

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
  completed_at: null,
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

  it('counts any part of the address against the address, and either half of who to ring against that', () => {
    for (const gap of ['addressLine1', 'town', 'postcode']) {
      const ticks = setupTicksOf(person({ gaps: [gap] }), toured, phone)
      expect(ticks.address, gap).toBe(false)
      expect(ticks.emergency, gap).toBe(true)
      expect(ticks.profile, gap).toBe(false)
    }
    for (const gap of ['emergencyName', 'emergencyRelation', 'emergencyPhone']) {
      const ticks = setupTicksOf(person({ gaps: [gap] }), toured, phone)
      expect(ticks.emergency, gap).toBe(false)
      expect(ticks.address, gap).toBe(true)
    }
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

/*
 * When somebody finished their details (0304). The database keeps the
 * first moment and never moves it, so the date alone does not say they are
 * finished now: only a profile that is complete has one to show.
 */
describe('when somebody finished their details', () => {
  const at = '2026-11-18T07:42:00Z'

  it('is the date on record, for a profile that is complete', () => {
    const setup = person({ completed_at: at })
    expect(completedAt(setup, setupTicksOf(setup, toured, phone))).toBe(at)
  })

  it('is nothing for a profile with a blank now, though it was finished once', () => {
    const setup = person({ completed_at: at, gaps: ['emergencyRelation'] })
    expect(completedAt(setup, setupTicksOf(setup, toured, phone))).toBeNull()
  })

  it('is nothing for somebody not through the joining form', () => {
    const setup = person({ completed_at: at, joined: false })
    expect(completedAt(setup, setupTicksOf(setup, toured, phone))).toBeNull()
  })

  it('is nothing where none was kept, or nobody was asked about', () => {
    expect(completedAt(person(), { profile: true })).toBeNull()
    expect(completedAt(undefined, { profile: true })).toBeNull()
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
  /** The newest migration that defines a function is the one in force for it. */
  const newestWith = (signature: string) =>
    Object.entries(migrations)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, text]) => text)
      // Where it is defined, not merely named: 0311 alters joining_form() without redefining it.
      .filter((text) => text.includes(`create or replace ${signature}`))
      .pop()!
  /** That function's own text, from its name to the end of its body. */
  const functionText = (signature: string) => {
    const sql = newestWith(signature)
    const from = sql.indexOf(signature)
    return sql.slice(from, sql.indexOf('$function$;', from))
  }
  // The questions, form by form.
  const body = functionText('function public.profile_gaps(p_user uuid, p_form integer)')

  it('calls the same statuses settled', () => {
    const lists = [...body.matchAll(/visa_type not in \(([^)]*)\)/g)].map((m) =>
      [...m[1].matchAll(/'([a-z_]+)'/g)].map((v) => v[1]).sort(),
    )
    expect(lists.length).toBeGreaterThan(0)
    const settled = VISA_TYPES.filter((v) => v.settled).map((v) => v.value).sort()
    for (const list of lists) expect(list).toEqual(settled)
  })

  it('names each question as the form does', () => {
    const names = [...body.matchAll(/then '([A-Za-z0-9]+)' end/g)].map((m) => m[1])
    expect(names).toEqual([
      'firstName', 'lastName', 'phone', 'dob', 'maritalStatus', 'anniversary', 'visaType', 'visaHasExpiry', 'visaExpiry',
      'addressLine1', 'town', 'postcode', 'emergencyName', 'emergencyRelation', 'emergencyPhone',
    ])
    for (const name of names) expect(MISSING_TEXT).toHaveProperty(name)
  })

  /*
   * The other way round: everything the form refuses to go on without, the
   * database knows to ask for — bar the DBS answer, which cannot be told
   * from the column's default and so is never a gap (0276). A question the
   * form asked and the database did not would let somebody back in with it
   * blank, the first time the page was reloaded.
   */
  it('asks for everything the form asks for', () => {
    const names = new Set([...body.matchAll(/then '([A-Za-z0-9]+)' end/g)].map((m) => m[1]))
    const blank = missingAnswers({
      firstName: '', lastName: '', phone: '', dob: '', maritalStatus: 'married', anniversary: '',
      visaType: '', visaHasExpiry: null, visaExpiry: '', hasDbs: null, visaNote: '',
      addressLine1: '', addressLine2: '', town: '', postcode: '', emergencyName: '', emergencyRelation: '', emergencyPhone: '',
    })
    for (const field of blank) {
      if (field === 'hasDbs' || field === 'visaHasExpiry') continue // the second appears once a status is chosen
      expect(names.has(field), field).toBe(true)
    }
  })

  /*
   * The forms are numbered (0301) so that an app is never shut behind a
   * question it cannot put. Three numbers have to be the same one: the form
   * this app has, the newest the database will answer for, and the one the
   * table in Settings › Onboarding goes by.
   */
  it('numbers its forms, and this app’s is the newest the database knows', () => {
    // One number, in one place (0304): joining_form().
    const newest = Number(functionText('function public.joining_form()').match(/select (\d+);/)?.[1])
    expect(newest).toBe(JOINING_FORM)
    // The table in Settings › Onboarding and the door of an app that names its form both ask it, and write no number of their own.
    expect(functionText('function public.profile_gaps(p_user uuid)')).toContain('public.profile_gaps(p_user, public.joining_form())')
    expect(functionText('function public.my_profile_gaps_for(p_form integer)')).toContain('least(coalesce(p_form, 1), public.joining_form())')
    // Every question added after the first form is asked only of an app that has it, and none is asked of a form the database does not know.
    const formOf = Object.fromEntries(
      [...body.matchAll(/case when p_form >= (\d+) and [^\n]* then '([A-Za-z0-9]+)' end/g)].map((m) => [m[2], Number(m[1])]),
    )
    expect(formOf).toEqual({ addressLine1: 2, town: 2, postcode: 2, emergencyName: 2, emergencyPhone: 2, emergencyRelation: 3 })
    expect(Math.max(...Object.values(formOf))).toBe(newest)
  })

  it('keeps the door of the app before the forms were numbered on the first form', () => {
    expect(functionText('function public.my_profile_gaps()')).toContain('public.profile_gaps(auth.uid(), 1)')
  })

  /*
   * When somebody finished (0304): recorded by the database for the newest
   * form, from each of the four places an answer can land.
   */
  it('records when somebody finished from every place an answer can land', () => {
    const sql = newestWith('function public.profile_completion_watch()')
    const watched = [...sql.matchAll(/create trigger \w+_completion_watch\s+after ([a-z ]+) on public\.(\w+)/g)].map((m) => `${m[2]}: ${m[1]}`)
    expect(watched.sort()).toEqual([
      'household_members: insert or update',
      'households: update',
      'profile_sensitive: insert or update',
      'profiles: insert or update',
    ])
    // For the newest form, whatever that is: no number of its own.
    expect(functionText('function public.profile_completion_note(p_user uuid)')).toContain('public.joining_form()')
    // And never in the way of the save it is watching.
    expect(functionText('function public.profile_completion_watch()')).toContain('exception when others then')
  })
})
