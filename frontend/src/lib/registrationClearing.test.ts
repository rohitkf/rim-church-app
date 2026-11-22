import { describe, expect, it } from 'vitest'
import scheduled from '../../../supabase/migrations/0245_registrations_run_from_the_dashboard.sql?raw'
import job from '../../../supabase/migrations/0287_a_message_to_the_organisers_and_files_that_leave_with_the_event.sql?raw'
import { CLEARING_RUNS_AT, clearingLeft, clearingLine, clearingOf, detailsClearAt } from './registrationClearing'

/*
 * The countdown on a finished event is the nightly job's own sum, done in
 * the app. Whatever the job goes by, this has to go by too.
 */
describe('the count goes by what the job goes by', () => {
  it('runs when the job is scheduled to run', () => {
    const [, minute, hour] = scheduled.match(/cron\.schedule\('registration-anonymise', '(\d+) (\d+) \* \* \*'/) ?? []
    expect({ hour: Number(hour), minute: Number(minute) }).toEqual(CLEARING_RUNS_AT)
  })

  it('counts from an event’s last date, its end where it has one, by the church’s number of days', () => {
    const body = job.slice(job.indexOf('create or replace function public.registration_anonymise()'))
    expect(body).toContain('select registration_retention_days from public.app_settings')
    expect(body).toContain('if keep_days is null then return; end if;')
    expect(body).toMatch(/max\(coalesce\(d\.ends_at, d\.starts_at\)\)[\s\S]*?< now\(\) - make_interval\(days => keep_days\)/)
    // It blanks what the page says it blanks, and deletes no event.
    expect(body).toContain("set name = 'Anonymised'")
    expect(body).not.toMatch(/delete from public\.registration_events/)
  })
})

describe('when a finished event’s registrations are cleared', () => {
  it('is the first run of the job after the last date is that many days behind', () => {
    // Ended 1 June at 20:00 UTC, kept 90 days: due 30 August 20:00, cleared at the run on the 31st.
    expect(detailsClearAt('2026-06-01T20:00:00Z', 90)?.toISOString()).toBe('2026-08-31T03:35:00.000Z')
    // Ended in the small hours, before that night's run: the run 90 days on takes it.
    expect(detailsClearAt('2026-06-01T01:00:00Z', 90)?.toISOString()).toBe('2026-08-30T03:35:00.000Z')
  })

  it('waits a night when the days run out exactly as the job runs: the job wants it strictly behind', () => {
    expect(detailsClearAt('2026-06-01T03:35:00Z', 1)?.toISOString()).toBe('2026-06-03T03:35:00.000Z')
    expect(detailsClearAt('2026-06-01T03:34:59Z', 1)?.toISOString()).toBe('2026-06-02T03:35:00.000Z')
  })

  it('reads a time written with an offset as the moment it is', () => {
    expect(detailsClearAt('2026-06-01T21:00:00+01:00', 90)?.toISOString()).toBe('2026-08-31T03:35:00.000Z')
  })

  it('has no moment when the details are kept for ever, or there is no date to count from', () => {
    expect(detailsClearAt('2026-06-01T20:00:00Z', null)).toBeNull()
    expect(detailsClearAt(null, 90)).toBeNull()
    expect(detailsClearAt('not a date', 90)).toBeNull()
  })
})

describe('where a finished event stands', () => {
  const at = (iso: string) => new Date(iso)
  const ended = '2026-06-01T20:00:00Z'

  it('says nothing of an event that has not finished, or has no dates', () => {
    expect(clearingOf({ lastEndsAt: ended, keepDays: 90, anonymised: false, now: at('2026-06-01T19:00:00Z') })).toBeNull()
    expect(clearingOf({ lastEndsAt: null, keepDays: 90, anonymised: false, now: at('2026-07-01T00:00:00Z') })).toBeNull()
  })

  it('counts down from the moment it finishes', () => {
    expect(clearingOf({ lastEndsAt: ended, keepDays: 90, anonymised: false, now: at('2026-06-01T20:00:01Z') })).toEqual({
      state: 'counting',
      at: at('2026-08-31T03:35:00Z'),
    })
  })

  it('says tonight once the night has come and the names are still there', () => {
    expect(clearingOf({ lastEndsAt: ended, keepDays: 90, anonymised: false, now: at('2026-08-31T03:36:00Z') })?.state).toBe('due')
  })

  it('says cleared only when the registrations themselves say so', () => {
    expect(clearingOf({ lastEndsAt: ended, keepDays: 90, anonymised: true, now: at('2026-09-01T00:00:00Z') })).toEqual({ state: 'cleared' })
    // Cleared under an older, shorter setting: still cleared, whatever the count would now say.
    expect(clearingOf({ lastEndsAt: ended, keepDays: 365, anonymised: true, now: at('2026-07-01T00:00:00Z') })).toEqual({ state: 'cleared' })
  })

  it('says kept where the church keeps the details until the event is deleted', () => {
    expect(clearingOf({ lastEndsAt: ended, keepDays: null, anonymised: false, now: at('2026-07-01T00:00:00Z') })).toEqual({ state: 'kept' })
  })
})

describe('the line on an event’s card', () => {
  const at = (iso: string) => new Date(iso)
  const clears = at('2026-08-31T03:35:00Z')

  it('says what is left in two parts at most', () => {
    expect(clearingLeft(clears, at('2026-06-02T13:35:00Z'))).toBe('89 days 14 hrs')
    expect(clearingLeft(clears, at('2026-08-30T02:35:00Z'))).toBe('1 day 1 hr')
    expect(clearingLeft(clears, at('2026-08-30T13:30:00Z'))).toBe('14 hrs 05 min')
    expect(clearingLeft(clears, at('2026-08-31T02:30:00Z'))).toBe('1 hr 05 min')
    expect(clearingLeft(clears, at('2026-08-31T03:23:00Z'))).toBe('12 min')
    expect(clearingLeft(clears, at('2026-08-31T03:34:30Z'))).toBe('under a minute')
  })

  it('says what is happening in words that are true of it: details removed, not the event', () => {
    const now = at('2026-06-02T13:35:00Z')
    expect(clearingLine({ state: 'counting', at: clears }, now)).toBe('Names and contact details removed in 89 days 14 hrs')
    expect(clearingLine({ state: 'due', at: clears }, now)).toBe('Names and contact details removed tonight')
    expect(clearingLine({ state: 'cleared' }, now)).toBe('Names and contact details removed')
    expect(clearingLine({ state: 'kept' }, now)).toBeNull()
    expect(clearingLine(null, now)).toBeNull()
  })
})
