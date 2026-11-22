import { describe, expect, it } from 'vitest'
import { nextServiceToStart, startDay, startFace, startWords } from './serviceStart'
import type { ServiceStanding } from './serviceState'

const at = (iso: string) => new Date(iso).getTime()
const NOW = at('2026-11-22T09:30:00')
const row = (name: string, state: ServiceStanding['state'], from: string | null, to: string | null = null) => ({
  service: name,
  standing: { state, from: from ? at(from) : null, to: to ? at(to) : null },
})

describe('the service that starts next', () => {
  it('is today’s, before it has started', () => {
    const rows = [row('English', 'upcoming', '2026-11-22T10:00:00'), row('Next Sunday', 'upcoming', '2026-11-29T10:00:00')]
    expect(nextServiceToStart(rows, NOW)).toEqual({ service: 'English', at: at('2026-11-22T10:00:00') })
  })

  it('is the one after, once a service is running', () => {
    const rows = [
      row('English', 'running', '2026-11-22T09:00:00', '2026-11-22T10:30:00'),
      row('Malayalam', 'upcoming', '2026-11-22T11:00:00'),
      row('Next Sunday', 'upcoming', '2026-11-29T10:00:00'),
    ]
    expect(nextServiceToStart(rows, NOW)?.service).toBe('Malayalam')
  })

  it('is next week’s, when today’s are running or over', () => {
    const rows = [
      row('English', 'done', '2026-11-22T07:00:00', '2026-11-22T08:30:00'),
      row('Malayalam', 'running', '2026-11-22T09:00:00', '2026-11-22T10:30:00'),
      row('Next Sunday', 'upcoming', '2026-11-29T10:00:00'),
    ]
    expect(nextServiceToStart(rows, NOW)?.service).toBe('Next Sunday')
  })

  it('is the earliest, whatever order they come in', () => {
    const rows = [row('Later', 'upcoming', '2026-12-06T10:00:00'), row('Sooner', 'upcoming', '2026-11-29T10:00:00')]
    expect(nextServiceToStart(rows, NOW)?.service).toBe('Sooner')
  })

  it('passes over a service with no running order, and one whose start has gone by', () => {
    const rows = [row('Unplanned', 'unplanned', null), row('Just gone', 'upcoming', '2026-11-22T09:29:59'), row('Real', 'upcoming', '2026-11-29T10:00:00')]
    expect(nextServiceToStart(rows, NOW)?.service).toBe('Real')
  })

  it('is nothing when nothing is planned ahead', () => {
    expect(nextServiceToStart([], NOW)).toBeNull()
    expect(nextServiceToStart([row('English', 'running', '2026-11-22T09:00:00'), row('Old', 'done', '2026-11-15T10:00:00')], NOW)).toBeNull()
  })
})

describe('how long until a service starts, as a clock', () => {
  it('is minutes and seconds, then hours, as the session clock is', () => {
    expect(startFace(245_000)).toBe('4:05')
    expect(startFace(3_729_000)).toBe('1:02:09')
    expect(startFace(23 * 3_600_000 + 59 * 60_000 + 59_000)).toBe('23:59:59')
  })

  it('puts whole days in front once it is a day or more off', () => {
    expect(startFace(86_400_000)).toBe('1d 00:00:00')
    expect(startFace(6 * 86_400_000 + 14 * 3_600_000 + 22 * 60_000 + 31_000)).toBe('6d 14:22:31')
  })

  it('never goes below nothing', () => {
    expect(startFace(0)).toBe('0:00')
    expect(startFace(-5_000)).toBe('0:00')
  })
})

describe('how long until a service starts, in words', () => {
  it('says the two largest parts', () => {
    expect(startWords(6 * 86_400_000 + 14 * 3_600_000 + 22 * 60_000)).toBe('6 days 14 hours')
    expect(startWords(86_400_000)).toBe('1 day')
    expect(startWords(3_729_000)).toBe('1 hour 2 minutes')
    expect(startWords(3_600_000)).toBe('1 hour')
    expect(startWords(245_000)).toBe('4 minutes')
    expect(startWords(60_000)).toBe('1 minute')
    expect(startWords(59_000)).toBe('under a minute')
    expect(startWords(-1)).toBe('under a minute')
  })
})

describe('which day a service starts, beside its time', () => {
  it('says nothing for today, tomorrow for tomorrow, a weekday inside the week, a date beyond it', () => {
    expect(startDay(at('2026-11-22T11:00:00'), NOW)).toBe('')
    expect(startDay(at('2026-11-23T10:00:00'), NOW)).toBe('tomorrow')
    // Whatever this device calls it, it is a whole weekday name and nothing else.
    expect(startDay(at('2026-11-26T10:00:00'), NOW)).toBe(new Date(at('2026-11-26T10:00:00')).toLocaleDateString(undefined, { weekday: 'long' }))
    const far = startDay(at('2026-11-29T10:00:00'), NOW)
    expect(far).toMatch(/29/)
    expect(far).toBe(new Date(at('2026-11-29T10:00:00')).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }))
  })

  it('goes by the calendar day, not by twenty-four hours', () => {
    // Half past nine tonight to one in the morning is tomorrow, three and a half hours off.
    expect(startDay(at('2026-11-23T01:00:00'), at('2026-11-22T21:30:00'))).toBe('tomorrow')
    expect(startDay(at('2026-11-22T23:59:00'), at('2026-11-22T00:01:00'))).toBe('')
  })
})
