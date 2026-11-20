import { describe, expect, it } from 'vitest'
import { answersAreClosed, answersCloseAt, availabilityClosesAt, closesWords, deadlineWords, hoursWords } from './availabilityDeadline'
import later from '../../../supabase/migrations/0310_reminders_follow_the_deadline.sql?raw'
import migration from '../../../supabase/migrations/0309_answers_can_close_hours_before_the_service.sql?raw'

const LONDON = 'Europe/London'
const at = (iso: string) => new Date(iso).getTime()

describe('when answers are due', () => {
  /*
   * The headline: a Sunday morning service is answered for by Saturday
   * night, not from the car park on the way in.
   */
  it('closes the night before a Sunday service', () => {
    // 13 September 2026 is a Sunday; British Summer Time, so 23:59 there
    // is 22:59 in UTC.
    expect(availabilityClosesAt('2026-09-13', '23:59', LONDON).toISOString()).toBe(
      '2026-09-12T22:59:00.000Z',
    )
  })

  it('gets the hour right in winter, when the clocks have gone back', () => {
    // January: no summer time, so 23:59 in London is 23:59 in UTC. A
    // fixed offset would be an hour out for half the year.
    expect(availabilityClosesAt('2026-01-11', '23:59', LONDON).toISOString()).toBe(
      '2026-01-10T23:59:00.000Z',
    )
  })

  /*
   * Not a fixed weekday. A Saturday service closes on Friday and a
   * Wednesday prayer meeting on Tuesday, rather than everything closing
   * the previous Saturday — which for the Wednesday would be four days
   * early.
   */
  it('closes the night before whatever day the service is on', () => {
    expect(availabilityClosesAt('2026-09-12', '23:59', LONDON).toISOString()).toBe(
      '2026-09-11T22:59:00.000Z',
    )
    expect(availabilityClosesAt('2026-09-16', '23:59', LONDON).toISOString()).toBe(
      '2026-09-15T22:59:00.000Z',
    )
  })

  it('steps back over the turn of a month', () => {
    // The night before the first is the last night of the month before.
    expect(availabilityClosesAt('2026-03-01', '23:59', LONDON).toISOString()).toBe(
      '2026-02-28T23:59:00.000Z',
    )
    expect(availabilityClosesAt('2026-01-01', '23:59', LONDON).toISOString()).toBe(
      '2025-12-31T23:59:00.000Z',
    )
  })

  it('honours a church that closes its answers earlier', () => {
    expect(availabilityClosesAt('2026-09-13', '18:00', LONDON).toISOString()).toBe(
      '2026-09-12T17:00:00.000Z',
    )
  })

  it('reads the clock of whatever country the church is in', () => {
    // India is five and a half hours ahead, so Saturday 23:59 there is
    // Saturday evening in UTC.
    expect(availabilityClosesAt('2026-09-13', '23:59', 'Asia/Kolkata').toISOString()).toBe(
      '2026-09-12T18:29:00.000Z',
    )
  })

  /*
   * The night the clocks go forward, 01:00 does not exist in London. A
   * deadline set for then has to land somewhere sensible rather than an
   * hour out or on an invalid date.
   */
  it('survives the night the clocks change', () => {
    const closes = availabilityClosesAt('2026-03-30', '01:00', LONDON)
    expect(Number.isNaN(closes.getTime())).toBe(false)
    // 29 March 2026, 01:00 London — the hour that is skipped — resolves
    // to the same instant as 01:00 UTC, which is 02:00 BST.
    expect(closes.toISOString()).toBe('2026-03-29T01:00:00.000Z')
  })
})

describe('when the settings are not there', () => {
  /*
   * A build reading a row older than itself, or a row that has gone,
   * should put the cut-off where it shipped rather than take the page
   * down with it.
   */
  it('falls back to 23:59 in London rather than throwing', () => {
    expect(availabilityClosesAt('2026-09-13', undefined, undefined).toISOString()).toBe(
      '2026-09-12T22:59:00.000Z',
    )
    expect(availabilityClosesAt('2026-09-13', '', '  ').toISOString()).toBe(
      '2026-09-12T22:59:00.000Z',
    )
  })
})

describe('whether the moment has gone', () => {
  it('is open before it and closed after it', () => {
    const service = '2026-09-13'
    expect(answersAreClosed(service, '23:59', LONDON, at('2026-09-12T22:58:00Z'))).toBe(false)
    expect(answersAreClosed(service, '23:59', LONDON, at('2026-09-12T22:59:00Z'))).toBe(true)
    // And stays closed on the morning itself, which is the point.
    expect(answersAreClosed(service, '23:59', LONDON, at('2026-09-13T09:59:00Z'))).toBe(true)
  })
})

/*
 * The church can say the deadline the other way (0309): a number of hours
 * before the service begins, counted from its first session.
 */
describe('when answers are due, counted in hours', () => {
  const clock = { availability_closes_mode: 'clock' as const, availability_closes_hours: 6, availability_closes_time: '23:59', timezone: LONDON }
  const hours = { ...clock, availability_closes_mode: 'hours' as const }

  it('closes that many hours before the first session', () => {
    // 10:30 on Sunday 13 September, British Summer Time: 09:30Z. Six hours before is 03:30Z.
    expect(answersCloseAt('2026-09-13', '2026-09-13T09:30:00Z', hours).toISOString()).toBe('2026-09-13T03:30:00.000Z')
    // An evening service the same day closes that much later: the point of counting from the service.
    expect(answersCloseAt('2026-09-13', '2026-09-13T17:00:00Z', hours).toISOString()).toBe('2026-09-13T11:00:00.000Z')
    // Two days ahead is allowed, which the night before never was.
    expect(answersCloseAt('2026-09-13', '2026-09-13T09:30:00Z', { ...hours, availability_closes_hours: 48 }).toISOString()).toBe('2026-09-11T09:30:00.000Z')
  })

  it('is not moved by the time kept for the night before, or by the time zone', () => {
    const a = answersCloseAt('2026-09-13', '2026-09-13T09:30:00Z', { ...hours, availability_closes_time: '18:00', timezone: 'Asia/Kolkata' })
    expect(a.toISOString()).toBe('2026-09-13T03:30:00.000Z')
  })

  it('keeps the night before for a service nobody has planned yet, so it is never open for ever', () => {
    for (const none of [null, undefined, '']) {
      expect(answersCloseAt('2026-09-13', none, hours).toISOString()).toBe('2026-09-12T22:59:00.000Z')
    }
  })

  it('is the night before whenever that is the rule, whatever the hours say', () => {
    expect(answersCloseAt('2026-09-13', '2026-09-13T09:30:00Z', clock).toISOString()).toBe('2026-09-12T22:59:00.000Z')
    // A settings row older than the choice has no mode at all: the night before, as it always was.
    expect(answersCloseAt('2026-09-13', '2026-09-13T09:30:00Z', { availability_closes_time: '23:59', timezone: LONDON }).toISOString()).toBe('2026-09-12T22:59:00.000Z')
  })

  it('falls back to twelve hours when the number is missing or not one', () => {
    for (const bad of [null, undefined, -1, Number.NaN]) {
      expect(answersCloseAt('2026-09-13', '2026-09-13T09:30:00Z', { ...hours, availability_closes_hours: bad }).toISOString()).toBe('2026-09-12T21:30:00.000Z')
    }
  })

  it('says it in words', () => {
    expect(hoursWords(1)).toBe('1 hour')
    expect(hoursWords(6)).toBe('6 hours')
    expect(hoursWords(24)).toBe('1 day')
    expect(hoursWords(30)).toBe('1 day 6 hours')
    expect(hoursWords(168)).toBe('7 days')
    expect(closesWords(clock)).toBe('the night before')
    expect(closesWords(hours)).toBe('6 hours before the service')
    expect(closesWords(hours, '2026-09-13T09:30:00Z')).toBe('6 hours before the service')
    // A service with no running order closes the night before whatever the rule: the words say so.
    expect(closesWords(hours, null)).toBe('the night before')
  })
})

/*
 * The database decides (0309); the page only says the same before a
 * button is pressed. These hold the two to one rule.
 */
describe('the rule the database enforces (0309)', () => {
  const sql = migration.replace(/\s+/g, ' ')

  it('counts hours back from the first session, and only when that is the mode', () => {
    expect(sql).toContain("when a.availability_closes_mode = 'hours' then coalesce( (select min(ss.start_time) from public.service_sessions ss where ss.service_id = s.id) - make_interval(hours => a.availability_closes_hours),")
  })

  it('falls back to the night before, in both branches, by the same expression', () => {
    const eve = "((s.date - 1) + coalesce(a.availability_closes_time, time '23:59')) at time zone public.church_timezone()"
    expect(sql.split(eve).length - 1).toBe(2)
  })

  it('allows the same choices the app offers, and starts where it always was', () => {
    expect(sql).toContain("availability_closes_mode text not null default 'clock'")
    expect(sql).toContain("check (availability_closes_mode in ('clock', 'hours'))")
    expect(sql).toContain('availability_closes_hours integer not null default 12')
    expect(sql).toContain('check (availability_closes_hours between 1 and 168)')
  })
})

/*
 * 0310: answers may close when the service begins, and one service may
 * have a deadline of its own.
 */
describe('when answers are due: at the start, or by the service’s own deadline (0310)', () => {
  const hours = { availability_closes_mode: 'hours' as const, availability_closes_hours: 6, availability_closes_time: '23:59', timezone: LONDON }
  const clock = { ...hours, availability_closes_mode: 'clock' as const }
  const own = '2026-09-11T17:00:00.000Z'

  it('closes when the first session starts at 0 hours — 0 is a number, not a missing one', () => {
    expect(answersCloseAt('2026-09-13', '2026-09-13T09:30:00Z', { ...hours, availability_closes_hours: 0 }).toISOString()).toBe('2026-09-13T09:30:00.000Z')
    expect(closesWords({ ...hours, availability_closes_hours: 0 })).toBe('when the service begins')
  })

  it('is the service’s own deadline wherever it has one, whichever rule the church keeps', () => {
    expect(answersCloseAt('2026-09-13', '2026-09-13T09:30:00Z', hours, own).toISOString()).toBe(own)
    expect(answersCloseAt('2026-09-13', '2026-09-13T09:30:00Z', clock, own).toISOString()).toBe(own)
    // …and for one nobody has planned yet.
    expect(answersCloseAt('2026-09-13', null, hours, own).toISOString()).toBe(own)
  })

  it('is the rule again when the deadline is taken away, or is not a moment at all', () => {
    for (const none of [null, undefined, '', 'nonsense']) {
      expect(answersCloseAt('2026-09-13', '2026-09-13T09:30:00Z', hours, none).toISOString()).toBe('2026-09-13T03:30:00.000Z')
    }
  })

  it('says a deadline of its own as the moment it is', () => {
    expect(closesWords(hours, '2026-09-13T09:30:00Z', own)).toBe(`on ${deadlineWords(new Date(own))}`)
    expect(closesWords(clock, null, own)).toBe(`on ${deadlineWords(new Date(own))}`)
    expect(closesWords(clock, null, 'nonsense')).toBe('the night before')
  })
})

describe('the rule the database enforces, with a service’s own deadline first (0310)', () => {
  const sql = later.replace(/\s+/g, ' ')

  it('answers with the service’s own deadline before the church’s rule', () => {
    expect(sql).toContain("select coalesce( s.availability_closes_override, case")
    expect(sql).toContain("when a.availability_closes_mode = 'hours' then coalesce( (select min(ss.start_time) from public.service_sessions ss where ss.service_id = s.id) - make_interval(hours => a.availability_closes_hours),")
  })

  it('takes 0 hours, and a reminder from never to a week ahead', () => {
    expect(sql).toContain('check (availability_closes_hours between 0 and 168)')
    expect(sql).toContain('availability_reminder_hours integer not null default 24')
    expect(sql).toContain('check (availability_reminder_hours between 0 and 168)')
    expect(sql).toContain('availability_closed_notice boolean not null default true')
  })

  it('keeps both messages to waking hours, and runs on the hour', () => {
    expect(sql).toContain('if ahead = 0 or not public.church_is_awake() then return 0;')
    expect(sql).toContain("public.church_waking_moment(public.availability_closes_at(s.id) - make_interval(hours => ahead), 'earlier') <= now()")
    expect(sql).toContain("public.church_waking_moment(public.availability_closes_at(s.id), 'later') <= now()")
    expect(sql).toContain("cron.schedule('rim-availability-reminder', '0 * * * *',")
  })

  it('leaves the two that write to people out of everybody’s reach but the job’s', () => {
    expect(sql).toContain('revoke all on function public.notify_availability_closed() from public, anon, authenticated;')
    expect(sql).toContain('revoke all on function public.availability_closed_line(uuid, uuid) from public, anon, authenticated;')
  })
})
