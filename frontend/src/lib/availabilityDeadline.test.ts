import { describe, expect, it } from 'vitest'
import { answersAreClosed, availabilityClosesAt } from './availabilityDeadline'

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
