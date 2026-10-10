import { describe, expect, it } from 'vitest'
import {
  daysAfter,
  defaultPollClear,
  feedbackGoneAt,
  pollClearProblem,
  serviceGoneAt,
  toLocalInput,
  untilText,
  updateEndProblem,
} from './expiry'

const NOW = new Date('2026-10-10T10:00:00').getTime()

describe('when things go', () => {
  it('writes a moment the way a date-and-time field holds it', () => {
    expect(toLocalInput(new Date('2026-11-09T18:30:00'))).toBe('2026-11-09T18:30')
  })

  it('says how long is left in the largest unit that means something', () => {
    expect(untilText(new Date(NOW + 29.9 * 86_400_000), NOW)).toBe('in 30 days')
    expect(untilText(new Date(NOW + 29.4 * 86_400_000), NOW)).toBe('in 29 days')
    expect(untilText(new Date(NOW + 30 * 3_600_000), NOW)).toBe('in 30 hours')
    expect(untilText(new Date(NOW + 90 * 60_000), NOW)).toBe('in 1 hour')
    expect(untilText(new Date(NOW + 12 * 60_000), NOW)).toBe('in 12 minutes')
    expect(untilText(new Date(NOW - 1), NOW)).toBe('now')
  })

  it('starts a poll’s clear time a week after its deadline, or after now without one', () => {
    expect(defaultPollClear('2026-10-12T18:00', new Date(NOW), 7)).toBe('2026-10-19T18:00')
    expect(defaultPollClear('', new Date(NOW), 7)).toBe(toLocalInput(daysAfter(new Date(NOW), 7)))
  })

  it('refuses a poll that clears before its deadline or in the past — the database’s own rule', () => {
    expect(pollClearProblem('2026-10-12T18:00', '2026-10-11T18:00', NOW)).toMatch(/before its deadline/)
    expect(pollClearProblem('', '2026-10-09T18:00', NOW)).toMatch(/future/)
    expect(pollClearProblem('', '', NOW)).toMatch(/Choose/)
    expect(pollClearProblem('2026-10-12T18:00', '2026-10-12T18:00', NOW)).toBeNull()
  })

  it('needs an update to end in the future and within a year', () => {
    expect(updateEndProblem('', NOW)).toMatch(/Choose/)
    expect(updateEndProblem('2026-10-09T10:00', NOW)).toMatch(/future/)
    expect(updateEndProblem('2027-12-01T10:00', NOW)).toMatch(/year/)
    expect(updateEndProblem('2026-11-10T10:00', NOW)).toBeNull()
  })

  it('deletes a service at the start of the day after its two weeks are up', () => {
    expect(toLocalInput(serviceGoneAt('2026-10-04', 14))).toBe('2026-10-19T00:00')
  })

  it('times settled feedback from when it was settled, and never times open or kept-for-ever feedback', () => {
    expect(feedbackGoneAt('2026-10-01T10:00:00Z', 14)?.toISOString()).toBe('2026-10-15T10:00:00.000Z')
    expect(feedbackGoneAt(null, 14)).toBeNull()
    expect(feedbackGoneAt('2026-10-01T10:00:00Z', null)).toBeNull()
  })
})
